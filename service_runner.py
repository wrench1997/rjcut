#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import json
import shutil
import hashlib
import mimetypes
import requests
from threading import Thread
from urllib.parse import urljoin, urlparse

from service_store import update_task, set_task_result, set_task_error


BASE_TASK_DIR = os.path.abspath("./service_data")


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def safe_name_from_url(url: str, default_name: str) -> str:
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


# calc_actual_margin_v 函数已废弃，改用 topPercent 计算逻辑（与前端 GlobalParamsVisualEditor.jsx 一致）

def hex_to_ass_color(hex_color: str) -> str:
    """
    将 HEX 颜色 (#RRGGBB) 转换为 ASS 格式 (&H00BBGGRR)
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


def rgba_to_ass_color(rgba_color: str) -> str:
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
            return hex_to_ass_color(rgba_color)
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


def convert_subtitle_params(subtitle: dict, video_width: int = 1920, video_height: int = 1080) -> dict:
    """
    将前端字幕参数转换为后端 burn_whisper_subtitle 接受的参数
    
    参数映射逻辑：
    - position → alignment (bottom→2, center→5, top→8)
    - y_offset + position → margin_v (ASS 从屏幕边缘的距离)
    - x_offset → offset_x (水平偏移像素)
    - color (HEX) → highlight_color (ASS 格式)
    - stroke_color (HEX) → stroke_color (ASS 格式)
    - background_color (rgba/HEX) → background_color (ASS 格式)
    
    前端位置计算：
    - top: baseYPercent=25, topPercent = 25 - y_offset/2
    - bottom/custom: baseYPercent=50, topPercent = 50 - y_offset/2
    - center: baseYPercent=50, topPercent = 50 - y_offset/2
    
    后端 ASS margin_v：
    - alignment=2 (底部): margin_v = (100 - topPercent) * video_height / 100
    - alignment=8 (顶部): margin_v = topPercent * video_height / 100
    """
    # 1. position → alignment
    position = subtitle.get("position", "bottom")
    alignment = resolve_position_to_alignment(position)

    # 2. 获取前端 y_offset (百分比 -100~100)
    y_offset_pct = float(subtitle.get("y_offset", 0))
    x_offset_pct = float(subtitle.get("x_offset", 0))

    # 3. 计算前端的 topPercent (从顶部的百分比位置)
    if position == "top":
        base_y_percent = 25
    else:  # bottom, center, custom
        base_y_percent = 50
    
    top_percent = base_y_percent - (y_offset_pct / 2)

    # 4. 根据 alignment 计算 ASS margin_v (从屏幕边缘的距离)
    if alignment in [7, 8, 9]:  # 顶部对齐
        # margin_v 从顶部计算
        margin_v = int(top_percent * video_height / 100)
    elif alignment in [1, 2, 3]:  # 底部对齐
        # margin_v 从底部计算 = (100 - topPercent) 的高度
        margin_v = int((100 - top_percent) * video_height / 100)
    else:  # 居中对齐 (alignment=5)
        # 居中时使用 topPercent 计算
        margin_v = int(top_percent * video_height / 100)

    # 5. x_offset 转换为像素偏移
    offset_x = int(x_offset_pct * video_width / 100)

    # 6. offset_y 设为 0，因为垂直位置已经通过 margin_v 精确计算（前端 y_offset → topPercent → margin_v）
    offset_y = 0

    # 7. 前端基础色与当前字高亮色分离，保持渲染端与前端预览一致
    color = subtitle.get("color", "#FFFFFF")
    highlight_color = hex_to_ass_color(subtitle.get("highlight_color", "#FFD400"))

    # 8. stroke_color: 前端 HEX → ASS 格式
    stroke_color_raw = subtitle.get("stroke_color", "#000000")
    stroke_color = hex_to_ass_color(stroke_color_raw) if stroke_color_raw else None

    # 9. background_color: 前端 rgba/HEX → ASS 格式
    background_color_raw = subtitle.get("background_color", "rgba(0, 0, 0, 0.4)")
    background_color = rgba_to_ass_color(background_color_raw) if background_color_raw else None

    print(f"  🎨 字幕参数转换：position={position}, alignment={alignment}, top_percent={top_percent:.1f}%, margin_v={margin_v}px, x_offset={offset_x}px")

    return {
        "alignment": alignment,
        "margin_v": margin_v,
        "margin_l": int(subtitle.get("margin_l", 10)),
        "margin_r": int(subtitle.get("margin_r", 10)),
        "x_offset": offset_x,  # 水平偏移像素（前端 x_offset 转换）
        "y_offset": 0,  # 垂直位置已通过 margin_v 精确计算，此处设为 0
        "highlight_color": highlight_color,
        "font_size": int(subtitle.get("font_size", 68)),
        "color": color,
        "effect": subtitle.get("effect", "ad"),
        # 🎨 传递字幕样式参数到后端（已转换为 ASS 格式）
        "stroke_color": stroke_color,
        "stroke_width": int(subtitle.get("stroke_width", 3)),
        "background_color": background_color,
        "background_padding": int(subtitle.get("background_padding", 8)),
        "background_radius": int(subtitle.get("background_radius", 8)),
    }


def build_file_entry(task_id: str, file_key: str, path: str):
    exists = bool(path and os.path.isfile(path))
    size = os.path.getsize(path) if exists else None
    mime, _ = mimetypes.guess_type(path) if path else (None, None)
    return {
        "path": path,
        "exists": exists,
        "size": size,
        "mime_type": mime or "application/octet-stream",
        "download_url": f"/v1/tasks/{task_id}/files/{file_key}" if exists else None,
    }


def build_result_files(task_id: str, paths: dict):
    return {
        k: build_file_entry(task_id, k, v)
        for k, v in paths.items()
    }


def run_agent_compose_task(task_id: str, payload: dict, trace_id: str):
    from cut_transition import process as cut_process
    from lip_sync import compose_from_timeline

    task_dir = os.path.join(BASE_TASK_DIR, task_id)
    input_dir = os.path.join(task_dir, "input")
    output_dir = os.path.join(task_dir, "output")
    scene_dir = os.path.join(task_dir, "scenes")

    ensure_dir(input_dir)
    ensure_dir(output_dir)
    ensure_dir(scene_dir)

    try:
        req = payload

        # ── 下载主视频 ──
        update_task(task_id, status="processing", progress=5, stage="downloading_input")
        video_url = req["input"]["video_url"]
        video_name = safe_name_from_url(video_url, "input.mp4")
        input_video = os.path.join(input_dir, video_name)
        download_file(video_url, input_video)

        # ── 下载 script ──
        script_path = None
        script_data = None
        script_url = req["input"].get("script_url")
        if script_url:
            update_task(task_id, progress=10, stage="downloading_script")
            script_path = os.path.join(
                input_dir,
                safe_name_from_url(script_url, "script.json")
            )
            download_file(script_url, script_path)
            with open(script_path, "r", encoding="utf-8") as f:
                script_data = json.load(f)

        # ── 下载 corrections ──
        corrections_path = None
        corrections_url = req["input"].get("corrections_url")
        if corrections_url:
            update_task(task_id, progress=12, stage="downloading_corrections")
            corrections_path = os.path.join(
                input_dir,
                safe_name_from_url(corrections_url, "corrections.json")
            )
            download_file(corrections_url, corrections_path)

        # ── 下载 font ──
        font_path = None
        font_url = req.get("subtitle", {}).get("font_url")
        if font_url:
            update_task(task_id, progress=14, stage="downloading_font")
            font_path = os.path.join(
                input_dir,
                safe_name_from_url(font_url, "custom_font.ttf")
            )
            download_file(font_url, font_path)

        # ── 下载场景素材 ──
        scene_base_url = req["input"].get("scene_base_url")
        if script_data and scene_base_url:
            update_task(task_id, progress=18, stage="downloading_scenes")
            for seg in script_data.get("segments", []):
                if seg.get("flag") == "scene" and seg.get("scene_file"):
                    original_scene_file = seg["scene_file"]
                    basename = os.path.basename(original_scene_file)
                    local_scene_path = os.path.join(scene_dir, basename)

                    if not os.path.isfile(local_scene_path):
                        scene_url = urljoin(
                            scene_base_url.rstrip("/") + "/",
                            original_scene_file
                        )
                        download_file(scene_url, local_scene_path)

                    seg["scene_file"] = basename

            with open(script_path, "w", encoding="utf-8") as f:
                json.dump(script_data, f, ensure_ascii=False, indent=2)

        # ── STEP 1: cut_transition ──
        update_task(task_id, progress=25, stage="cut_transition")
        cut_process(
            input_path=input_video,
            keyword=req.get("pipeline", {}).get("remove_keyword", "转场"),
            model_size=req.get("asr", {}).get("model", "large-v3"),
            device="cuda",  # 强制替换 req.get("asr", {}).get("device", "cuda") 为 "cuda"            output_dir=output_dir,
            margin=float(req.get("pipeline", {}).get("margin", 0.15)),
            keep_parts=True,
            min_seg_duration=float(req.get("pipeline", {}).get("min_segment_duration", 0.1)),
            gen_timeline=True if script_path else False,
            script_path=script_path,
            lip_sync=False,
            lip_sync_args=None,
        )

        base = os.path.splitext(os.path.basename(input_video))[0]
        cleaned_video = os.path.join(output_dir, f"{base}_cleaned.mp4")
        timeline_json = os.path.join(output_dir, f"{base}_timeline.json")
        transcription_json = os.path.join(output_dir, f"{base}_transcription.json")
        final_output = os.path.join(output_dir, f"{base}_final.mp4")

        # ── STEP 2: timeline 合成 ──
        if script_path and os.path.isfile(timeline_json):
            update_task(task_id, progress=60, stage="compose_timeline")


# 🆕 Task 1: 支持 pipeline.mode 参数
            pipeline_mode = req.get("pipeline", {}).get("mode", "normal")
            subtitle_json = None
            
            if pipeline_mode == "scene_only":
                subtitle_json_url = req.get("input", {}).get("subtitle_json_url")
                if subtitle_json_url:
                    print(f"📥 下载字幕 JSON (纯场景模式): {subtitle_json_url}")
                    subtitle_json = os.path.join(input_dir, "subtitle.json")
                    download_file(subtitle_json_url, subtitle_json)
                else:
                    raise ValueError("纯场景模式 (mode=scene_only) 需要提供 input.subtitle_json_url")

            # 🆕 使用转换函数处理字幕参数（支持前端百分比偏移）
            subtitle = req.get("subtitle", {})
            subtitle_params = convert_subtitle_params(subtitle)

            compose_from_timeline(
                timeline_path=timeline_json,
                output_video=final_output,
                scene_dir=scene_dir,
                use_transitions=bool(req.get("pipeline", {}).get("use_transitions", False)),
                transition_type=req.get("pipeline", {}).get("transition_type", "fade"),
                transition_duration=float(req.get("pipeline", {}).get("transition_duration", 0.8)),
                resync=bool(req.get("pipeline", {}).get("resync_subtitle", True)),
                model_size=req.get("asr", {}).get("model", "large-v3"),
                device=req.get("asr", {}).get("device", "cpu"),
                language=req.get("asr", {}).get("language", "zh"),
                effect=subtitle_params["effect"],
                font_file=font_path,
                font_size=subtitle_params["font_size"],
                highlight_color=subtitle_params["highlight_color"],
                max_chars_per_line=int(subtitle.get("max_chars_per_line", 15)),
                color=subtitle_params["color"],
                alignment=subtitle_params["alignment"],
                margin_v=subtitle_params["margin_v"],
                margin_l=subtitle_params["margin_l"],
                margin_r=subtitle_params["margin_r"],
                x_offset=subtitle_params["x_offset"],
                y_offset=subtitle_params["y_offset"],
                corrections_file=corrections_path,
                # 🆕 Task 1: 纯场景模式参数
                mode=pipeline_mode,
                subtitle_json=subtitle_json,
                # 🎨 传递字幕样式参数到 lip_sync.py
                stroke_color=subtitle_params.get("stroke_color"),
                stroke_width=subtitle_params.get("stroke_width"),
                background_color=subtitle_params.get("background_color"),
                background_padding=subtitle_params.get("background_padding"),
                background_radius=subtitle_params.get("background_radius"),
            )
        else:
            shutil.copy2(cleaned_video, final_output)

        update_task(task_id, progress=95, stage="packaging_result")

        resync_json = os.path.splitext(final_output)[0] + "_resync.json"
        ass_file = os.path.splitext(final_output)[0] + ".ass"

        raw_paths = {
            "input_video": input_video,
            "cleaned_video": cleaned_video,
            "timeline_json": timeline_json,
            "transcription_json": transcription_json,
            "final_video": final_output,
            "resync_json": resync_json,
            "ass_file": ass_file,
        }

        result = {
            "task_dir": task_dir,
            "files": build_result_files(task_id, raw_paths),
        }

        set_task_result(task_id, result)

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

    except Exception as e:
        set_task_error(task_id, str(e))
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


def submit_agent_compose_task(task_id: str, payload: dict, trace_id: str):
    th = Thread(
        target=run_agent_compose_task,
        args=(task_id, payload, trace_id),
        daemon=True,
    )
    th.start()
