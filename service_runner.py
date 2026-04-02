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


def calc_actual_margin_v(position: str, margin_v: int, offset_y: int) -> int:
    alignment = resolve_position_to_alignment(position)
    actual_margin_v = margin_v
    if offset_y != 0:
        if alignment in [7, 8, 9]:
            actual_margin_v = max(0, margin_v + offset_y)
        elif alignment in [1, 2, 3]:
            actual_margin_v = max(0, margin_v - offset_y)
    return actual_margin_v


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
            device=req.get("asr", {}).get("device", "cpu"),
            output_dir=output_dir,
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
                device=req.get("asr", {}).get("device", "cpu"),
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