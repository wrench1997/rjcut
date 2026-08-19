"""MiniMax H3 文生视频与图生视频后台任务。"""

import base64
import math
import os
import time
import traceback
from datetime import datetime, time as datetime_time, timedelta, timezone
from zoneinfo import ZoneInfo

import requests
from PIL import Image, UnidentifiedImageError
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from config import get_settings
from database import get_db_session
from models import Task, TaskStatus
from oss import download_file_from_oss
from quota import confirm_quota, refund_quota
from tasks import register_task
from tasks.components import FileManagerComponent


settings = get_settings()


def _auth_headers(upstream_key: str | None = None) -> dict:
    """上游 GenVideos 网关统一 API Key（H3 文生视频鉴权）。

    优先使用任务创建时由 exe 透传并存入 payload 的 key，回退环境变量。
    """
    key = (upstream_key or settings.GENVIDEOS_API_KEY or "").strip()
    return {"Authorization": f"Bearer {key}"} if key else {}


SUPPORTED_IMAGE_SIGNATURES = (
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
)
MAX_FRAME_PIXELS = 80_000_000


def _resilient_get_session() -> requests.Session:
    """Retry idempotent H3 reads when the public relay briefly returns 5xx."""
    retry = Retry(
        total=5,
        connect=5,
        read=5,
        status=5,
        backoff_factor=1.0,
        status_forcelist=(408, 425, 429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=retry, pool_connections=4, pool_maxsize=4)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def _image_data_uri(oss_key: str, input_dir: str, frame_name: str) -> tuple[str, tuple[int, int]]:
    """Download an owned relay upload and encode it for H3 after magic-byte validation."""
    download_path = os.path.join(input_dir, f"{frame_name}.image")
    download_file_from_oss(oss_key, download_path)
    file_size = os.path.getsize(download_path)
    if file_size <= 0 or file_size > 20 * 1024 * 1024:
        raise ValueError(f"{frame_name}图片为空或超过 20MB")
    with open(download_path, "rb") as image_file:
        image_bytes = image_file.read()
    media_type = None
    for signature, candidate_type, _extension in SUPPORTED_IMAGE_SIGNATURES:
        if image_bytes.startswith(signature):
            media_type = candidate_type
            break
    if not media_type and image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        media_type = "image/webp"
    if not media_type:
        raise ValueError(f"{frame_name}仅支持 JPEG、PNG 或 WebP 图片")
    try:
        with Image.open(download_path) as image:
            width, height = image.size
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError(f"{frame_name}不是可解码的有效图片") from exc
    if width <= 0 or height <= 0 or width * height > MAX_FRAME_PIXELS:
        raise ValueError(f"{frame_name}分辨率无效或超过 4000 万像素")
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{media_type};base64,{encoded}", (width, height)


def _resolve_size(aspect_ratio: str) -> str:
    if aspect_ratio == "auto":
        aspect_ratio = "16:9"
    width_part, height_part = map(int, aspect_ratio.split(":"))
    ratio = width_part / height_part
    short_edge = 768.0
    if ratio >= 1.0:
        width, height = short_edge * ratio, short_edge
    else:
        width, height = short_edge, short_edge / ratio
    max_pixels = 768 * 1344
    if width * height > max_pixels:
        scale = math.sqrt(max_pixels / (width * height))
        width *= scale
        height *= scale
    return f"{max(32, round(width / 32) * 32)}x{max(32, round(height / 32) * 32)}"


def _update_task(task_id: str, **values) -> None:
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            return
        for key, value in values.items():
            setattr(task, key, value)
        task.updated_at = datetime.now(timezone.utc)
        db.add(task)


def _is_cancelled(task_id: str) -> bool:
    from tasks.agent_compose import is_task_cancelled

    return is_task_cancelled(task_id)


def _daily_generated_bytes() -> int:
    local_zone = ZoneInfo("Asia/Shanghai")
    local_now = datetime.now(local_zone)
    day_start = datetime.combine(local_now.date(), datetime_time.min, tzinfo=local_zone).astimezone(timezone.utc)
    with get_db_session() as db:
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


def _fail_task(task_id: str, error: str) -> None:
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task and task.status not in {TaskStatus.failed, TaskStatus.cancelled, TaskStatus.timeout}:
            task.status = TaskStatus.failed
            task.stage = "failed"
            task.error = error[:4000]
            task.finished_at = datetime.now(timezone.utc)
            db.add(task)
            refund_quota(db, task, reason=error[:200])


def _cancel_task(task_id: str, reason: str) -> None:
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task and task.status != TaskStatus.cancelled:
            task.status = TaskStatus.cancelled
            task.stage = "cancelled"
            task.error = reason
            task.finished_at = datetime.now(timezone.utc)
            db.add(task)
            refund_quota(db, task, reason=reason)


@register_task("text_to_video")
def run_text_to_video_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    del trace_id
    task_dir = os.path.join(settings.BASE_TASK_DIR, task_id)
    output_dir = os.path.join(task_dir, "output")
    generation_mode = payload.get("generation_mode", "text_to_video")
    output_stem = "image_to_video" if generation_mode == "image_to_video" else "text_to_video"
    output_path = os.path.join(output_dir, f"{output_stem}_{task_id}.mp4")
    os.makedirs(output_dir, exist_ok=True)
    base_url = settings.H3_BASE_URL.rstrip("/")
    upstream_id = None
    h3_key = payload.get("_upstream_h3_key")
    get_session = _resilient_get_session()

    try:
        _update_task(
            task_id,
            status=TaskStatus.processing,
            progress=3,
            stage="submitting",
            started_at=datetime.now(timezone.utc),
        )
        aspect_ratio = payload.get("aspect_ratio", "9:16")
        seconds = int(payload.get("seconds", 4))
        conditions = []
        first_frame_size = None
        if generation_mode == "image_to_video":
            input_dir = os.path.join(task_dir, "input")
            os.makedirs(input_dir, exist_ok=True)
            first_frame_key = payload.get("first_frame_oss_key")
            if not first_frame_key:
                raise ValueError("图生视频任务缺少首帧图片")
            first_frame_uri, first_frame_size = _image_data_uri(first_frame_key, input_dir, "首帧")
            conditions.append({
                "type": "image",
                "uri": first_frame_uri,
                "role": "keyframe",
                "frame_index": 0,
            })
            if payload.get("last_frame_oss_key"):
                last_frame_uri, last_frame_size = _image_data_uri(
                    payload["last_frame_oss_key"], input_dir, "尾帧"
                )
                first_ratio = first_frame_size[0] / first_frame_size[1]
                last_ratio = last_frame_size[0] / last_frame_size[1]
                if abs(first_ratio - last_ratio) / first_ratio > 0.02:
                    raise ValueError("首帧与尾帧宽高比不一致，请使用相同比例的图片")
                conditions.append({
                    "type": "image",
                    "uri": last_frame_uri,
                    "role": "keyframe",
                    "frame_index": -1,
                })
        is_image_to_video = bool(conditions)
        size_aspect_ratio = aspect_ratio
        source_aspect_ratio = None
        if aspect_ratio == "auto":
            if first_frame_size:
                divisor = math.gcd(first_frame_size[0], first_frame_size[1])
                source_aspect_ratio = (
                    f"{first_frame_size[0] // divisor}:{first_frame_size[1] // divisor}"
                )
                size_aspect_ratio = source_aspect_ratio
            else:
                # 纯文生视频且未指定比例时，默认 16:9 横屏
                size_aspect_ratio = "16:9"
        upstream_payload = {
            "model": "MiniMax/MiniMax-H3",
            "prompt": payload["prompt"],
            "seconds": seconds,
            "num_inference_steps": int(payload.get("num_inference_steps", 50)),
            "seed": int(payload.get("seed", 42)),
            "task": "fl2va" if is_image_to_video else "t2va",
            "conditions": conditions,
            "target": {
                "short_edge": 768,
                "aspect_ratio": "auto" if is_image_to_video else size_aspect_ratio,
                "duration_seconds": float(seconds),
            },
            "flow_shift": 12.0,
            "audio_flow_shift": 3.0,
        }
        if not is_image_to_video:
            upstream_payload["size"] = _resolve_size(size_aspect_ratio)
        total_steps = int(upstream_payload["num_inference_steps"])
        response = requests.post(f"{base_url}/v1/videos", json=upstream_payload, timeout=60, headers=_auth_headers(h3_key))
        response.raise_for_status()
        upstream_id = response.json()["id"]
        _update_task(
            task_id,
            progress=5,
            stage="queued_upstream",
            result={"upstream_video_id": upstream_id},
        )

        deadline = time.monotonic() + int(payload.get("timeout_seconds", 7200))
        upstream_started_at = time.monotonic()
        job = None
        while time.monotonic() < deadline:
            if _is_cancelled(task_id):
                try:
                    requests.delete(f"{base_url}/v1/videos/{upstream_id}", timeout=15, headers=_auth_headers(h3_key))
                except Exception:
                    pass
                raise InterruptedError("用户取消 AI 视频生成任务")

            response = get_session.get(f"{base_url}/v1/videos/{upstream_id}", timeout=(8, 30), headers=_auth_headers(h3_key))
            response.raise_for_status()
            job = response.json()
            status = str(job.get("status", "")).lower()
            upstream_progress = max(0, min(100, int(job.get("progress") or 0)))
            elapsed = max(0.0, time.monotonic() - upstream_started_at)
            if upstream_progress > 0:
                mapped_progress = 8 + round(upstream_progress * 0.77)
            elif status == "in_progress":
                mapped_progress = min(82, 15 + int(elapsed / 30))
            else:
                mapped_progress = min(15, 5 + int(elapsed / 60))
            reported_step = job.get("current_step") or job.get("step") or job.get("steps_completed")
            reported_total_steps = job.get("total_steps") or job.get("num_inference_steps") or total_steps
            try:
                current_step = max(0, min(int(reported_total_steps), int(reported_step)))
                step_is_estimated = False
            except (TypeError, ValueError):
                if upstream_progress > 0:
                    current_step = round(total_steps * upstream_progress / 100)
                elif status == "in_progress":
                    current_step = round(total_steps * max(0, mapped_progress - 15) / 67)
                else:
                    current_step = 0
                reported_total_steps = total_steps
                step_is_estimated = status == "in_progress"
            _update_task(
                task_id,
                progress=min(85, mapped_progress),
                stage="generating" if status == "in_progress" else "queued_upstream",
                result={
                    "upstream_video_id": upstream_id,
                    "upstream_status": status,
                    "upstream_progress": upstream_progress,
                    "current_step": current_step,
                    "total_steps": int(reported_total_steps),
                    "step_is_estimated": step_is_estimated,
                },
            )
            if status == "completed":
                break
            if status in {"failed", "cancelled", "deleted"}:
                raise RuntimeError(job.get("error") or f"视频生成任务结束：{status}")
            time.sleep(3)
        else:
            raise TimeoutError(f"视频生成任务 {upstream_id} 在限定时间内未完成")

        _update_task(task_id, progress=88, stage="downloading")
        with get_session.get(
            f"{base_url}/v1/videos/{upstream_id}/content",
            stream=True,
            timeout=(30, int(payload.get("timeout_seconds", 7200))),
            headers=_auth_headers(h3_key),
        ) as response:
            response.raise_for_status()
            content_length = int(response.headers.get("content-length") or 0)
            remaining_daily_bytes = max(
                0,
                int(settings.TEXT_TO_VIDEO_DAILY_BYTES_LIMIT) - _daily_generated_bytes(),
            )
            if remaining_daily_bytes <= 0 or content_length > remaining_daily_bytes:
                raise RuntimeError("今日 AI 视频生成文件已达到 10GB 上限，请明天再试")
            downloaded_bytes = 0
            with open(output_path, "wb") as output_file:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        downloaded_bytes += len(chunk)
                        if downloaded_bytes > remaining_daily_bytes:
                            raise RuntimeError("本视频会使今日生成文件超过 10GB 上限，请明天再试")
                        output_file.write(chunk)
        if not os.path.isfile(output_path) or os.path.getsize(output_path) < 1024:
                raise RuntimeError("视频生成服务返回的文件为空或过小")

        _update_task(task_id, progress=95, stage="uploading")
        files = FileManagerComponent().upload_task_outputs(
            task_id,
            merchant_id,
            {"final_video": output_path},
        )
        result = {
            "upstream_video_id": upstream_id,
            "generation_mode": generation_mode,
            "upstream_task": upstream_payload["task"],
            "prompt": payload["prompt"],
            "aspect_ratio": aspect_ratio,
            "source_aspect_ratio": source_aspect_ratio,
            "current_step": total_steps,
            "total_steps": total_steps,
            "step_is_estimated": False,
            "seconds": seconds,
            "size": upstream_payload["size"],
            "server_file_expires_at": (
                datetime.now(timezone.utc) + timedelta(hours=settings.TEXT_TO_VIDEO_RETENTION_HOURS)
            ).isoformat(),
            "files": files,
        }
        with get_db_session() as db:
            task = db.query(Task).filter(Task.id == task_id).first()
            if task:
                task.status = TaskStatus.succeeded
                task.progress = 100
                task.stage = "finished"
                task.result = result
                task.error = None
                task.finished_at = datetime.now(timezone.utc)
                db.add(task)
                confirm_quota(db, task)
    except InterruptedError as exc:
        _cancel_task(task_id, str(exc))
    except Exception as exc:
        _fail_task(task_id, f"{exc}\n{traceback.format_exc()}")
    finally:
        get_session.close()
        FileManagerComponent().cleanup_task_dir(task_dir, ignore_errors=True)
