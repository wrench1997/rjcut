import os
import json
import shutil
import hashlib
import mimetypes
import traceback
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
import re
import requests
from redis import Redis

from config import get_settings
from database import get_db_session
from models import Task, TaskStatus
from quota import confirm_quota, refund_quota
from oss import upload_file_to_oss, download_file_from_oss, is_oss_key
from chanjing_api import ChanjingAPI
import time

from draft_utils import (
    build_editable_script_from_result,
    apply_corrections_to_editable_script,
)


settings = get_settings()


if not callable(build_editable_script_from_result):
    raise RuntimeError("draft_utils.build_editable_script_from_result is not available")

if not callable(apply_corrections_to_editable_script):
    raise RuntimeError("draft_utils.apply_corrections_to_editable_script is not available")


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


def load_json_file(path: str, default=None):
    if default is None:
        default = {}
    if not path or not os.path.isfile(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_scene_assets_and_upload(scene_dir: str, task_id: str, merchant_id: str):
    scene_assets = {}
    if not scene_dir or not os.path.isdir(scene_dir):
        return scene_assets

    for name in os.listdir(scene_dir):
        local_path = os.path.join(scene_dir, name)
        if not os.path.isfile(local_path):
            continue

        ext = os.path.splitext(name)[1]
        oss_key = f"{merchant_id}/tasks/{task_id}/scene_assets/{os.path.splitext(name)[0]}{ext}"
        mime = mimetypes.guess_type(local_path)[0] or "application/octet-stream"
        upload_file_to_oss(local_path, oss_key, content_type=mime)

        scene_assets[name] = {
            "oss_key": oss_key,
            "filename": name,
            "exists": True,
            "size": os.path.getsize(local_path),
            "mime_type": mime,
        }

    return scene_assets


def build_parts_and_upload(parts_dir: str, task_id: str, merchant_id: str):
    """
    扫描 cut_transition 产出的切片目录，并统一映射成标准 file_key:
      - part_001
      - part_002
      - ...

    兼容本地文件名格式：
      - part_001.mp4
      - xxx_part01.mp4
      - xxx_part001.mp4
    """
    parts = {}
    if not parts_dir or not os.path.isdir(parts_dir):
        return parts

    candidates = []

    for name in sorted(os.listdir(parts_dir)):
        local_path = os.path.join(parts_dir, name)
        if not os.path.isfile(local_path):
            continue

        lower_name = name.lower()
        if not lower_name.endswith(".mp4"):
            continue

        m = re.search(r'part[_]?(\d+)\.mp4$', lower_name)
        if not m:
            continue

        part_index = int(m.group(1))
        candidates.append((part_index, name, local_path))

    for part_index, name, local_path in sorted(candidates, key=lambda x: x[0]):
        file_key = f"part_{part_index:03d}"
        entry = build_oss_file_entry(task_id, file_key, local_path, merchant_id)
        entry["filename"] = name
        parts[file_key] = entry

    return parts


def attach_part_file_to_editable_script(editable_script: dict, parts: dict):
    if not editable_script:
        return {"segments": []}

    segments = editable_script.get("segments") or []
    sorted_part_keys = sorted(parts.keys())

    for idx, seg in enumerate(segments):
        part_filename = None
        if idx < len(sorted_part_keys):
            part_key = sorted_part_keys[idx]
            part_info = parts.get(part_key) or {}
            part_filename = part_info.get("filename") or f"{part_key}.mp4"
        seg["part_file"] = part_filename

    editable_script["segments"] = segments
    return editable_script


def restore_scene_assets(scene_assets: dict, scene_dir: str):
    ensure_dir(scene_dir)
    for filename, info in (scene_assets or {}).items():
        oss_key = info.get("oss_key")
        if not oss_key:
            continue
        local_path = os.path.join(scene_dir, filename)
        download_file_from_oss(oss_key, local_path)


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


def run_agent_draft_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    from cut_transition import process as cut_process

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
            script_data = load_json_file(script_path, default={})

        corrections_data = []
        corrections_url = req["input"].get("corrections_url")
        if corrections_url:
            update_task(task_id, progress=12, stage="downloading_corrections")
            corrections_path = os.path.join(input_dir, safe_name_from_url(corrections_url, "corrections.json"))
            download_input_file(corrections_url, corrections_path)
            corrections_data = load_json_file(corrections_path, default=[])

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

        update_task(task_id, progress=25, stage="generating_draft")

        cut_process(
            input_path=input_video,
            keyword=req.get("pipeline", {}).get("remove_keyword", "转场"),
            model_size=req.get("asr", {}).get("model", "large-v3"),
            device=req.get("asr", {}).get("device", "cuda"),
            output_dir=output_dir,
            margin=float(req.get("pipeline", {}).get("margin", 0.15)),
            keep_parts=True,
            min_seg_duration=float(req.get("pipeline", {}).get("min_segment_duration", 0.1)),
            gen_timeline=True,
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

        timeline_data = load_json_file(timeline_json, default={})
        transcription_data = load_json_file(transcription_json, default={})

        draft_result = {
            "draft": {
                "timeline": timeline_data,
                "transcription": transcription_data,
            }
        }

        editable_script = build_editable_script_from_result(draft_result)

        if corrections_data:
            editable_script = apply_corrections_to_editable_script(editable_script, corrections_data)

        parts_dir = os.path.join(output_dir, f"{base}_parts")
        parts = build_parts_and_upload(parts_dir, task_id, merchant_id)
        editable_script = attach_part_file_to_editable_script(editable_script, parts)

        scene_assets = build_scene_assets_and_upload(scene_dir, task_id, merchant_id)

        result = {
            "draft": {
                "editable_script": editable_script,
                "timeline": timeline_data,
                "transcription": transcription_data,
                "corrections": corrections_data,
                "scene_assets": scene_assets,
                "parts": parts,
                "parts_count": len(parts),
            },
            "files": {
                "cleaned_video": build_oss_file_entry(task_id, "cleaned_video", cleaned_video, merchant_id),
                "timeline_json": build_oss_file_entry(task_id, "timeline_json", timeline_json, merchant_id),
                "transcription_json": build_oss_file_entry(task_id, "transcription_json", transcription_json, merchant_id),
                **parts,
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


def run_compose_from_draft_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
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
            stage="loading_draft",
            started_at=datetime.now(timezone.utc),
        )

        if is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        draft_task_id = payload["draft_task_id"]

        with get_db_session() as db:
            draft_task = db.query(Task).filter(Task.id == draft_task_id).first()
            if not draft_task:
                raise Exception("draft task not found")

            draft_result = draft_task.result or {}
            draft = draft_result.get("draft") or {}
            editable_script = draft.get("editable_script") or {"segments": []}
            timeline_data = draft.get("timeline") or {}
            scene_assets = draft.get("scene_assets") or {}

        if payload.get("editable_script"):
            editable_script = payload["editable_script"]

        if payload.get("corrections"):
            editable_script = apply_corrections_to_editable_script(
                editable_script,
                payload["corrections"]
            )

        if not timeline_data:
            raise Exception("draft timeline not found")

        update_task(task_id, progress=20, stage="restoring_scene_assets")
        restore_scene_assets(scene_assets, scene_dir)

        patched_timeline = json.loads(json.dumps(timeline_data))
        seg_map = {
            int(seg["id"]): seg
            for seg in editable_script.get("segments", [])
            if seg.get("id") is not None
        }

        for seg in patched_timeline.get("segments", []):
            seg_id = seg.get("id")
            edit_seg = seg_map.get(int(seg_id)) if seg_id is not None else None
            if not edit_seg:
                continue
            seg["type"] = edit_seg.get("type", seg.get("type", "human"))
            seg["scene_file"] = edit_seg.get("scene_file")

        timeline_path = os.path.join(input_dir, "timeline.json")
        with open(timeline_path, "w", encoding="utf-8") as f:
            json.dump(patched_timeline, f, ensure_ascii=False, indent=2)

        corrections_file = None
        corrections_payload = payload.get("corrections")
        if corrections_payload:
            corrections_file = os.path.join(input_dir, "corrections.json")
            with open(corrections_file, "w", encoding="utf-8") as f:
                json.dump(corrections_payload, f, ensure_ascii=False, indent=2)
        else:
            draft_corrections = draft.get("corrections") or []
            if draft_corrections:
                corrections_file = os.path.join(input_dir, "corrections.json")
                with open(corrections_file, "w", encoding="utf-8") as f:
                    json.dump(draft_corrections, f, ensure_ascii=False, indent=2)

        font_path = None
        font_url = payload.get("subtitle", {}).get("font_url")
        if font_url:
            update_task(task_id, progress=30, stage="downloading_font")
            font_path = os.path.join(input_dir, safe_name_from_url(font_url, "custom_font.ttf"))
            download_input_file(font_url, font_path)

        final_output = os.path.join(output_dir, "final.mp4")

        subtitle = payload.get("subtitle", {})
        position = subtitle.get("position", "bottom")
        alignment = resolve_position_to_alignment(position)
        actual_margin_v = calc_actual_margin_v(
            position=position,
            margin_v=int(subtitle.get("margin_v", 50)),
            offset_y=int(subtitle.get("offset_y", 0)),
        )

        update_task(task_id, progress=50, stage="composing_video")

        compose_from_timeline(
            timeline_path=timeline_path,
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
            corrections_file=corrections_file,
        )

        if is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        update_task(task_id, progress=90, stage="uploading_results")

        resync_json = os.path.splitext(final_output)[0] + "_resync.json"
        ass_file = os.path.splitext(final_output)[0] + ".ass"

        result_files = {
            "final_video": build_oss_file_entry(task_id, "final_video", final_output, merchant_id),
        }

        if payload.get("output", {}).get("need_ass", True):
            result_files["ass_file"] = build_oss_file_entry(task_id, "ass_file", ass_file, merchant_id)

        result_files["resync_json"] = build_oss_file_entry(task_id, "resync_json", resync_json, merchant_id)

        result = {
            "files": result_files,
            "source_draft_task_id": draft_task_id,
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


def run_dh_generate_video_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    settings = get_settings()
    api = ChanjingAPI(settings.CHANJING_APP_ID, settings.CHANJING_SECRET_KEY)

    task_dir = os.path.join(settings.BASE_TASK_DIR, task_id)
    ensure_dir(task_dir)

    try:
        update_task(task_id, status=TaskStatus.processing, progress=5, stage="submitting_to_chanjing", started_at=datetime.now(timezone.utc))
        if is_task_cancelled(task_id):
            raise InterruptedError("task cancelled")

        bg_oss_key = payload.get("bg_file_oss_key")
        bg_params = None
        if payload.get("bg_type") == "image" and bg_oss_key:
            local_bg = os.path.join(task_dir, "bg_image.jpg")
            download_input_file(bg_oss_key, local_bg)
            chanjing_file_id = api.upload_file(local_bg, service="background")
            bg_params = {"file_id": chanjing_file_id, "x": 0, "y": 0, "width": 1080, "height": 1920}

        video_params = {
            "digital_person_id": payload.get("person_id"),
            "text": payload.get("text"),
            "audio_man_id": payload.get("audio_man_id"),
            "figure_type": payload.get("figure_type"),
            "drive_mode": payload.get("drive_mode"),
            "person_x": 0, "person_y": 0, "person_width": 1080, "person_height": 1920
        }
        if bg_params:
            video_params["bg"] = bg_params
        else:
            video_params["bg_color"] = payload.get("bg_color")

        video_response = api.create_video(**video_params)
        if video_response.get('code') != 0:
            raise Exception(f"蝉镜接口报错: {video_response}")

        chanjing_video_id = video_response['data']
        update_task(task_id, progress=10, stage="waiting_chanjing_render")

        chanjing_video_url = None
        for _ in range(180):
            if is_task_cancelled(task_id):
                raise InterruptedError("task cancelled")

            status_resp = api.get_video_status(chanjing_video_id)
            if status_resp.get('code') == 0:
                data = status_resp.get('data', {})
                status = data.get('status')
                progress = data.get('progress', 0)

                mapped_progress = 10 + int(progress * 0.8)
                update_task(task_id, progress=mapped_progress)

                if status in (1, 30):
                    chanjing_video_url = data.get('video_url')
                    break
                elif status in (2, 40, -1):
                    raise Exception(f"蝉镜渲染失败: {data.get('msg', '未知错误')}")
            time.sleep(10)

        if not chanjing_video_url:
            raise Exception("等待蝉镜渲染超时 (30分钟)")

        update_task(task_id, progress=90, stage="uploading_results")
        local_result = os.path.join(task_dir, "final.mp4")
        api.download_video(chanjing_video_url, local_result)

        result = {
            "files": {
                "final_video": build_oss_file_entry(task_id, "final_video", local_result, merchant_id)
            }
        }

        with get_db_session() as db:
            task = db.query(Task).filter(Task.id == task_id).first()
            if task:
                task.status = TaskStatus.succeeded
                task.progress = 100
                task.stage = "finished"
                task.result = result
                task.finished_at = datetime.now(timezone.utc)
                db.add(task)
                confirm_quota(db, task)

        callback = payload.get("callback") or {}
        if callback.get("url"):
            post_callback(callback["url"], {"event": "task.completed", "task_id": task_id, "trace_id": trace_id, "status": "succeeded", "result": result}, callback.get("secret"))

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
            post_callback(callback["url"], {"event": "task.failed", "task_id": task_id, "trace_id": trace_id, "status": "failed", "error": str(e)}, callback.get("secret"))
    finally:
        shutil.rmtree(task_dir, ignore_errors=True)


def run_dh_create_person_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    settings = get_settings()
    api = ChanjingAPI(settings.CHANJING_APP_ID, settings.CHANJING_SECRET_KEY)

    task_dir = os.path.join(settings.BASE_TASK_DIR, task_id)
    ensure_dir(task_dir)

    try:
        update_task(task_id, status=TaskStatus.processing, progress=5, stage="downloading_source", started_at=datetime.now(timezone.utc))
        if is_task_cancelled(task_id):
            raise InterruptedError("task cancelled")

        source_key = payload.get("source_video_oss_key")
        local_source = os.path.join(task_dir, "source.mp4")
        download_input_file(source_key, local_source)

        update_task(task_id, progress=15, stage="uploading_to_chanjing")
        chanjing_file_id = api.upload_file(local_source, service="customised_person")

        update_task(task_id, progress=25, stage="submitting_train_task")
        train_resp = api.create_customised_person(
            name=payload.get("name"),
            file_id=chanjing_file_id,
            train_type=payload.get("train_type", "both"),
            language=payload.get("language", "cn"),
            error_skip=payload.get("error_skip", False),
            resolution_rate=payload.get("resolution_rate", 0)
        )

        if train_resp.get('code') != 0:
            raise Exception(f"蝉镜训练接口报错: {train_resp}")

        person_id = train_resp.get('data', {}).get('id')
        if not person_id:
            raise Exception("未能获取到生成的 person_id")

        update_task(task_id, progress=30, stage="training")
        is_success = False

        for _ in range(480):
            if is_task_cancelled(task_id):
                raise InterruptedError("task cancelled")

            status_resp = api.get_customised_person_status(person_id)
            if status_resp.get('code') == 0:
                data = status_resp.get('data', {})
                status = data.get('status')

                if status == 30:
                    is_success = True
                    update_task(task_id, progress=99)
                    break
                elif status in (40, -1, 2):
                    raise Exception(f"数字人训练失败: {data.get('msg', '模型不符合要求或未知错误')}")

                update_task(task_id, progress=min(90, 30 + (_ // 8)))
            time.sleep(30)

        if not is_success:
            raise Exception("等待数字人训练超时 (4小时)")

        result = {
            "person_id": person_id,
            "name": payload.get("name")
        }

        with get_db_session() as db:
            task = db.query(Task).filter(Task.id == task_id).first()
            if task:
                task.status = TaskStatus.succeeded
                task.progress = 100
                task.stage = "finished"
                task.result = result
                task.finished_at = datetime.now(timezone.utc)
                db.add(task)

                from models import DhCustomPerson
                new_person = DhCustomPerson(
                    merchant_id=merchant_id,
                    chanjing_person_id=person_id,
                    name=payload.get("name"),
                    status=30,
                    source_task_id=task_id
                )
                db.add(new_person)

                confirm_quota(db, task)

        callback = payload.get("callback") or {}
        if callback.get("url"):
            post_callback(callback["url"], {"event": "task.completed", "task_id": task_id, "trace_id": trace_id, "status": "succeeded", "result": result}, callback.get("secret"))

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
            post_callback(callback["url"], {"event": "task.failed", "task_id": task_id, "trace_id": trace_id, "status": "failed", "error": str(e)}, callback.get("secret"))
    finally:
        shutil.rmtree(task_dir, ignore_errors=True)