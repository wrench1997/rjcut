"""
Agent Compose 任务处理器 - 完整合成模式（带 Whisper ASR）
"""

import os
import json
import shutil
import hashlib
import mimetypes
import traceback
from datetime import datetime, timezone
from urllib.parse import urlparse
from typing import Dict, Any
import requests
from redis import Redis

from config import get_settings
from database import get_db_session
from models import Task, TaskStatus
from quota import confirm_quota, refund_quota
from oss import is_oss_key
from cut_transition import get_duration
from tasks.components import (
    TaskContext,
    build_download_chain,
    UploadFileComponent,
)
from tasks import register_task

settings = get_settings()


@register_task("agent_compose")
def run_agent_compose_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    from cut_transition import process as cut_process
    from lip_sync import compose_from_timeline

    task_dir = os.path.join(settings.BASE_TASK_DIR, task_id)
    input_dir = os.path.join(task_dir, "input")
    output_dir = os.path.join(task_dir, "output")
    scene_dir = os.path.join(task_dir, "scenes")

    os.makedirs(input_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(scene_dir, exist_ok=True)

    try:
        update_task(
            task_id,
            status=TaskStatus.processing,
            progress=5,
            stage="downloading_input",
            started_at=datetime.now(timezone.utc),
        )

        if is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        # 使用责任链执行下载
        context = TaskContext(task_id, payload, merchant_id, task_dir)
        download_chain = build_download_chain()
        download_chain.handle(context)

        if is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        # 下载场景素材
        scene_base_url = payload["input"].get("scene_base_url")
        if context.script_data and scene_base_url:
            update_task(task_id, progress=18, stage="downloading_scenes")
            for seg in context.script_data.get("segments", []):
                if seg.get("flag") == "scene" and seg.get("scene_file"):
                    original_scene_file = seg["scene_file"]
                    basename = os.path.basename(original_scene_file)
                    local_scene_path = os.path.join(scene_dir, basename)

                    if not os.path.isfile(local_scene_path):
                        if is_oss_key(scene_base_url):
                            scene_key = scene_base_url.rstrip("/") + "/" + original_scene_file
                            from oss import download_file_from_oss
                            download_file_from_oss(scene_key, local_scene_path)
                        else:
                            from urllib.parse import urljoin
                            scene_url = urljoin(scene_base_url.rstrip("/") + "/", original_scene_file)
                            _download_file(scene_url, local_scene_path)

                    seg["scene_file"] = basename

            if context.script_path:
                with open(context.script_path, "w", encoding="utf-8") as f:
                    json.dump(context.script_data, f, ensure_ascii=False, indent=2)

        if is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        # 执行核心切分任务
        update_task(task_id, progress=25, stage="cut_transition")
        cut_process(
            input_path=context.input_video_path,
            keyword=payload.get("pipeline", {}).get("remove_keyword", "转场"),
            model_size=payload.get("asr", {}).get("model", "large-v3"),
            device="cuda",
            output_dir=output_dir,
            margin=float(payload.get("pipeline", {}).get("margin", 0.15)),
            keep_parts=True,
            min_seg_duration=float(payload.get("pipeline", {}).get("min_segment_duration", 0.1)),
            gen_timeline=True if context.script_path else False,
            script_path=context.script_path,
            lip_sync=False,
            lip_sync_args=None,
        )

        if is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        base = os.path.splitext(os.path.basename(context.input_video_path))[0]
        cleaned_video = os.path.join(output_dir, f"{base}_cleaned.mp4")
        timeline_json = os.path.join(output_dir, f"{base}_timeline.json")
        transcription_json = os.path.join(output_dir, f"{base}_transcription.json")
        final_output = os.path.join(output_dir, f"{base}_final.mp4")

        if context.script_path and os.path.isfile(timeline_json):
            update_task(task_id, progress=60, stage="compose_timeline")

            subtitle = payload.get("subtitle", {})
            position = subtitle.get("position", "bottom")
            alignment = _resolve_position_to_alignment(position)
            actual_margin_v = _calc_actual_margin_v(
                position=position,
                margin_v=int(subtitle.get("margin_v", 50)),
                offset_y=int(subtitle.get("offset_y", 0)),
            )

            compose_from_timeline(
                timeline_path=timeline_json,
                output_video=final_output,
                scene_dir=scene_dir,
                use_transitions=bool(payload.get("pipeline", {}).get("use_transitions", False)),
                transition_type=payload.get("pipeline", {}).get("transition_type", "fade"),
                transition_duration=float(payload.get("pipeline", {}).get("transition_duration", 0.8)),
                resync=bool(payload.get("pipeline", {}).get("resync_subtitle", True)),
                model_size=payload.get("asr", {}).get("model", "large-v3"),
                device=payload.get("asr", {}).get("device", "cuda"),
                language=payload.get("asr", {}).get("language", "zh"),
                effect=subtitle.get("effect", "ad"),
                font_file=context.font_path,
                font_size=int(subtitle.get("font_size", 88)),
                highlight_color=subtitle.get("highlight_color", "gold"),
                max_chars_per_line=int(subtitle.get("max_chars_per_line", 18)),
                alignment=alignment,
                margin_v=actual_margin_v,
                margin_l=int(subtitle.get("margin_l", 10)),
                margin_r=int(subtitle.get("margin_r", 10)),
                offset_x=int(subtitle.get("offset_x", 0)),
                offset_y=int(subtitle.get("offset_y", 0)),
                corrections_file=context.corrections_path,
            )
        else:
            if os.path.isfile(cleaned_video):
                shutil.copy2(cleaned_video, final_output)

        if is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        update_task(task_id, progress=90, stage="uploading_results")

        resync_json = os.path.splitext(final_output)[0] + "_resync.json"
        ass_file = os.path.splitext(final_output)[0] + ".ass"

        raw_paths = {
            "final_video": final_output,
            "cleaned_video": cleaned_video,
            "timeline_json": timeline_json,
            "transcription_json": transcription_json,
            "resync_json": resync_json,
            "ass_file": ass_file,
        }

        uploader = UploadFileComponent()
        result = {
            "files": {
                k: uploader.build_oss_file_entry(task_id, k, v, merchant_id)
                for k, v in raw_paths.items()
            }
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

        callback = payload.get("callback") or {}
        if callback.get("url"):
            post_callback(
                callback["url"],
                {
                    "event": "task.completed",
                    "task_id": task_id,
                    "trace_id": trace_id,
                    "status": "succeeded",
                    "result": result,
                },
                callback.get("secret"),
            )

    except InterruptedError as e:
        _handle_cancelled_task(task_id, str(e))

    except Exception as e:
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        _handle_failed_task(task_id, error_msg, payload, trace_id)
    
    finally:
        try:
            shutil.rmtree(task_dir, ignore_errors=True)
        except Exception:
            pass


def update_task(task_id: str, **kwargs):
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            return
        for k, v in kwargs.items():
            setattr(task, k, v)
        task.updated_at = datetime.now(timezone.utc)
        db.add(task)


def is_task_cancelled(task_id: str) -> bool:
    try:
        redis_conn = Redis.from_url(settings.REDIS_URL)
        return redis_conn.exists(f"task:cancel:{task_id}") > 0
    except Exception:
        return False


def _resolve_position_to_alignment(position: str) -> int:
    mapping = {
        "bottom": 2,
        "top": 8,
        "middle": 5,
        "center": 5,
    }
    return mapping.get(position, 2)


def _calc_actual_margin_v(position: str, margin_v: int, offset_y: int) -> int:
    alignment = _resolve_position_to_alignment(position)
    actual_margin_v = margin_v
    if offset_y != 0:
        if alignment in [7, 8, 9]:
            actual_margin_v = max(0, margin_v + offset_y)
        elif alignment in [1, 2, 3]:
            actual_margin_v = max(0, margin_v - offset_y)
    return actual_margin_v


def _download_file(url: str, output_path: str, timeout: int = 300):
    """
    兼容下载 OSS Key 和 HTTP URL
    """
    # 1. 检查如果是 OSS key，走 OSS 下载通道
    if is_oss_key(url):
        download_file_from_oss(url, output_path)
        return output_path
        
    # 2. 否则走 HTTP 下载通道
    if not url.startswith("http"):
        # 兜底：如果既不是合法的 OSS key 又没有 http 前缀
        raise ValueError(f"无效的下载地址: {url}")
        
    r = requests.get(url, stream=True, timeout=timeout)
    r.raise_for_status()
    with open(output_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)
    return output_path


def _handle_cancelled_task(task_id: str, error_msg: str):
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task and task.status != TaskStatus.cancelled:
            task.status = TaskStatus.cancelled
            task.stage = "cancelled"
            task.error = error_msg
            task.finished_at = datetime.now(timezone.utc)
            db.add(task)
            refund_quota(db, task, reason="cancelled")


def _handle_failed_task(task_id: str, error_msg: str, payload: dict, trace_id: str):
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task and task.status not in [TaskStatus.failed, TaskStatus.cancelled, TaskStatus.timeout]:
            task.status = TaskStatus.failed
            task.stage = "failed"
            task.error = error_msg[:4000]
            task.finished_at = datetime.now(timezone.utc)
            db.add(task)
            refund_quota(db, task, reason=error_msg[:200])

    callback = payload.get("callback") or {}
    if callback.get("url"):
        post_callback(
            callback["url"],
            {
                "event": "task.failed",
                "task_id": task_id,
                "trace_id": trace_id,
                "status": "failed",
                "error": error_msg,
            },
            callback.get("secret"),
        )


def post_callback(callback_url: str, payload: dict, secret: str = None):
    headers = {"Content-Type": "application/json"}
    if secret:
        sign = hashlib.sha256(
            (json.dumps(payload, ensure_ascii=False) + secret).encode("utf-8")
        ).hexdigest()
        headers["X-Signature"] = sign
    try:
        requests.post(callback_url, json=payload, headers=headers, timeout=30)
    except Exception:
        pass
