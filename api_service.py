import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from redis import Redis
from rq import Queue
from rq.job import Job

from config import get_settings
from database import get_db
from models import Merchant, Task, TaskStatus, UploadRecord
from schemas import (
    AgentComposeRequest,
    PresignedUploadRequest,
    UploadConfirmRequest,
    TaskCancelRequest,
)
from auth import verify_api_key
from quota import check_quota, check_concurrent_limit, reserve_quota, refund_quota
from oss import ensure_bucket, generate_oss_key, presigned_put_url, presigned_get_url, get_object_info

from admin_api import router as admin_router

settings = get_settings()
app = FastAPI(title="RJCut Commercial API", version="1.0.0")
app.include_router(admin_router)


def ok(data=None, trace_id=None):
    return {"code": 0, "message": "ok", "data": data, "trace_id": trace_id}


def fail(code: int, message: str, trace_id=None, status_code: int = 400):
    return JSONResponse(
        status_code=status_code,
        content={"code": code, "message": message, "trace_id": trace_id},
    )


def get_redis():
    return Redis.from_url(settings.REDIS_URL)


def get_queue():
    return Queue(settings.RQ_QUEUE_NAME, connection=get_redis())


@app.on_event("startup")
def on_startup():
    ensure_bucket()


@app.get("/health")
def health():
    return ok({"status": "ok"})


@app.get("/v1/merchant/info")
def get_merchant_info(
    merchant: Merchant = Depends(verify_api_key),
):
    return ok({
        "merchant_id": merchant.id,
        "name": merchant.name,
        "email": merchant.email,
        "status": merchant.status.value,
        "quota_total": merchant.quota_total,
        "quota_used": merchant.quota_used,
        "quota_reserved": merchant.quota_reserved,
        "quota_available": merchant.quota_available,
        "cost_per_task": merchant.cost_per_task,
        "rate_limit_per_minute": merchant.rate_limit_per_minute,
        "max_concurrent_tasks": merchant.max_concurrent_tasks,
        "created_at": merchant.created_at.isoformat() if merchant.created_at else None,
    })


