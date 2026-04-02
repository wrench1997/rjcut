import os
import json
import shutil
import hashlib
import mimetypes
import traceback
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import requests
from redis import Redis

from config import get_settings
from database import get_db_session
from models import Task, TaskStatus
from quota import confirm_quota, refund_quota
from oss import upload_file_to_oss, download_file_from_oss, is_oss_key

settings = get_settings()


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def safe_name_from_url(url: str, default_name: str):
    path = urlparse(url).path
    name = os.path.basename(path.strip("/"))
    return name or default_name


def download_file(url: str, output_path: str, timeout: int = 300):
    r = requests.get(url, stream=True, timeout=timeout)
    r.raise_for_status()
    with open(output_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)
    return output_path


def download_input_file(url_or_key: str, output_path: str):
    if is_oss_key(url_or_key):
        return download_file_from_oss(url_or_key, output_path)
    return download_file(url_or_key, output_path)


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


def resolve_position_to_alignment(position: str) -> int:
    mapping = {
        "bottom": 2,
        "top": 8,
        "middle": 5,
        "center": 5,
    }
    return mapping.get(position, 2)


def calc_actual_margin_v(position: str, margin_v: int, offset_y: int) -> int:
    alignment = resolve_position_to_alignment(position)
    actual_margin_v = margin_v
    if offset_y != 0:
        if alignment in [7, 8, 9]:
            actual_margin_v = max(0, margin_v + offset_y)
        elif alignment in [1, 2, 3]:
            actual_margin_v = max(0, margin_v - offset_y)
    return actual_margin_v


def is_task_cancelled(task_id: str) -> bool:
    try:
        redis_conn = Redis.from_url(settings.REDIS_URL)
        return redis_conn.exists(f"task:cancel:{task_id}") > 0
    except Exception:
        return False


def update_task(task_id: str, **kwargs):
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            return
        for k, v in kwargs.items():
            setattr(task, k, v)
        task.updated_at = datetime.now(timezone.utc)
        db.add(task)


def build_oss_file_entry(task_id: str, file_key: str, local_path: str, merchant_id: str):
    if not local_path or not os.path.isfile(local_path):
        return {
            "oss_key": None,
            "filename": None,
            "exists": False,
            "size": None,
            "mime_type": None,
            "download_url": None,
        }

    filename = os.path.basename(local_path)
    ext = os.path.splitext(filename)[1]
    oss_key = f"{merchant_id}/tasks/{task_id}/{file_key}{ext}"
    mime = mimetypes.guess_type(local_path)[0] or "application/octet-stream"
    upload_file_to_oss(local_path, oss_key, content_type=mime)

    return {
        "oss_key": oss_key,
        "filename": filename,
        "exists": True,
        "size": os.path.getsize(local_path),
        "mime_type": mime,
        "download_url": f"/v1/tasks/{task_id}/files/{file_key}",
    }


