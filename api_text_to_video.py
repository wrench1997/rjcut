"""MiniMax H3 AI 视频生成 API。"""

import math
import uuid
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

import requests
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from auth import verify_api_key
from config import get_settings
from database import get_db
from models import Merchant, Task, TaskStatus, UploadRecord
from upstream_keys import get_h3_key
from quota import check_concurrent_limit, check_quota, reserve_quota
from schemas import TextToVideoRequest


router = APIRouter(prefix="/v1/text-to-video", tags=["text-to-video"])
settings = get_settings()


def _daily_generated_bytes(db: Session) -> int:
    local_zone = ZoneInfo("Asia/Shanghai")
    local_now = datetime.now(local_zone)
    day_start = datetime.combine(local_now.date(), time.min, tzinfo=local_zone).astimezone(timezone.utc)
    tasks = (
        db.query(Task)
        .filter(
            Task.task_type == "text_to_video",
            Task.status == TaskStatus.succeeded,
            Task.finished_at >= day_start,
        )
        .all()
    )
    total = 0
    for task in tasks:
        for file_info in ((task.result or {}).get("files") or {}).values():
            total += int((file_info or {}).get("size") or 0)
    return total


def _ok(data=None, trace_id=None):
    return {"code": 0, "message": "ok", "data": data, "trace_id": trace_id}


def _fail(code: int, message: str):
    return {"code": code, "message": message, "data": None}


def _validate_aspect_ratio(value: str) -> None:
    if value == "auto":
        return
    width_text, height_text = value.split(":", maxsplit=1)
    ratio = int(width_text) / int(height_text)
    if not 0.25 <= ratio <= 4.0:
        raise ValueError("H3 支持的画面比例范围为 1:4 到 4:1")


@router.get("/health")
def get_text_to_video_health(
    merchant: Merchant = Depends(verify_api_key),
    request: Request = None,
):
    del merchant
    try:
        h3_key = get_h3_key(request)
        auth_headers = {"Authorization": f"Bearer {h3_key}"} if h3_key else None
        response = requests.get(
            f"{settings.H3_BASE_URL.rstrip('/')}/health",
            timeout=8,
            headers=auth_headers,
        )
        response.raise_for_status()
        upstream = response.json()
        return _ok({"status": upstream.get("status", "ok"), "service": "text-to-video"})
    except Exception as exc:
        return _fail(50301, f"视频生成服务不可用：{exc}")


@router.post("/tasks")
def create_text_to_video_task(
    req: TextToVideoRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
    request: Request = None,
):
    try:
        _validate_aspect_ratio(req.aspect_ratio)
    except ValueError as exc:
        return _fail(40001, str(exc))

    frame_keys = [key for key in (req.first_frame_oss_key, req.last_frame_oss_key) if key]
    if req.generation_mode == "image_to_video" and not req.first_frame_oss_key:
        return _fail(40002, "图生视频必须上传首帧图片")
    if req.last_frame_oss_key and not req.first_frame_oss_key:
        return _fail(40002, "设置尾帧前必须先上传首帧图片")
    if req.generation_mode == "text_to_video" and frame_keys:
        return _fail(40002, "文生视频任务不能携带首尾帧图片")
    for oss_key in frame_keys:
        upload = (
            db.query(UploadRecord)
            .filter(
                UploadRecord.oss_key == oss_key,
                UploadRecord.merchant_id == merchant.id,
                UploadRecord.is_confirmed.is_(True),
            )
            .first()
        )
        if not upload:
            return _fail(40002, "首尾帧图片不存在、尚未上传完成或不属于当前账号")
        if int(upload.size_bytes or 0) > 20 * 1024 * 1024:
            return _fail(40002, "单张首尾帧图片不能超过 20MB")

    if not check_quota(merchant):
        return _fail(40201, "insufficient quota")
    if not check_concurrent_limit(db, merchant):
        return _fail(42901, "concurrent task limit reached")
    generated_bytes = _daily_generated_bytes(db)
    if generated_bytes >= settings.TEXT_TO_VIDEO_DAILY_BYTES_LIMIT:
        return _fail(42902, "今日 AI 视频生成文件已达到 10GB 上限，请明天再试")

    trace_id = "trace_" + uuid.uuid4().hex[:16]
    task_prefix = "task_i2v_" if req.generation_mode == "image_to_video" else "task_t2v_"
    task_id = task_prefix + uuid.uuid4().hex[:16]
    payload = req.model_dump()
    # 上游 H3 Key 由 exe 透传，写入任务数据供 worker 调用上游时使用；未传则 worker 回退环境变量。
    payload["_upstream_h3_key"] = get_h3_key(request)
    task = Task(
        id=task_id,
        merchant_id=merchant.id,
        trace_id=trace_id,
        client_ref_id=req.client_ref_id,
        task_type="text_to_video",
        status=TaskStatus.queued,
        payload=payload,
        timeout_seconds=req.timeout_seconds,
        progress=0,
        stage="queued",
    )
    db.add(task)
    db.flush()
    reserve_quota(db, merchant, task)

    from api_service import get_queue

    job = get_queue().enqueue(
        "task_runner.run_task",
        task_id=task_id,
        task_type="text_to_video",
        payload=payload,
        trace_id=trace_id,
        merchant_id=merchant.id,
        job_id=f"rjcut_{task_id}",
        job_timeout=req.timeout_seconds + 60,
        result_ttl=86400,
        failure_ttl=86400,
    )
    task.rq_job_id = job.id
    db.commit()
    return _ok(
        {
            "task_id": task_id,
            "task_type": "text_to_video",
            "status": "queued",
            "trace_id": trace_id,
            "estimated_seconds": 900,
        },
        trace_id=trace_id,
    )
