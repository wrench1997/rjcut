"""
Compose From Draft 任务处理器 - 从草稿合成最终视频
"""

import os
import json
import shutil
import hashlib
import copy
import re
import traceback
from datetime import datetime, timezone
from typing import Dict, Any
import requests

from config import get_settings
from database import get_db_session
from models import Task, TaskStatus
from quota import confirm_quota, refund_quota
from oss import download_file_from_oss, is_oss_key
from tasks.components import (
    TaskContext,
    UploadFileComponent,
    FileManagerComponent,
)
from tasks import register_task

settings = get_settings()


@register_task("compose_from_draft")
def run_compose_from_draft_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    from lip_sync import compose_from_timeline

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
            stage="loading_draft",
            started_at=datetime.now(timezone.utc),
        )

        if _is_task_cancelled(task_id):
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
            parts = draft.get("parts") or {}

            # 兼容旧草稿：如果 draft.parts 不存在，则尝试从 files 中兜底恢复
            if not parts:
                files = draft_result.get("files") or {}
                parts = {k: v for k, v in files.items() if re.match(r"^part_\d+$", k)}

        if payload.get("editable_script"):
            editable_script = payload["editable_script"]

        if payload.get("corrections"):
            from draft_utils import apply_corrections_to_editable_script
            editable_script = apply_corrections_to_editable_script(
                editable_script,
                payload["corrections"]
            )

        if not timeline_data:
            raise Exception("draft timeline not found")

        _update_task(task_id, progress=20, stage="restoring_part_files")
        _restore_part_files(parts, input_dir)

        _update_task(task_id, progress=25, stage="restoring_scene_assets")
        _restore_scene_assets(scene_assets, scene_dir)

        patched_timeline = copy.deepcopy(timeline_data)
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
            seg["part_file"] = edit_seg.get("part_file", seg.get("part_file"))

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
            _update_task(task_id, progress=30, stage="downloading_font")
            font_path = _safe_name_from_url(font_url, "custom_font.ttf")
            font_path = os.path.join(input_dir, font_path)
            _download_file(font_url, font_path)

        # 下载背景音乐
        bgm_path = None
        audio_config = payload.get("audio", {})
        bgm_url = audio_config.get("bgm_url")

        if bgm_url:
            _update_task(task_id, progress=35, stage="downloading_bgm")
            bgm_filename = _safe_name_from_url(bgm_url, "bgm.mp3")
            bgm_path = os.path.join(input_dir, bgm_filename)
            _download_file(bgm_url, bgm_path)
            print(f"✅ 背景音乐已下载：{bgm_path}")

        final_output = os.path.join(output_dir, "final.mp4")

        subtitle = payload.get("subtitle", {})
        position = subtitle.get("position", "bottom")
        alignment = _resolve_position_to_alignment(position)
        
        # 🎨 使用与前端 service_runner.py 一致的 margin_v 计算逻辑
        # 前端 y_offset: -100~100 百分比，0 是基准位置
        y_offset_pct = float(subtitle.get("y_offset", 0))
        offset_x = int(subtitle.get("x_offset", subtitle.get("offset_x", 0)))
        
        # 计算前端的 topPercent (从顶部的百分比位置)
        if position == "top":
            base_y_percent = 25
        else:  # bottom, center, custom
            base_y_percent = 50
        
        top_percent = base_y_percent - (y_offset_pct / 2)
        
        # 根据 alignment 计算 ASS margin_v (从屏幕边缘的距离)
        if alignment in [7, 8, 9]:  # 顶部对齐
            actual_margin_v = int(top_percent * 1080 / 100)
        elif alignment in [1, 2, 3]:  # 底部对齐
            actual_margin_v = int((100 - top_percent) * 1080 / 100)
        else:  # 居中对齐 (alignment=5)
            actual_margin_v = int(top_percent * 1080 / 100)
        
        actual_margin_v = max(0, actual_margin_v)
        
        # 🎨 与前端统一的字幕样式参数 - 颜色格式转换
        # 前端 color 是 HEX 格式 (#FFFF00)，需要转换为 ASS 格式 (&HAABBGGRR)
        highlight_color = _hex_to_ass_color(subtitle.get("color", "#FFFF00"))
        
        # stroke_color: 前端 HEX 格式 -> ASS 格式
        stroke_color_raw = subtitle.get("stroke_color", "#000000")
        stroke_color = _hex_to_ass_color(stroke_color_raw) if stroke_color_raw else None
        
        # stroke_width: 直接使用
        stroke_width = int(subtitle.get("stroke_width", 3))
        
        # background_color: 前端 rgba/HEX 格式 -> ASS 格式
        background_color_raw = subtitle.get("background_color", "rgba(0, 0, 0, 0.4)")
        background_color = _rgba_to_ass_color(background_color_raw) if background_color_raw else None
        
        # background_padding & radius
        background_padding = int(subtitle.get("background_padding", 8))
        background_radius = int(subtitle.get("background_radius", 8))

        _update_task(task_id, progress=50, stage="composing_video")

        # ★ 关键：明确指定 ass/resync 输出路径
        resync_json = os.path.splitext(final_output)[0] + "_resync.json"
        ass_file = os.path.splitext(final_output)[0] + ".ass"

        # 🆕 Task 1: 支持 pipeline.mode 参数
        pipeline_mode = payload.get("pipeline", {}).get("mode", "normal")
        subtitle_json = None
        
        # 纯场景模式：跳过 Whisper，使用提供的 subtitle_json
        if pipeline_mode == "scene_only":
            subtitle_json_url = payload.get("input", {}).get("subtitle_json_url")
            if subtitle_json_url:
                print(f"📥 下载字幕 JSON (纯场景模式): {subtitle_json_url}")
                subtitle_json = os.path.join(input_dir, "subtitle.json")
                _download_file(subtitle_json_url, subtitle_json)
            else:
                raise ValueError("纯场景模式 (mode=scene_only) 需要提供 input.subtitle_json_url")

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
            font_size=int(subtitle.get("font_size", 72)),  # 🎨 与前端 GlobalParamsVisualEditor.jsx 默认值统一
            highlight_color=highlight_color,  # 🎨 使用前端 color 参数转换后的 ASS 格式
            max_chars_per_line=int(subtitle.get("max_chars_per_line", 18)),
            alignment=alignment,
            margin_v=actual_margin_v,
            margin_l=int(subtitle.get("margin_l", 10)),
            margin_r=int(subtitle.get("margin_r", 10)),
            # 兼容前端字段名：优先使用 x_offset/y_offset，其次兼容 offset_x/offset_y
            offset_x=offset_x,
            offset_y=offset_y,
            corrections_file=corrections_file,
            bgm_url=bgm_path,
            bgm_volume=float(audio_config.get("bgm_volume", 0.3)),
            original_volume=float(audio_config.get("original_volume", 1.0)),
            bgm_start_time=float(audio_config.get("bgm_start_time", 0.0)),
            bgm_loop=bool(audio_config.get("bgm_loop", True)),
            fade_in_duration=float(audio_config.get("fade_in_duration", 0.5)),
            fade_out_duration=float(audio_config.get("fade_out_duration", 0.5)),
            # 🆕 Task 1: 纯场景模式参数
            mode=pipeline_mode,
            subtitle_json=subtitle_json,
            # 🆕 明确产物路径
            ass_output_path=ass_file,
            resync_json_output_path=resync_json,
            # 🎨 与前端统一的字幕样式参数（已转换为 ASS 格式）
            stroke_color=stroke_color,
            stroke_width=stroke_width,
            background_color=background_color,
            background_padding=background_padding,
            background_radius=background_radius,
        )

        if _is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")

        _update_task(task_id, progress=90, stage="uploading_results")

        # 使用统一的文件管理组件上传
        file_manager = FileManagerComponent()
        
        output_paths = {
            "final_video": final_output,
        }
        
        if payload.get("output", {}).get("need_ass", True):
            output_paths["ass_file"] = ass_file
        
        output_paths["resync_json"] = resync_json
        
        result_files = file_manager.upload_task_outputs(task_id, merchant_id, output_paths)

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
        # 使用统一的文件清理方法
        file_manager = FileManagerComponent()
        file_manager.cleanup_task_dir(task_dir, ignore_errors=True)