def run_agent_compose_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    from cut_transition import process as cut_process
    from lip_sync import compose_from_timeline

    task_dir = os.path.join(settings.BASE_TASK_DIR, task_id)
    input_dir = os.path.join(task_dir, "input")
    output_dir = os.path.join(task_dir, "output")
    scene_dir = os.path.join(task_dir, "scenes")

    ensure_dir(input_dir)
    ensure_dir(output_dir)
    ensure_dir(scene_dir)

    try:
        update_task(
            task_id,
            status=TaskStatus.processing,
            progress=5,
            stage="downloading_input",
            started_at=datetime.now(timezone.utc),
        )

        req = payload

        if is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        video_url = req["input"]["video_url"]
        video_name = safe_name_from_url(video_url, "input.mp4")
        input_video = os.path.join(input_dir, video_name)
        download_input_file(video_url, input_video)

        script_path = None
        script_data = None
        script_url = req["input"].get("script_url")
        if script_url:
            update_task(task_id, progress=10, stage="downloading_script")
            script_path = os.path.join(input_dir, safe_name_from_url(script_url, "script.json"))
            download_input_file(script_url, script_path)
            with open(script_path, "r", encoding="utf-8") as f:
                script_data = json.load(f)

        corrections_path = None
        corrections_url = req["input"].get("corrections_url")
        if corrections_url:
            update_task(task_id, progress=12, stage="downloading_corrections")
            corrections_path = os.path.join(input_dir, safe_name_from_url(corrections_url, "corrections.json"))
            download_input_file(corrections_url, corrections_path)

        font_path = None
        font_url = req.get("subtitle", {}).get("font_url")
        if font_url:
            update_task(task_id, progress=14, stage="downloading_font")
            font_path = os.path.join(input_dir, safe_name_from_url(font_url, "custom_font.ttf"))
            download_input_file(font_url, font_path)

        if is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        scene_base_url = req["input"].get("scene_base_url")
        if script_data and scene_base_url:
            update_task(task_id, progress=18, stage="downloading_scenes")
            for seg in script_data.get("segments", []):
                if seg.get("flag") == "scene" and seg.get("scene_file"):
                    original_scene_file = seg["scene_file"]
                    basename = os.path.basename(original_scene_file)
                    local_scene_path = os.path.join(scene_dir, basename)

                    if not os.path.isfile(local_scene_path):
                        if is_oss_key(scene_base_url):
                            scene_key = scene_base_url.rstrip("/") + "/" + original_scene_file
                            download_file_from_oss(scene_key, local_scene_path)
                        else:
                            scene_url = urljoin(scene_base_url.rstrip("/") + "/", original_scene_file)
                            download_file(scene_url, local_scene_path)

                    seg["scene_file"] = basename

            with open(script_path, "w", encoding="utf-8") as f:
                json.dump(script_data, f, ensure_ascii=False, indent=2)

        if is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        update_task(task_id, progress=25, stage="cut_transition")
        cut_process(
            input_path=input_video,
            keyword=req.get("pipeline", {}).get("remove_keyword", "转场"),
            model_size=req.get("asr", {}).get("model", "large-v3"),
            device=req.get("asr", {}).get("device", "cuda"),
            output_dir=output_dir,
            margin=float(req.get("pipeline", {}).get("margin", 0.15)),
            keep_parts=True,
            min_seg_duration=float(req.get("pipeline", {}).get("min_segment_duration", 0.1)),
            gen_timeline=True if script_path else False,
            script_path=script_path,
            lip_sync=False,
            lip_sync_args=None,
        )

        if is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        base = os.path.splitext(os.path.basename(input_video))[0]
        cleaned_video = os.path.join(output_dir, f"{base}_cleaned.mp4")
        timeline_json = os.path.join(output_dir, f"{base}_timeline.json")
        transcription_json = os.path.join(output_dir, f"{base}_transcription.json")
        final_output = os.path.join(output_dir, f"{base}_final.mp4")

        if script_path and os.path.isfile(timeline_json):
            update_task(task_id, progress=60, stage="compose_timeline")

            subtitle = req.get("subtitle", {})
            position = subtitle.get("position", "bottom")
            alignment = resolve_position_to_alignment(position)
            actual_margin_v = calc_actual_margin_v(
                position=position,
                margin_v=int(subtitle.get("margin_v", 50)),
                offset_y=int(subtitle.get("offset_y", 0)),
            )

            compose_from_timeline(
                timeline_path=timeline_json,
                output_video=final_output,
                scene_dir=scene_dir,
                use_transitions=bool(req.get("pipeline", {}).get("use_transitions", False)),
                transition_type=req.get("pipeline", {}).get("transition_type", "fade"),
                transition_duration=float(req.get("pipeline", {}).get("transition_duration", 0.8)),
                resync=bool(req.get("pipeline", {}).get("resync_subtitle", True)),
                model_size=req.get("asr", {}).get("model", "large-v3"),
                device=req.get("asr", {}).get("device", "cuda"),
                language=req.get("asr", {}).get("language", "zh"),
                effect=subtitle.get("effect", "ad"),
                font_file=font_path,
                font_size=int(subtitle.get("font_size", 88)),
                highlight_color=subtitle.get("highlight_color", "gold"),
                max_chars_per_line=int(subtitle.get("max_chars_per_line", 18)),
                alignment=alignment,
                margin_v=actual_margin_v,
                margin_l=int(subtitle.get("margin_l", 10)),
                margin_r=int(subtitle.get("margin_r", 10)),
                offset_x=int(subtitle.get("offset_x", 0)),
                offset_y=int(subtitle.get("offset_y", 0)),
                corrections_file=corrections_path,
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

        result = {
            "files": {
                k: build_oss_file_entry(task_id, k, v, merchant_id)
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

        callback = req.get("callback") or {}
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
        with get_db_session() as db:
            task = db.query(Task).filter(Task.id == task_id).first()
            if task and task.status != TaskStatus.cancelled:
                task.status = TaskStatus.cancelled
                task.stage = "cancelled"
                task.error = str(e)
                task.finished_at = datetime.now(timezone.utc)
                db.add(task)
                refund_quota(db, task, reason="cancelled")

    except Exception as e:
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        with get_db_session() as db:
            task = db.query(Task).filter(Task.id == task_id).first()
            if task and task.status not in [TaskStatus.failed, TaskStatus.cancelled, TaskStatus.timeout]:
                task.status = TaskStatus.failed
                task.stage = "failed"
                task.error = error_msg[:4000]
                task.finished_at = datetime.now(timezone.utc)
                db.add(task)
                refund_quota(db, task, reason=str(e)[:200])

        callback = payload.get("callback") or {}
        if callback.get("url"):
            post_callback(
                callback["url"],
                {
                    "event": "task.failed",
                    "task_id": task_id,
                    "trace_id": trace_id,
                    "status": "failed",
                    "error": str(e),
                },
                callback.get("secret"),
            )
    finally:
        try:
            shutil.rmtree(task_dir, ignore_errors=True)
        except Exception:
            pass