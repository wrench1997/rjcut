import uuid
from datetime import datetime, timezone

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
    AgentDraftRequest,
    DraftUpdateRequest,
    DraftAiCorrectRequest,
    ComposeFromDraftRequest,
    VisualScriptEditorRequest,
    VisualScriptEditorResponse,
)
from auth import verify_api_key
from quota import check_quota, check_concurrent_limit, reserve_quota, refund_quota
from oss import (
    ensure_bucket, 
    generate_oss_key, 
    presigned_put_url, 
    presigned_get_url, 
    get_object_info,
    calculate_file_hash,
    find_existing_file_by_hash,
    delete_expired_files,
    get_storage_stats,
)

from admin_api import router as admin_router
from api_digital_human import router as dh_router
from api_ai_copywriting import router as ai_copywriting_router

from draft_utils import (
    apply_corrections_to_editable_script,
    simple_ai_correct_text,
    ai_generate_script_via_gateway,
    ai_recommend_templates_via_gateway,
    ai_analyze_videos_via_gateway,
    ai_generate_template_via_gateway,
)

from batch_validator import BatchTaskValidator, validate_batch_config_file

import json
from typing import Optional
from fastapi import FastAPI, Depends, Query, Request
from sqlalchemy import cast, String
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware


settings = get_settings()
app = FastAPI(title="RJCut Commercial API", version="1.0.0")

# 配置 CORS 中间件，允许跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://192.168.166.8:3000",  # 局域网前端地址
        "http://192.168.166.8",
        "*",  # 允许所有来源（开发环境），生产环境建议限制具体域名
    ],
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有 HTTP 方法
    allow_headers=["*"],  # 允许所有 HTTP 头
)

app.include_router(admin_router)
app.include_router(dh_router)
app.include_router(ai_copywriting_router)

# 🖼️ 单独注册不需要认证的代理图片接口（在 router 之后注册，覆盖需要认证版本）
from api_digital_human import proxy_image_no_auth
app.get("/v1/dh/proxy-image", include_in_schema=False)(proxy_image_no_auth)


@app.exception_handler(UnicodeDecodeError)
async def unicode_decode_exception_handler(request: Request, exc: UnicodeDecodeError):
    return JSONResponse(
        status_code=400,
        content={
            "code": 40001,
            "message": f"请求体编码错误，仅支持 UTF-8 格式 JSON。详情: {str(exc)}",
            "trace_id": None
        },
    )