def _restore_part_files(parts: dict, input_dir: str):
    """把 draft 中的 part 文件从 MinIO 恢复到 compose 任务本地目录"""
    os.makedirs(input_dir, exist_ok=True)

    for part_key, info in (parts or {}).items():
        oss_key = info.get("oss_key")
        filename = info.get("filename") or f"{part_key}.mp4"
        if not oss_key:
            continue

        stem = os.path.splitext(filename)[0]
        prefix = stem.split("_part")[0] if "_part" in stem else stem

        parts_dir = os.path.join(input_dir, f"{prefix}_parts")
        os.makedirs(parts_dir, exist_ok=True)

        local_path = os.path.join(parts_dir, filename)
        if not os.path.isfile(local_path):
            print(f"📥 恢复 part 文件：{oss_key} -> {local_path}")
            download_file_from_oss(oss_key, local_path)


def _restore_scene_assets(scene_assets: dict, scene_dir: str):
    os.makedirs(scene_dir, exist_ok=True)
    for filename, info in (scene_assets or {}).items():
        oss_key = info.get("oss_key")
        if not oss_key:
            continue
        local_path = os.path.join(scene_dir, filename)
        download_file_from_oss(oss_key, local_path)


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

def _hex_to_ass_color(hex_color: str) -> str:
    """
    将前端 HEX 颜色 (#RRGGBB) 转换为 ASS 格式 (&H00BBGGRR)
    ASS 格式：&H00BBGGRR (BGR 顺序，前两位是透明度)
    """
    if not hex_color:
        return "&H0000DDFF"  # 默认金色
    if hex_color.startswith("#"):
        hex_color = hex_color[1:]
    if len(hex_color) == 6:
        r = hex_color[0:2]
        g = hex_color[2:4]
        b = hex_color[4:6]
        return f"&H00{b}{g}{r}"
    return "&H0000DDFF"  # 默认金色


