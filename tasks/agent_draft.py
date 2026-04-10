"""
Agent Draft 任务处理器 - 草稿模式
"""

import os
import json
import shutil
import time
from datetime import datetime, timezone
from typing import Dict, Any

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
from draft_utils import (
    build_editable_script_from_result,
    apply_corrections_to_editable_script,
)

settings = get_settings()


@register_task("agent_draft")
def run_agent_draft_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    from cut_transition import process as cut_process

    task_dir = os.path.join(settings.BASE_TASK_DIR, task_id)
    input_dir = os.path.join(task_dir, "input")
    output_dir = os.path.join(task_dir, "output")
    scene_dir = os.path.join(task_dir, "scenes")

    os.makedirs(input_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(scene_dir, exist_ok=True)

    try:
        _update_task(
            task_id,
            status=TaskStatus.processing,
            progress=5,
            stage="downloading_input",
            started_at=datetime.now(timezone.utc),
        )

        if _is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        # 使用责任链执行下载
        context = TaskContext(task_id, payload, merchant_id, task_dir)
        download_chain = build_download_chain()
        download_chain.handle(context)

        if _is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        # 执行核心切分任务
        _update_task(task_id, progress=25, stage="generating_draft")

        cut_process(
            input_path=context.input_video_path,
            keyword=payload.get("pipeline", {}).get("remove_keyword", "转场"),
            model_size=payload.get("asr", {}).get("model", "large-v3"),
            device="cuda",
            output_dir=output_dir,
            margin=float(payload.get("pipeline", {}).get("margin", 0.15)),
            keep_parts=True,
            min_seg_duration=float(payload.get("pipeline", {}).get("min_segment_duration", 0.1)),
            gen_timeline=True,
            script_path=context.script_path,
            lip_sync=False,
            lip_sync_args=None,
        )

        if _is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        # 收集产物文件
        base = os.path.splitext(os.path.basename(context.input_video_path))[0]
        cleaned_video = os.path.join(output_dir, f"{base}_cleaned.mp4")
        timeline_json = os.path.join(output_dir, f"{base}_timeline.json")
        transcription_json = os.path.join(output_dir, f"{base}_transcription.json")

        timeline_data = _load_json_file(timeline_json, default={})
        transcription_data = _load_json_file(transcription_json, default={})

        draft_result = {
            "draft": {
                "timeline": timeline_data,
                "transcription": transcription_data,
            }
        }

        # 构建可编辑脚本
        editable_script = build_editable_script_from_result(draft_result)

        # 应用纠错字典
        if context.corrections_data:
            editable_script = apply_corrections_to_editable_script(editable_script, context.corrections_data)

        # 上传切片文件
        parts_dir = os.path.join(output_dir, f"{base}_parts")
        parts = _build_parts_and_upload(parts_dir, task_id, merchant_id)
        editable_script = _attach_part_file_to_editable_script(editable_script, parts)

        # 上传场景素材（使用 MinIO 内部复制）
        scene_assets = _build_scene_assets_and_upload(scene_dir, task_id, merchant_id)

        # 构建最终结果
        uploader = UploadFileComponent()
        result = {
            "draft": {
                "editable_script": editable_script,
                "timeline": timeline_data,
                "transcription": transcription_data,
                "corrections": context.corrections_data or [],
                "scene_assets": scene_assets,
                "parts": parts,
                "parts_count": len(parts),
            },
            "files": {
                "cleaned_video": uploader.build_oss_file_entry(task_id, "cleaned_video", cleaned_video, merchant_id),
                "timeline_json": uploader.build_oss_file_entry(task_id, "timeline_json", timeline_json, merchant_id),
                "transcription_json": uploader.build_oss_file_entry(task_id, "transcription_json", transcription_json, merchant_id),
                **parts,
            }
        }

        # 更新任务状态为成功
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

        # 回调通知
        callback = payload.get("callback") or {}
        if callback.get("url"):
            _post_callback(
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


def _update_task(task_id: str, **kwargs):
    from tasks.agent_compose import update_task
    return update_task(task_id, **kwargs)


def _is_task_cancelled(task_id: str) -> bool:
    from tasks.agent_compose import is_task_cancelled
    return is_task_cancelled(task_id)


def _load_json_file(path: str, default=None):
    if default is None:
        default = {}
    if not path or not os.path.isfile(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _build_parts_and_upload(parts_dir: str, task_id: str, merchant_id: str) -> dict:
    """扫描 cut_transition 产出的切片目录，并统一映射成标准 file_key"""
    import re
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

    uploader = UploadFileComponent()
    for part_index, name, local_path in sorted(candidates, key=lambda x: x[0]):
        file_key = f"part_{part_index:03d}"
        entry = uploader.build_oss_file_entry(task_id, file_key, local_path, merchant_id)
        entry["filename"] = name
        parts[file_key] = entry

    return parts


def _attach_part_file_to_editable_script(editable_script: dict, parts: dict) -> dict:
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


def _build_scene_assets_and_upload(scene_dir: str, task_id: str, merchant_id: str) -> dict:
    """构建 scene_assets 字典并复制场景素材"""
    import mimetypes
    scene_assets = {}
    if not scene_dir or not os.path.isdir(scene_dir):
        return scene_assets

    for name in os.listdir(scene_dir):
        local_path = os.path.join(scene_dir, name)
        if not os.path.isfile(local_path):
            continue

        src_oss_key = f"{merchant_id}/scenes/{name}"
        dst_oss_key = f"{merchant_id}/tasks/{task_id}/scene_assets/{name}"
        mime = mimetypes.guess_type(local_path)[0] or "application/octet-stream"

        max_retries = 3
        success = False
        
        for attempt in range(max_retries):
            try:
                from oss import copy_file_in_oss
                copy_file_in_oss(src_oss_key, dst_oss_key)
                
                scene_assets[name] = {
                    "oss_key": dst_oss_key,
                    "filename": name,
                    "exists": True,
                    "size": os.path.getsize(local_path),
                    "mime_type": mime,
                }
                
                print(f"✅ 场景素材复制成功：{name} (尝试 {attempt + 1}/{max_retries})")
                success = True
                break
                
            except Exception as e:
                print(f"⚠️  场景素材复制失败 (尝试 {attempt + 1}/{max_retries}): {name}")
                print(f"    错误：{e}")
                
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    print(f"    等待 {wait_time} 秒后重试...")
                    time.sleep(wait_time)
                else:
                    print(f"❌ 场景素材 {name} 复制失败，已跳过")
        
        if not success:
            print(f"⚠️  警告：场景素材 {name} 未能成功复制到任务目录")

    return scene_assets


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
        _post_callback(
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


def _post_callback(callback_url: str, payload: dict, secret: str = None):
    import hashlib
    import requests
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


# 需要导入 traceback 用于错误处理
import traceback