@app.exception_handler(json.JSONDecodeError)
async def json_decode_exception_handler(request: Request, exc: json.JSONDecodeError):
    return JSONResponse(
        status_code=400,
        content={
            "code": 40002,
            "message": f"无效的 JSON 格式。详情: {str(exc)}",
            "trace_id": None
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=400,
        content={
            "code": 40003,
            "message": f"参数校验失败: {exc.errors()}",
            "trace_id": None
        },
    )


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


def merge_editable_script_segments(old_script: dict, new_script: dict):
    """
    按 segment.id 合并 editable_script。
    - 新提交的字段优先
    - 原有 segment 的 part_file / start / end / duration / scene_file 等元数据默认保留
    - 如果只提交部分 segments，则仅更新这些 segment，不会把其他 segment 丢掉
    """
    old_segments = (old_script or {}).get("segments") or []
    new_segments = (new_script or {}).get("segments") or []

    if not old_segments:
        return {"segments": new_segments}

    old_map = {}
    old_order = []
    for seg in old_segments:
        seg_id = seg.get("id")
        if seg_id is not None:
            old_map[seg_id] = dict(seg)
            old_order.append(seg_id)

    new_map = {}
    new_order = []
    for seg in new_segments:
        seg_id = seg.get("id")
        if seg_id is None:
            continue
        new_map[seg_id] = dict(seg)
        new_order.append(seg_id)

    merged_segments = []

    handled_ids = set()
    for seg_id in old_order:
        old_seg = old_map.get(seg_id, {})
        if seg_id in new_map:
            merged = dict(old_seg)
            merged.update(new_map[seg_id])
            merged_segments.append(merged)
        else:
            merged_segments.append(old_seg)
        handled_ids.add(seg_id)

    for seg_id in new_order:
        if seg_id not in handled_ids:
            merged_segments.append(new_map[seg_id])

    return {"segments": merged_segments}


def normalize_editable_script_after_update(editable_script: dict):
    if not editable_script or not isinstance(editable_script, dict):
        return {"segments": []}

    segments = editable_script.get("segments")
    if not isinstance(segments, list):
        editable_script["segments"] = []

    return editable_script

def normalize_editable_script_after_update(editable_script: dict):
    """
    做一层稳妥清洗，保证 segments 至少是 list。
    """
    if not editable_script or not isinstance(editable_script, dict):
        return {"segments": []}

    segments = editable_script.get("segments")
    if not isinstance(segments, list):
        editable_script["segments"] = []

    return editable_script


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
    """
    创建预签名上传 URL
    
    支持文件 hash 去重：如果同一商户上传过相同 hash 的文件，
    可直接返回已有文件的下载 URL，无需重复上传。
    """
    settings = get_settings()
    
    # 如果提供了文件 hash，先检查是否已存在
    if req.file_hash and settings.FILE_ENABLE_DEDUPLICATION:
        existing = find_existing_file_by_hash(db, merchant.id, req.file_hash)
        if existing:
            # 文件已存在，直接返回已有文件的下载 URL
            download_url = presigned_get_url(existing.oss_key, expires=3600, filename=existing.original_filename)
            return ok({
                "upload_id": existing.id,
                "oss_key": existing.oss_key,
                "download_url": download_url,
                "is_duplicate": True,
                "message": "文件已存在，无需重复上传",
                "original_upload_time": existing.created_at.isoformat(),
            })
    
    # 计算过期时间
    from datetime import timedelta
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.FILE_STORAGE_DAYS)
    
    # 生成新的上传 URL
    oss_key = generate_oss_key(merchant.id, req.purpose, req.filename, req.file_hash)
    upload_url = presigned_put_url(oss_key, expires=3600)

    record = UploadRecord(
        merchant_id=merchant.id,
        original_filename=req.filename,
        oss_key=oss_key,
        content_type=req.content_type,
        upload_type="presigned",
        presigned_url=upload_url,
        file_hash=req.file_hash,  # 记录文件 hash
        expires_at=expires_at,  # 设置过期时间
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
        "is_duplicate": False,
        "storage_expires_at": expires_at.isoformat(),
    })