def _rgba_to_ass_color(rgba_color: str) -> str:
    """
    将前端 rgba 颜色 (rgba(R,G,B,A) 或 rgba(R,G,B,A%)) 转换为 ASS 颜色格式 (&HAABBGGRR)
    A 值范围：0-1 或 0%-100%，ASS 中 00=透明，FF=不透明
    """
    if not rgba_color:
        return "&H80000000"
    
    rgba_color = rgba_color.strip()
    
    if rgba_color == "transparent":
        return "&H00000000"
    
    import re
    match = re.match(r'rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+%?))?\s*\)', rgba_color)
    if not match:
        # 尝试解析 hex
        if rgba_color.startswith('#'):
            return _hex_to_ass_color(rgba_color)
        return "&H80000000"
    
    r = int(match.group(1))
    g = int(match.group(2))
    b = int(match.group(3))
    a_str = match.group(4) if match.group(4) else "1"
    
    # 解析 alpha 值
    if a_str.endswith('%'):
        a = int(float(a_str[:-1]) / 100 * 255)
    else:
        a_float = float(a_str)
        if a_float > 1:
            a = int(a_float)  # 已经是 0-255
        else:
            a = int(a_float * 255)  # 0-1 范围
    
    return f"&H{a:02X}{b:02X}{g:02X}{r:02X}"

def _safe_name_from_url(url: str, default_name: str) -> str:
    from urllib.parse import urlparse
    path = urlparse(url).path
    name = os.path.basename(path.strip("/"))
    return name or default_name


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


def _update_task(task_id: str, **kwargs):
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            return
        for k, v in kwargs.items():
            setattr(task, k, v)
        task.updated_at = datetime.now(timezone.utc)
        db.add(task)


def _is_task_cancelled(task_id: str) -> bool:
    from redis import Redis
    try:
        redis_conn = Redis.from_url(settings.REDIS_URL)
        return redis_conn.exists(f"task:cancel:{task_id}") > 0
    except Exception:
        return False


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