@app.post("/v1/uploads/presign")
def create_presign(
    req: PresignedUploadRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    oss_key = generate_oss_key(merchant.id, req.purpose, req.filename)
    upload_url = presigned_put_url(oss_key, expires=3600)

    record = UploadRecord(
        merchant_id=merchant.id,
        original_filename=req.filename,
        oss_key=oss_key,
        content_type=req.content_type,
        upload_type="presigned",
        presigned_url=upload_url,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return ok({
        "upload_id": record.id,
        "upload_url": upload_url,
        "oss_key": oss_key,
        "method": "PUT",
        "expires_in": 3600,
    })


@app.post("/v1/uploads/confirm")
def confirm_upload(
    req: UploadConfirmRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    record = (
        db.query(UploadRecord)
        .filter(UploadRecord.id == req.upload_id, UploadRecord.merchant_id == merchant.id)
        .first()
    )
    if not record:
        return fail(40400, "upload record not found", status_code=404)

    info = get_object_info(record.oss_key)
    if not info:
        return fail(40401, "uploaded object not found", status_code=404)

    record.is_confirmed = True
    record.size_bytes = info["size"]
    db.add(record)
    db.commit()

    return ok({
        "upload_id": record.id,
        "oss_key": record.oss_key,
        "size": record.size_bytes,
        "confirmed": True,
    })


@app.post("/v1/tasks/agent-compose")
def create_agent_compose_task(
    req: AgentComposeRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    trace_id = "trace_" + uuid.uuid4().hex[:16]
    task_id = "task_" + uuid.uuid4().hex[:16]

    if not check_quota(merchant):
        return fail(40201, "insufficient quota", trace_id=trace_id, status_code=402)

    if not check_concurrent_limit(db, merchant):
        return fail(42901, "concurrent task limit reached", trace_id=trace_id, status_code=429)

    timeout = req.timeout_seconds or settings.TASK_TIMEOUT_SECONDS

    task = Task(
        id=task_id,
        merchant_id=merchant.id,
        trace_id=trace_id,
        client_ref_id=req.client_ref_id,
        task_type="agent_compose",
        status=TaskStatus.queued,
        payload=req.model_dump(),
        timeout_seconds=timeout,
        progress=0,
        stage="queued",
    )

    db.add(task)
    db.flush()
    reserve_quota(db, merchant, task)

    queue = get_queue()
    job = queue.enqueue(
        "task_runner.run_agent_compose_task",
        task_id=task_id,
        payload=req.model_dump(),
        trace_id=trace_id,
        merchant_id=merchant.id,
        job_id=f"rjcut:{task_id}",
        job_timeout=timeout + 60,
        result_ttl=86400,
        failure_ttl=86400,
    )

    task.rq_job_id = job.id
    db.add(task)
    db.commit()

    return ok({
        "task_id": task_id,
        "task_type": "agent_compose",
        "status": "queued",
        "trace_id": trace_id,
        "estimated_seconds": 180,
    }, trace_id=trace_id)


@app.get("/v1/tasks")
def query_tasks(
    status: str = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    query = db.query(Task).filter(Task.merchant_id == merchant.id)
    if status:
        query = query.filter(Task.status == status)

    total = query.count()
    tasks = query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()

    return ok({
        "items": [
            {
                "task_id": t.id,
                "task_type": t.task_type,
                "status": t.status.value,
                "progress": t.progress,
                "stage": t.stage,
                "client_ref_id": t.client_ref_id,
                "cost": t.cost,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None,
                "error": t.error,
            }
            for t in tasks
        ],
        "count": len(tasks),
        "total": total,
    })


@app.get("/v1/tasks/{task_id}")
def query_task(
    task_id: str,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id, Task.merchant_id == merchant.id).first()
    if not task:
        return fail(40400, "task not found", status_code=404)

    return ok({
        "task_id": task.id,
        "task_type": task.task_type,
        "status": task.status.value,
        "progress": task.progress,
        "stage": task.stage,
        "client_ref_id": task.client_ref_id,
        "cost": task.cost,
        "trace_id": task.trace_id,
        "result": task.result,
        "error": task.error,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "finished_at": task.finished_at.isoformat() if task.finished_at else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    })


@app.post("/v1/tasks/{task_id}/cancel")
def cancel_task(
    task_id: str,
    req: TaskCancelRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id, Task.merchant_id == merchant.id).first()
    if not task:
        return fail(40400, "task not found", status_code=404)

    if task.status not in [TaskStatus.queued, TaskStatus.processing]:
        return fail(40900, f"cannot cancel task in status {task.status.value}", status_code=409)

    redis_conn = get_redis()
    redis_conn.setex(f"task:cancel:{task_id}", 86400, "1")

    if task.rq_job_id:
        try:
            job = Job.fetch(task.rq_job_id, connection=redis_conn)
            if job.get_status() == "queued":
                job.cancel()
        except Exception:
            pass

    task.status = TaskStatus.cancelled
    task.stage = "cancelled"
    task.error = req.reason or "cancelled by user"
    task.finished_at = datetime.now(timezone.utc)
    db.add(task)
    refund_quota(db, task, reason=req.reason or "cancelled by user")
    db.commit()

    return ok({
        "task_id": task.id,
        "status": task.status.value,
    })


@app.get("/v1/tasks/{task_id}/files/{file_key}")
def get_task_file_download_url(
    task_id: str,
    file_key: str,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id, Task.merchant_id == merchant.id).first()
    if not task:
        return fail(40400, "task not found", status_code=404)

    result = task.result or {}
    files = result.get("files") or {}
    file_info = files.get(file_key)
    if not file_info:
        return fail(40401, f"file key not found: {file_key}", status_code=404)

    oss_key = file_info.get("oss_key")
    if not oss_key:
        return fail(40402, f"file not ready: {file_key}", status_code=404)

    filename = file_info.get("filename") or file_key
    download_url = presigned_get_url(oss_key, expires=3600, filename=filename)

    return ok({
        "download_url": download_url,
        "expires_in": 3600,
    })