@app.post("/v1/uploads/confirm")
def confirm_upload(
    req: UploadConfirmRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    """
    确认上传完成
    
    如果上传时未提供 file_hash，这里会计算并检查是否重复。
    如果是重复文件，会清理新上传的文件并返回已有文件信息。
    """
    settings = get_settings()
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

    # 🟢 严格限制文件大小
    MAX_FILE_SIZE = settings.FILE_MAX_SIZE_MB * 1024 * 1024
    if info["size"] > MAX_FILE_SIZE:
        # 删除超限文件
        from oss import get_minio_client
        client = get_minio_client()
        client.remove_object(settings.MINIO_BUCKET, record.oss_key)
        db.delete(record)
        db.commit()
        return fail(41300, f"文件过大 ({(info['size']/1024/1024):.1f}MB)，限制为 {settings.FILE_MAX_SIZE_MB}MB", status_code=413)

    # 如果还没有 hash，尝试计算（适用于本地上传场景）
    # 注意：presigned 上传时文件不在服务器，无法计算 hash
    # 所以 hash 应该在客户端计算后通过 presign 请求传入
    record.is_confirmed = True
    record.size_bytes = info["size"]
    
    # 如果记录中没有 hash 且启用了去重，需要检查是否有其他相同 hash 的文件
    if not record.file_hash and settings.FILE_ENABLE_DEDUPLICATION:
        # 这种情况理论上不应该发生，因为 hash 应该在 presign 时提供
        # 但为了兼容旧逻辑，不做处理
        pass
    
    db.add(record)
    db.commit()

    response_data = {
        "upload_id": record.id,
        "oss_key": record.oss_key,
        "size": record.size_bytes,
        "confirmed": True,
        "file_hash": record.file_hash,
        "expires_at": record.expires_at.isoformat() if record.expires_at else None,
    }

    return ok(response_data)


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
        job_id=f"rjcut_{task_id}",
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


@app.post("/v1/tasks/agent-draft")
def create_agent_draft_task(
    req: AgentDraftRequest,
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
        task_type="agent_draft",
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
        "task_runner.run_agent_draft_task",
        task_id=task_id,
        payload=req.model_dump(),
        trace_id=trace_id,
        merchant_id=merchant.id,
        job_id=f"rjcut_{task_id}",
        job_timeout=timeout + 60,
        result_ttl=86400,
        failure_ttl=86400,
    )

    task.rq_job_id = job.id
    db.add(task)
    db.commit()

    return ok({
        "task_id": task_id,
        "task_type": "agent_draft",
        "status": "queued",
        "trace_id": trace_id,
        "estimated_seconds": 180,
    }, trace_id=trace_id)


@app.get("/v1/drafts/{task_id}")
def get_draft_detail(
    task_id: str,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.merchant_id == merchant.id
    ).first()
    if not task:
        return fail(40400, "task not found", status_code=404)

    if task.task_type != "agent_draft":
        return fail(40004, "task is not a draft task", status_code=400)

    result = task.result or {}
    draft = result.get("draft") or {}
    parts = draft.get("parts") or {}

    return ok({
        "task_id": task.id,
        "status": task.status.value,
        "trace_id": task.trace_id,
        "editable_script": draft.get("editable_script"),
        "timeline": draft.get("timeline"),
        "transcription": draft.get("transcription"),
        "corrections": draft.get("corrections") or [],
        "scene_assets": draft.get("scene_assets") or {},
        "parts": parts,
        "parts_count": draft.get("parts_count", len(parts)),
        "files": result.get("files") or {},
        "error": task.error,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "finished_at": task.finished_at.isoformat() if task.finished_at else None,
    }, trace_id=task.trace_id)


@app.post("/v1/drafts/{task_id}/update")
def update_draft(
    task_id: str,
    req: DraftUpdateRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.merchant_id == merchant.id
    ).first()
    if not task:
        return fail(40400, "task not found", status_code=404)

    if task.task_type != "agent_draft":
        return fail(40004, "task is not a draft task", status_code=400)

    result = task.result or {}
    draft = result.get("draft") or {}

    old_editable_script = draft.get("editable_script") or {"segments": []}
    editable_script = old_editable_script
    corrections = draft.get("corrections") or []

    if req.editable_script is not None:
        new_editable_script = req.editable_script.model_dump()

        if req.replace_mode == "replace":
            editable_script = normalize_editable_script_after_update(new_editable_script)
        else:
            editable_script = merge_editable_script_segments(old_editable_script, new_editable_script)
            editable_script = normalize_editable_script_after_update(editable_script)

    if req.corrections is not None:
        corrections = [item.model_dump() for item in req.corrections]
        editable_script = apply_corrections_to_editable_script(editable_script, corrections)
        editable_script = normalize_editable_script_after_update(editable_script)

    draft["editable_script"] = editable_script
    draft["corrections"] = corrections
    result["draft"] = draft

    task.result = result
    db.add(task)
    db.commit()
    db.refresh(task)

    return ok({
        "task_id": task.id,
        "editable_script": editable_script,
        "corrections": corrections,
        "replace_mode": req.replace_mode,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }, trace_id=task.trace_id)


@app.post("/v1/drafts/{task_id}/ai-correct")
def ai_correct_draft(
    task_id: str,
    req: DraftAiCorrectRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.merchant_id == merchant.id
    ).first()
    if not task:
        return fail(40400, "task not found", status_code=404)

    if task.task_type != "agent_draft":
        return fail(40004, "task is not a draft task", status_code=400)

    result = task.result or {}
    draft = result.get("draft") or {}

    editable_script = draft.get("editable_script") or {"segments": []}
    segments = editable_script.get("segments") or []

    corrected_segments = []
    all_changes = []

    for seg in segments:
        seg_copy = dict(seg)
        text = seg_copy.get("text")
        if text:
            corrected_text, changes = simple_ai_correct_text(
                text,
                mode=req.mode,
                prompt=req.prompt,
            )
            seg_copy["text"] = corrected_text
            if changes:
                for c in changes:
                    c["segment_id"] = seg_copy.get("id")
                all_changes.extend(changes)
        corrected_segments.append(seg_copy)

    editable_script["segments"] = corrected_segments
    draft["editable_script"] = editable_script
    draft["ai_corrections"] = all_changes
    result["draft"] = draft

    task.result = result
    db.add(task)
    db.commit()
    db.refresh(task)

    return ok({
        "task_id": task.id,
        "editable_script": editable_script,
        "ai_corrections": all_changes,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }, trace_id=task.trace_id)


@app.post("/v1/tasks/compose-from-draft")
def create_compose_from_draft_task(
    req: ComposeFromDraftRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    trace_id = "trace_" + uuid.uuid4().hex[:16]
    task_id = "task_" + uuid.uuid4().hex[:16]

    if not check_quota(merchant):
        return fail(40201, "insufficient quota", trace_id=trace_id, status_code=402)

    if not check_concurrent_limit(db, merchant):
        return fail(42901, "concurrent task limit reached", trace_id=trace_id, status_code=429)

    draft_task = db.query(Task).filter(
        Task.id == req.draft_task_id,
        Task.merchant_id == merchant.id
    ).first()
    if not draft_task:
        return fail(40400, "draft task not found", trace_id=trace_id, status_code=404)

    if draft_task.task_type != "agent_draft":
        return fail(40004, "draft task is not an agent_draft task", trace_id=trace_id, status_code=400)

    if draft_task.status != TaskStatus.succeeded:
        return fail(40901, "draft task is not ready", trace_id=trace_id, status_code=409)

    timeout = req.timeout_seconds or settings.TASK_TIMEOUT_SECONDS

    task = Task(
        id=task_id,
        merchant_id=merchant.id,
        trace_id=trace_id,
        client_ref_id=req.client_ref_id,
        task_type="compose_from_draft",
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
        "task_runner.run_compose_from_draft_task",
        task_id=task_id,
        payload=req.model_dump(),
        trace_id=trace_id,
        merchant_id=merchant.id,
        job_id=f"rjcut_{task_id}",
        job_timeout=timeout + 60,
        result_ttl=86400,
        failure_ttl=86400,
    )

    task.rq_job_id = job.id
    db.add(task)
    db.commit()

    return ok({
        "task_id": task_id,
        "task_type": "compose_from_draft",
        "status": "queued",
        "trace_id": trace_id,
        "source_draft_task_id": req.draft_task_id,
        "estimated_seconds": 180,
    }, trace_id=trace_id)


@app.get("/v1/tasks")
def query_tasks(
    status: str = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    person_id: str = Query(None, description="按数字人 ID 筛选（仅对 dh_generate 类型任务有效）"),
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    import logging
    logger = logging.getLogger("uvicorn.error")
    
    query = db.query(Task).filter(Task.merchant_id == merchant.id)
    if status:
        query = query.filter(Task.status == status)
    # 按数字人 ID 筛选：从 payload 中查找 person_id
    if person_id:
        try:
            # 使用 cast 将 JSON 字段转换为字符串进行比较，兼容 PostgreSQL 和 SQLite
            query = query.filter(cast(Task.payload["person_id"], String) == person_id)
        except Exception as e:
            logger.error(f"查询 person_id 时出错：{e}")
            # 如果 JSON 查询失败，返回空结果而不是 500 错误
            return ok({
                "items": [],
                "count": 0,
                "total": 0,
            })

    try:
        total = query.count()
        tasks = query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()
    except Exception as e:
        logger.error(f"查询任务时出错：{e}")
        return ok({
            "items": [],
            "count": 0,
            "total": 0,
        })

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


@app.post("/v1/admin/storage/cleanup")
def cleanup_expired_files(
    batch_size: int = Query(100, ge=1, le=1000),
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    """
    清理过期的上传文件（需要管理员权限）
    
    注意：此接口仅供内部管理使用，应该通过 admin API key 调用
    """
    # TODO: 这里应该添加管理员权限检查
    # if not merchant.is_admin:
    #     return fail(40300, "admin access required", status_code=403)
    
    result = delete_expired_files(db, batch_size=batch_size)
    
    return ok({
        "deleted_count": result["deleted_count"],
        "freed_bytes": result["freed_bytes"],
        "freed_mb": result["freed_bytes"] / 1024 / 1024,
    })


@app.get("/v1/admin/storage/stats")
def get_storage_statistics(
    merchant_id: Optional[str] = Query(None),
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    """
    获取存储统计信息
    
    如果不提供 merchant_id，则返回全局统计（需要管理员权限）
    如果提供 merchant_id，则返回指定商户的统计
    """
    # 如果不是查询自己的数据，需要管理员权限
    if merchant_id and merchant_id != merchant.id:
        # TODO: 添加管理员权限检查
        # if not merchant.is_admin:
        #     return fail(40300, "admin access required", status_code=403)
        pass
    
    stats = get_storage_stats(db, merchant_id=merchant_id or merchant.id)
    
    return ok(stats)


@app.get("/v1/uploads/list")
def list_uploads(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: str = Query(None, description="confirmed or pending"),
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    """
    查询当前商户的上传记录列表
    """
    from models import UploadRecord
    
    query = db.query(UploadRecord).filter(UploadRecord.merchant_id == merchant.id)
    
    if status == "confirmed":
        query = query.filter(UploadRecord.is_confirmed == True)
    elif status == "pending":
        query = query.filter(UploadRecord.is_confirmed == False)
    
    total = query.count()
    records = query.order_by(UploadRecord.created_at.desc()).offset(offset).limit(limit).all()
    
    return ok({
        "items": [
            {
                "upload_id": r.id,
                "filename": r.original_filename,
                "oss_key": r.oss_key,
                "size_bytes": r.size_bytes,
                "size_mb": (r.size_bytes or 0) / 1024 / 1024,
                "content_type": r.content_type,
                "file_hash": r.file_hash,
                "is_confirmed": r.is_confirmed,
                "expires_at": r.expires_at.isoformat() if r.expires_at else None,
                "created_at": r.created_at.isoformat(),
            }
            for r in records
        ],
        "count": len(records),
        "total": total,
    })


@app.post("/v1/batch/validate")
def validate_batch_configuration(
    config: dict,
    merchant: Merchant = Depends(verify_api_key),
):
    """
    验证批量处理配置
    
    检查任务配置中的必需文件和可选文件，返回详细的验证报告
    
    请求体示例：
    ```json
    {
      "tasks": [
        {
          "name": "video1",
          "video_file": "./videos/video1.mp4",
          "script_file": "./scripts/video1.json",
          "corrections_file": "./corrections.json",
          "bgm_file": "./bgm.mp3",
          "scenes_dir": "./scenes"
        }
      ]
    }
    ```
    """
    try:
        validator = BatchTaskValidator(base_dir=settings.BASE_DIR)
        result = validator.validate_batch_config(config)
        
        return ok({
            "is_valid": result.is_valid,
            "total_tasks": result.total_tasks,
            "valid_tasks": result.valid_tasks,
            "invalid_tasks": result.invalid_tasks,
            "task_results": [r.to_dict() for r in result.task_results],
            "summary": result.summary,
        })
    except Exception as e:
        return fail(50000, f"验证失败：{str(e)}", status_code=500)


@app.get("/v1/batch/template")
def get_batch_config_template(
    merchant: Merchant = Depends(verify_api_key),
):
    """
    获取批量配置模板
    
    返回标准的 batch_config.json 模板，包含所有必需和可选字段说明
    """
    template = {
        "tasks": [
            {
                "name": "task_001",
                "video_file": "./videos/video1.mp4",
                "script_file": "./scripts/video1.json",
                "corrections_file": "./corrections.json",
                "bgm_file": "./bgm.mp3",
                "scenes_dir": "./scenes",
                "custom_config": {
                    "pipeline": {
                        "use_transitions": False,
                        "transition_duration": 0.8
                    },
                    "subtitle": {
                        "font_size": 88,
                        "effect": "ad"
                    },
                    "audio": {
                        "bgm_volume": 0.3,
                        "original_volume": 1.0
                    }
                }
            }
        ],
        "_schema": {
            "required_fields": {
                "video_file": "主视频文件路径 (MP4/MOV/AVI/MKV)",
                "script_file": "脚本文件路径 (JSON 格式，除非使用 scene_only 模式)"
            },
            "optional_fields": {
                "corrections_file": "纠错字典文件路径 (JSON 格式)",
                "bgm_file": "背景音乐文件路径 (MP3/WAV/M4A/AAC)",
                "scenes_dir": "场景素材目录路径",
                "custom_config": "自定义配置对象"
            },
            "notes": [
                "script_file 在 pipeline.mode='scene_only' 时可选",
                "建议提供 corrections_file 以提高字幕准确性",
                "建议提供 bgm_file 以提升视频质量"
            ]
        }
    }
    
    return ok(template)


# ============================================================
# AI 辅助接口（通过 Gateway 调用 vLLM）
# ============================================================

@app.post("/v1/ai/generate-script")
async def generate_script(
    request: Request,
    merchant: Merchant = Depends(verify_api_key),
):
    """
    AI 生成口播文案

    请求体：
    {
        "product_name": "产品名称",
        "selling_points": "核心卖点",
        "target_audience": "目标人群",
        "tone": "文案风格 (direct_sale/premium/social_review/explainer/shakespeare/...)",
        "custom_prompt": "创作者自定义的文案提示词（可选，如果提供则优先使用）",
        "template_structure": [...]  # 模板的 segments 结构
        # 鹿场直销风格专用字段（可选）：
        "comparison_product": "核心对比对象",
        "farm_scale": "鹿场规模",
        "identification_points": "想强调的辨别点",
        "call_to_action": "成交方式"
    }
    """
    try:
        body = await request.json()
        print(f"[DEBUG] 收到 AI 生成模板请求：{body}")
    except Exception as e:
        print(f"[ERROR] 解析请求体失败：{e}")
        return fail(40001, "无效的 JSON 请求体")

    product_name = body.get("product_name", "")
    selling_points = body.get("selling_points", "")
    target_audience = body.get("target_audience", "")
    tone = body.get("tone", "direct_sale")
    custom_prompt = body.get("custom_prompt", "")
    template_structure = body.get("template_structure", [])
    
    # 鹿场直销风格专用字段
    comparison_product = body.get("comparison_product", "普通产品/假冒产品")
    farm_scale = body.get("farm_scale", "自家鹿场养殖")
    identification_points = body.get("identification_points", "颜色、状态、溯源信息")
    call_to_action = body.get("call_to_action", "点击下方链接/评论区留言")

    result = await ai_generate_script_via_gateway(
        product_name=product_name,
        selling_points=selling_points,
        target_audience=target_audience,
        tone=tone,
        template_structure=template_structure,
        custom_prompt=custom_prompt,
        comparison_product=comparison_product,
        farm_scale=farm_scale,
        identification_points=identification_points,
        call_to_action=call_to_action,
    )

    if result["success"]:
        return ok({
            "segments": result["segments"],
            "usage": result.get("usage", {}),
        })
    else:
        return fail(50001, result.get("error", "AI 生成失败"))


@app.post("/v1/ai/recommend-templates")
async def recommend_templates(
    request: Request,
    merchant: Merchant = Depends(verify_api_key),
):
    """
    AI 推荐模板

    请求体：
    {
        "product_keyword": "产品关键词",
        "category": "产品类目（可选）",
        "templates": [  # 模板库（可选，不传则使用后端默认库）
            {"id": "xxx", "name": "xxx", "description": "xxx", "category": "xxx"}
        ]
    }
    """
    try:
        body = await request.json()
    except Exception:
        return fail(40001, "无效的 JSON 请求体")

    product_keyword = body.get("product_keyword", "")
    category = body.get("category", "")
    templates = body.get("templates", None)  # 前端传来的模板库

    result = await ai_recommend_templates_via_gateway(
        product_keyword=product_keyword,
        category=category,
        templates=templates,
    )

    if result["success"]:
        return ok({
            "recommendations": result["recommendations"],
            "usage": result.get("usage", {}),
        })
    else:
        return fail(50001, result.get("error", "AI 推荐失败"))


@app.post("/v1/ai/analyze-videos")
async def analyze_videos(
    request: Request,
    merchant: Merchant = Depends(verify_api_key),
):
    """
    AI 分析视频素材，推荐到素材位

    请求体：
    {
        "video_files": [{"name": "文件名", "path": "路径", "duration": 时长}],
        "template_slots": [{"id": "素材位 ID", "title": "标题", "prompt": "描述"}]
    }
    """
    try:
        body = await request.json()
    except Exception:
        return fail(40001, "无效的 JSON 请求体")

    video_files = body.get("video_files", [])
    template_slots = body.get("template_slots", [])

    result = await ai_analyze_videos_via_gateway(
        video_files=video_files,
        template_slots=template_slots,
    )

    if result["success"]:
        return ok({
            "suggestions": result["suggestions"],
            "usage": result.get("usage", {}),
        })
    else:
        return fail(50001, result.get("error", "AI 分析失败"))


@app.post("/v1/ai/generate-template")
async def generate_template(
    request: Request,
    merchant: Merchant = Depends(verify_api_key),
):
    """
    AI 生成模板

    请求体：
    {
        "product_name": "产品名称",
        "product_type": "产品类型（如：滋补品、电子产品、服装等）",
        "selling_points": "核心卖点（可选）",
        "target_audience": "目标人群（可选）",
        "style": "文案风格（direct_sale/premium/social_review/explainer）",
        "transition_count": 转场数量（数字，默认 4）,
        "file_names": ["文件名 1.mp4", "文件名 2.MOV"]（可选，AI 将根据文件名设计模板结构）
    }
    """
    try:
        body = await request.json()
        print(f"[DEBUG] 收到 AI 生成模板请求：{body}")
    except Exception as e:
        print(f"[ERROR] 解析请求体失败：{e}")
        return fail(40001, "无效的 JSON 请求体")

    product_name = body.get("product_name", "")
    product_type = body.get("product_type", "通用产品")
    selling_points = body.get("selling_points", "")
    target_audience = body.get("target_audience", "")
    style = body.get("style", "direct_sale")
    transition_count = body.get("transition_count", 4)
    file_names = body.get("file_names", [])  # 新增：文件名参考列表

    if not product_name:
        return fail(40002, "产品名称不能为空")

    result = await ai_generate_template_via_gateway(
        product_name=product_name,
        product_type=product_type,
        selling_points=selling_points,
        target_audience=target_audience,
        style=style,
        transition_count=transition_count,
        file_names=file_names,
    )

    if result["success"]:
        # v0.3：不再把 scene 段落硬替换成“转场”。
        # scene 现在只表示素材位 / 画面切换意图，数字人口播不应朗读“转场”。
        template = result["template"]
        if template and "segments" in template:
            for seg in template["segments"]:
                if seg.get("flag") == "scene":
                    seg["transition_after"] = True
                    seg.setdefault("visual_tags", [seg.get("note", "")])
        return ok({
            "template": template,
            "usage": result.get("usage", {}),
        })
    else:
        return fail(50001, result.get("error", "AI 生成模板失败"))
# ==========================================
# Visual Script Editor (AI 自动剪辑) API
# ==========================================

@app.post("/v1/tasks/visual-script-editor")
def create_visual_script_editor_task(
    req: VisualScriptEditorRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    """
    创建视觉脚本编辑器任务
    
    AI 根据视觉脚本自动分析视频库并剪辑特殊片段：
    1. 使用 TwelveLabs Pegasus 分析视频素材
    2. 使用 Gemini 根据视觉脚本选择并排序镜头
    3. 生成 EDL、字幕 SRT、FFmpeg 命令，可选渲染 rough cut
    """
    trace_id = "trace_" + uuid.uuid4().hex[:16]
    task_id = "task_" + uuid.uuid4().hex[:16]
    
    if not check_quota(merchant):
        return fail(40201, "insufficient quota", trace_id=trace_id, status_code=402)
    
    if not check_concurrent_limit(db, merchant):
        return fail(42901, "concurrent task limit reached", trace_id=trace_id, status_code=429)
    
    timeout = req.timeout_seconds or settings.TASK_TIMEOUT_SECONDS
    
    # 验证视频源
    if not req.sources:
        return fail(40001, "at least one video source is required", trace_id=trace_id)
    
    for idx, src in enumerate(req.sources):
        if not any([src.oss_key, src.local_path, src.url]):
            return fail(40002, f"source {idx+1} must have oss_key, local_path, or url", trace_id=trace_id)
    
    task = Task(
        id=task_id,
        merchant_id=merchant.id,
        trace_id=trace_id,
        client_ref_id=req.client_ref_id,
        task_type="visual_script_editor",
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
        "task_runner.run_visual_script_editor_task",
        task_id=task_id,
        payload=req.model_dump(),
        trace_id=trace_id,
        merchant_id=merchant.id,
        job_id=f"rjcut_{task_id}",
        job_timeout=timeout + 60,
        result_ttl=86400,
        failure_ttl=86400,
    )
    
    task.rq_job_id = job.id
    db.add(task)
    db.commit()
    
    return ok({
        "task_id": task_id,
        "task_type": "visual_script_editor",
        "status": "queued",
        "trace_id": trace_id,
        "estimated_seconds": 300,  # 预计 5 分钟（视频分析需要时间）
    }, trace_id=trace_id)
