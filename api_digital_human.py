# api_digital_human.py
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from rq import Queue

from database import get_db
from models import Merchant, Task, TaskStatus
from auth import verify_api_key
from quota import check_quota, check_concurrent_limit, reserve_quota
from config import get_settings
from chanjing_api import ChanjingAPI
from schemas import DhGenerateVideoRequest
from schemas import DhCreateCustomPersonRequest
from models import DhCustomPerson # 引入模型


router = APIRouter(prefix="/v1/dh", tags=["Digital Human"])

def get_chanjing_api():
    settings = get_settings()
    return ChanjingAPI(settings.CHANJING_APP_ID, settings.CHANJING_SECRET_KEY)

def ok(data=None): return {"code": 0, "message": "ok", "data": data}
def fail(code, msg, status_code=400): return {"code": code, "message": msg}

# ----- 1. 获取基础资源接口 (透传蝉镜API) -----

@router.get("/persons/common")
def list_common_persons(_: Merchant = Depends(verify_api_key)):
    api = get_chanjing_api()
    res = api.list_common_digital_persons(page=1, size=100)
    # 此处可以直接映射数据结构，或者直接返回
    return ok(res.get("data", {}).get("list", []))

# @router.get("/persons/custom")
# def list_custom_persons(_: Merchant = Depends(verify_api_key)):
#     api = get_chanjing_api()
#     res = api.list_customised_persons()
#     return ok(res.get("data", {}).get("list", []))



@router.get("/persons/custom")
def list_custom_persons(
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """获取商户自己训练的私有数字人列表（数据隔离）"""
    persons = (
        db.query(DhCustomPerson)
        .filter(DhCustomPerson.merchant_id == merchant.id)
        .order_by(DhCustomPerson.created_at.desc())
        .all()
    )
    
    result_list = [
        {
            "id": p.chanjing_person_id, # 前端生成视频时，需要传这个ID给蝉镜
            "name": p.name,
            "status": p.status,
            "cover_url": p.cover_url,
            "created_at": p.created_at.isoformat() if p.created_at else None
        }
        for p in persons
    ]
    
    return ok(result_list)

@router.get("/voices")
def list_voices(_: Merchant = Depends(verify_api_key)):
    api = get_chanjing_api()
    res = api.list_common_audio_mans(page=1, size=100)
    return ok(res.get("data", {}).get("list", []))

# ----- 2. 创建异步生成任务 -----

@router.post("/tasks/generate")
def create_dh_generate_task(
    req: DhGenerateVideoRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    # 此逻辑与 api_service.py 极度相似
    trace_id = "trace_" + uuid.uuid4().hex[:16]
    task_id = "task_dh_" + uuid.uuid4().hex[:16]

    if not check_quota(merchant): return fail(40201, "insufficient quota")
    if not check_concurrent_limit(db, merchant): return fail(42901, "limit reached")

    task = Task(
        id=task_id,
        merchant_id=merchant.id,
        trace_id=trace_id,
        client_ref_id=req.client_ref_id,
        task_type="dh_generate",  # 新任务类型
        status=TaskStatus.queued,
        payload=req.model_dump(),
        timeout_seconds=req.timeout_seconds,
        stage="queued",
    )

    db.add(task)
    db.flush()
    reserve_quota(db, merchant, task)  # 预扣费

    from api_service import get_queue
    queue = get_queue()
    job = queue.enqueue(
        "task_runner.run_dh_generate_video_task",
        task_id=task_id,
        payload=req.model_dump(),
        trace_id=trace_id,
        merchant_id=merchant.id,
        job_timeout=req.timeout_seconds + 60,
    )
    task.rq_job_id = job.id
    db.commit()

    return ok({"task_id": task_id, "status": "queued"})



@router.post("/tasks/create-person")
def create_dh_custom_person_task(
    req: DhCreateCustomPersonRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    trace_id = "trace_" + uuid.uuid4().hex[:16]
    task_id = "task_dhc_" + uuid.uuid4().hex[:16]

    if not check_quota(merchant): return fail(40201, "insufficient quota")
    if not check_concurrent_limit(db, merchant): return fail(42901, "limit reached")

    task = Task(
        id=task_id,
        merchant_id=merchant.id,
        trace_id=trace_id,
        client_ref_id=req.client_ref_id,
        task_type="dh_custom_person", 
        status=TaskStatus.queued,
        payload=req.model_dump(),
        timeout_seconds=14400, # 训练时间可能较长，设为4小时超时
        stage="queued",
    )

    db.add(task)
    db.flush()
    reserve_quota(db, merchant, task)  # 预扣费

    from api_service import get_queue
    queue = get_queue()
    job = queue.enqueue(
        "task_runner.run_dh_create_person_task",
        task_id=task_id,
        payload=req.model_dump(),
        trace_id=trace_id,
        merchant_id=merchant.id,
        job_timeout=14400 + 60,
    )
    task.rq_job_id = job.id
    db.commit()

    return ok({"task_id": task_id, "status": "queued"})
