"""
Visual Script Editor 任务处理器 - AI 自动剪辑特殊片段

基于 TwelveLabs Pegasus 1.5 + Gemini 实现：
1. 使用 Pegasus 分析视频素材，生成候选镜头目录
2. 使用 Gemini 根据视觉脚本选择并排序镜头
3. 生成 EDL、字幕 SRT、FFmpeg 命令，可选渲染 rough cut
"""

import os
import json
import shutil
import tempfile
from datetime import datetime, timezone
from typing import Dict, Any, List
from pathlib import Path

from config import get_settings
from database import get_db_session
from models import Task, TaskStatus
from quota import confirm_quota, refund_quota
from oss import (
    is_oss_key, 
    presigned_get_url, 
    upload_file_to_oss,
    download_file_from_oss,
)
from tasks import register_task
from tasks.components import TaskContext

settings = get_settings()

# 导入 TwelveLabs 和 Gemini SDK（懒加载）
TwelveLabs = None
genai = None


def _ensure_sdk():
    """确保 SDK 已安装"""
    global TwelveLabs, genai
    try:
        from twelvelabs import TwelveLabs as TL
        TwelveLabs = TL
    except ImportError as exc:
        raise RuntimeError(
            "Missing TwelveLabs SDK. Install with:\n"
            "  pip install twelvelabs\n"
            f"Details: {exc}"
        )
    
    try:
        from google import genai as GenAI
        genai = GenAI
    except ImportError:
        pass  # Will fail later only if Gemini is actually used


# 默认候选镜头定义（与 visual_script_editor_free_director.py 保持一致）
DEFAULT_CANDIDATE_SHOT_DEFINITION = {
    "id": "usable_editorial_shots",
    "description": (
        "Extract all distinct, continuous, editor-ready fashion or commercial visual shots. "
        "A shot may show a model walking, turning, posing, looking at camera, interacting with a product, "
        "or a useful atmospheric/detail/establishing image. Keep only footage with a readable subject and action, "
        "a deliberate composition, and acceptable technical quality. Exclude camera setup, crew, clapperboards, "
        "empty waiting, accidental framing, obvious focus failures, severe shake, duplicate takes when one is clearly inferior, "
        "and unusable blurred or blocked moments. Segment at meaningful action/composition changes. "
        "The result will be used later to match an abstract advertising script to real shots, so describe visual intent precisely."
    ),
    "fields": [
        {
            "name": "shot_description",
            "type": "string",
            "description": "Chinese description of the exact visible subject, action, pose, setting, clothing/product, and composition in this segment.",
        },
        {
            "name": "shot_size",
            "type": "string",
            "enum": ["extreme_wide", "wide", "full_body", "medium", "close_up", "extreme_close_up", "detail"],
            "description": "The dominant framing size.",
        },
        {
            "name": "camera_motion",
            "type": "string",
            "enum": ["static", "handheld", "push_in", "pull_out", "pan", "tilt", "tracking", "orbit", "unknown"],
            "description": "The dominant camera motion.",
        },
        {
            "name": "actions",
            "type": "array",
            "items": {"type": "string"},
            "description": "Short Chinese action/pose tags, such as 向镜头走来，回头，直视镜头，衣料细节，停步摆姿势.",
        },
        {
            "name": "moods",
            "type": "array",
            "items": {"type": "string"},
            "description": "Short Chinese visual-emotion tags, such as 冷感，自信，松弛，张力，神秘，活力，高级感.",
        },
        {
            "name": "visual_roles",
            "type": "array",
            "items": {"type": "string"},
            "description": "Potential editorial uses, such as 开场建立，人物登场，氛围过渡，产品细节，情绪高潮，收尾定格.",
        },
        {
            "name": "technical_quality_score",
            "type": "number",
            "description": "0-100. Score focus, exposure, framing, camera stability, and freedom from obvious mistakes.",
        },
        {
            "name": "visual_strength_score",
            "type": "number",
            "description": "0-100. Score clarity of action, facial expression, styling/product visibility, composition, and commercial/editorial impact.",
        },
        {
            "name": "continuity_notes",
            "type": "string",
            "description": "Chinese note about how to enter/exit this shot, e.g. 动作刚开始，可接回头特写，适合 2-4 秒使用.",
        },
    ],
}


@register_task("visual_script_editor")
def run_visual_script_editor_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    """
    Visual Script Editor 任务主处理器
    
    参数:
        task_id: 任务 ID
        payload: 任务参数（包含 script_lines, style, sources, options）
        trace_id: 追踪 ID
        merchant_id: 商户 ID
    """
    _ensure_sdk()
    
    task_dir = os.path.join(settings.BASE_TASK_DIR, task_id)
    input_dir = os.path.join(task_dir, "input")
    output_dir = os.path.join(task_dir, "output")
    
    os.makedirs(input_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        # 更新任务状态
        _update_task(
            task_id,
            status=TaskStatus.processing,
            progress=5,
            stage="initializing",
            started_at=datetime.now(timezone.utc),
        )
        
        if _is_task_cancelled(task_id):
            raise InterruptedError("task cancelled by user")
        
        # 提取参数
        script_lines = payload.get("script_lines", [])
        style = payload.get("style", "")
        sources = payload.get("sources", [])
        options = payload.get("options", {})
        
        if not script_lines:
            raise ValueError("script_lines is required")
        if not style:
            raise ValueError("style is required")
        if not sources:
            raise ValueError("at least one video source is required")
        
        # 提取选项
        min_shot_seconds = float(options.get("min_shot_seconds", 2.0))
        max_shot_seconds = float(options.get("max_shot_seconds", 10.0))
        max_candidates = int(options.get("max_candidates_per_video", 30))
        target_seconds = float(options.get("target_seconds", 45.0))
        thinking_level = options.get("thinking_level", "low")
        gemini_model = options.get("gemini_model", "gemini-3-flash-preview")
        should_render = options.get("render", False)
        canvas = options.get("canvas", "9:16")
        fit = options.get("fit", "contain")
        reuse_catalog_oss_key = options.get("reuse_catalog_oss_key")
        
        # 检查 API Keys
        twelvelabs_key = os.getenv("TWELVELABS_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY")
        
        if not twelvelabs_key:
            raise ValueError("TWELVELABS_API_KEY environment variable is not set")
        
        # 初始化 TwelveLabs 客户端
        twelve_client = TwelveLabs(api_key=twelvelabs_key)
        
        # 检查是否复用已有 catalog
        all_catalog = []
        sources_info = []
        raw_by_source = {}
        task_ids = {}
        
        if reuse_catalog_oss_key and is_oss_key(reuse_catalog_oss_key):
            # 复用已有 catalog
            _update_task(task_id, progress=10, stage="loading_existing_catalog")
            catalog_local_path = os.path.join(input_dir, "shot_catalog.json")
            download_file_from_oss(reuse_catalog_oss_key, catalog_local_path)
            
            with open(catalog_local_path, "r", encoding="utf-8") as f:
                catalog_payload = json.load(f)
            
            all_catalog = catalog_payload.get("candidate_shots", [])
            sources_info = catalog_payload.get("sources", [])
            raw_by_source = catalog_payload.get("raw_pegasus_responses", {})
            
            print(f"[resume] loaded {len(all_catalog)} candidate shots from {reuse_catalog_oss_key}")
        else:
            # 新建 catalog - 下载视频并上传到 TwelveLabs
            _update_task(task_id, progress=10, stage="downloading_videos")
            
            for idx, src in enumerate(sources, start=1):
                oss_key = src.get("oss_key")
                local_path = src.get("local_path")
                url = src.get("url")
                
                video_local_path = None
                source_label = src.get("label", f"source_{idx:02d}")
                
                if oss_key and is_oss_key(oss_key):
                    # 从 OSS 下载
                    video_local_path = os.path.join(input_dir, f"src_{idx:02d}_{source_label}")
                    _update_task(task_id, progress=10 + (idx * 10), stage=f"downloading_{source_label}")
                    download_file_from_oss(oss_key, video_local_path)
                    source_label = os.path.basename(oss_key)
                elif local_path and os.path.isfile(local_path):
                    # 本地文件（后端可访问）
                    video_local_path = local_path
                    source_label = os.path.basename(local_path)
                elif url:
                    # 公开 URL - 需要下载
                    video_local_path = os.path.join(input_dir, f"src_{idx:02d}_{source_label}")
                    _download_file(url, video_local_path)
                else:
                    raise ValueError(f"Source {idx} has no valid oss_key, local_path, or url")
                
                # 检查文件大小（TwelveLabs 直接上传限制 200MB）
                size_mb = os.path.getsize(video_local_path) / 1024 / 1024
                if size_mb > 200:
                    # 创建代理文件
                    proxy_path = os.path.join(input_dir, f"src_{idx:02d}_proxy.mp4")
                    _create_proxy_video(video_local_path, proxy_path)
                    video_local_path = proxy_path
                    size_mb = os.path.getsize(video_local_path) / 1024 / 1024
                
                print(f"[upload] {source_label} ({size_mb:.1f} MB)")
                
                # 上传到 TwelveLabs
                with open(video_local_path, "rb") as f:
                    asset = twelve_client.assets.create(
                        method="direct",
                        file=f,
                        filename=os.path.basename(video_local_path)
                    )
                
                if not asset.id:
                    raise RuntimeError(f"TwelveLabs did not return an asset id for {source_label}")
                
                # 等待处理完成
                _wait_for_asset(twelve_client, asset.id, poll_seconds=5.0)
                
                sources_info.append({
                    "source_id": f"src_{idx:02d}",
                    "label": source_label,
                    "locator": video_local_path,
                    "local_path": video_local_path,
                    "asset_id": asset.id,
                })
        
        # 如果还没有 catalog，进行 Pegasus 分析
        if not all_catalog and sources_info:
            _update_task(task_id, progress=30, stage="pegasus_analysis")
            
            for src_info in sources_info:
                print(f"\n=== Pegasus catalog: {src_info['source_id']} / {src_info['label']} ===")
                
                # 创建视频上下文
                from twelvelabs.types import VideoContext_AssetId
                video_context = VideoContext_AssetId(asset_id=src_info["asset_id"])
                
                # 创建分析任务
                task_result = twelve_client.analyze_async.tasks.create(
                    video=video_context,
                    model_name="pegasus1.5",
                    analysis_mode="time_based_metadata",
                    temperature=0.1,
                    max_tokens=16384,
                    min_segment_duration=min_shot_seconds,
                    max_segment_duration=max_shot_seconds,
                    response_format={
                        "type": "segment_definitions",
                        "segment_definitions": [DEFAULT_CANDIDATE_SHOT_DEFINITION],
                        "segment_time_format": "seconds",
                    },
                )
                
                # 等待分析完成
                completed = _wait_for_analysis(twelve_client, task_result.task_id, poll_seconds=5.0)
                
                if not completed.result or not completed.result.data:
                    raise RuntimeError(f"Pegasus returned no analysis data for {src_info['label']}")
                
                raw = json.loads(completed.result.data)
                
                # 标准化 catalog
                catalog = _normalize_catalog(
                    src_info,
                    raw,
                    max_candidates,
                    min_shot_seconds,
                    max_shot_seconds,
                )
                
                print(f"[pegasus] retained {len(catalog)} candidate shots for {src_info['label']}")
                all_catalog.extend(catalog)
                raw_by_source[src_info["source_id"]] = raw
                task_ids[src_info["source_id"]] = completed.task_id
        
        if not all_catalog:
            raise ValueError("No candidate shots were generated from the video sources")
        
        # 保存 catalog
        catalog_payload = {
            "style": style,
            "script": script_lines,
            "sources": sources_info,
            "candidate_shots": all_catalog,
            "raw_pegasus_responses": raw_by_source,
        }
        
        catalog_local_path = os.path.join(output_dir, "shot_catalog.json")
        with open(catalog_local_path, "w", encoding="utf-8") as f:
            json.dump(catalog_payload, f, ensure_ascii=False, indent=2)
        
        # 上传 catalog 到 OSS
        catalog_oss_key = f"visual_script/{task_id}/shot_catalog.json"
        upload_file_to_oss(catalog_local_path, catalog_oss_key)
        
        _update_task(task_id, progress=50, stage="gemini_director")
        
        # 运行 Gemini 导演
        if not gemini_key:
            raise ValueError("GEMINI_API_KEY environment variable is not set")
        
        raw_plan = _run_gemini_director(
            api_key=gemini_key,
            model=gemini_model,
            script_lines=script_lines,
            style=style,
            catalog=all_catalog,
            target_seconds=target_seconds,
            thinking_level=thinking_level,
        )
        
        # 验证计划
        plan, edl = _validate_plan(raw_plan, script_lines, all_catalog)
        
        _update_task(task_id, progress=70, stage="generating_outputs")
        
        # 生成输出文件
        # 1. Edit Plan
        plan_local_path = os.path.join(output_dir, "edit_plan.json")
        with open(plan_local_path, "w", encoding="utf-8") as f:
            json.dump(plan, f, ensure_ascii=False, indent=2)
        plan_oss_key = f"visual_script/{task_id}/edit_plan.json"
        upload_file_to_oss(plan_local_path, plan_oss_key)
        
        # 2. EDL
        edl_local_path = os.path.join(output_dir, "edit_decision_list.json")
        with open(edl_local_path, "w", encoding="utf-8") as f:
            json.dump(edl, f, ensure_ascii=False, indent=2)
        edl_oss_key = f"visual_script/{task_id}/edit_decision_list.json"
        upload_file_to_oss(edl_local_path, edl_oss_key)
        
        # 3. SRT 字幕
        srt_local_path = os.path.join(output_dir, "script_overlay.srt")
        _write_srt(edl, srt_local_path)
        srt_oss_key = f"visual_script/{task_id}/script_overlay.srt"
        upload_file_to_oss(srt_local_path, srt_oss_key)
        
        # 4. FFmpeg 命令
        ffmpeg_local_path = os.path.join(output_dir, "ffmpeg_render_commands.txt")
        _write_ffmpeg_commands(edl, output_dir, canvas, fit, ffmpeg_local_path)
        ffmpeg_oss_key = f"visual_script/{task_id}/ffmpeg_render_commands.txt"
        upload_file_to_oss(ffmpeg_local_path, ffmpeg_oss_key)
        
        # 5. 可选：渲染 rough cut
        rough_cut_oss_key = None
        if should_render:
            _update_task(task_id, progress=80, stage="rendering_rough_cut")
            
            # 检查所有选中的片段是否有本地源
            remote_clips = [clip for clip in edl if not clip.get("local_source")]
            if remote_clips:
                print(f"[warning] skipping render: {len(remote_clips)} clips have no local source")
            else:
                try:
                    rough_cut_path = _render_rough_cut(edl, output_dir, canvas, fit)
                    rough_cut_oss_key = f"visual_script/{task_id}/rough_cut.mp4"
                    upload_file_to_oss(rough_cut_path, rough_cut_oss_key)
                except Exception as e:
                    print(f"[warning] render failed: {e}")
        
        # 更新任务状态为成功
        result = {
            "shot_catalog_oss_key": catalog_oss_key,
            "edit_plan_oss_key": plan_oss_key,
            "edl_oss_key": edl_oss_key,
            "srt_oss_key": srt_oss_key,
            "ffmpeg_commands_oss_key": ffmpeg_oss_key,
            "rough_cut_oss_key": rough_cut_oss_key,
            "total_candidates": len(all_catalog),
            "selected_clips": len(edl),
            "uncovered_beats": len(plan.get("uncovered_script_lines", [])),
            "total_duration": sum(clip.get("duration", 0) for clip in edl),
        }
        
        _update_task(
            task_id,
            status=TaskStatus.succeeded,
            progress=100,
            stage="completed",
            result=result,
            finished_at=datetime.now(timezone.utc),
        )
        
        confirm_quota(task_id)
        
        # 发送回调
        callback_url = payload.get("callback_url")
        if callback_url:
            _send_callback(
                callback_url,
                {
                    "event": "task.succeeded",
                    "task_id": task_id,
                    "trace_id": trace_id,
                    "status": "succeeded",
                    "result": result,
                },
                payload.get("callback_secret"),
            )
        
        # 清理临时文件（保留 output_dir 供调试）
        try:
            shutil.rmtree(input_dir, ignore_errors=True)
        except Exception:
            pass
        
    except InterruptedError as e:
        # 任务被取消
        _update_task(
            task_id,
            status=TaskStatus.cancelled,
            stage="cancelled",
            error=str(e),
            finished_at=datetime.now(timezone.utc),
        )
        refund_quota(task_id, reason="cancelled by user")
        
    except Exception as e:
        # 任务失败
        import traceback
        error_detail = f"{str(e)}\n{traceback.format_exc()}"
        
        _update_task(
            task_id,
            status=TaskStatus.failed,
            stage="failed",
            error=error_detail[:4000],
            finished_at=datetime.now(timezone.utc),
        )
        refund_quota(task_id, reason=str(e)[:200])
        
        # 发送失败回调
        callback_url = payload.get("callback_url")
        if callback_url:
            _send_callback(
                callback_url,
                {
                    "event": "task.failed",
                    "task_id": task_id,
                    "trace_id": trace_id,
                    "status": "failed",
                    "error": str(e),
                },
                payload.get("callback_secret"),
            )
        
        # 清理临时文件
        try:
            shutil.rmtree(task_dir, ignore_errors=True)
        except Exception:
            pass


def _update_task(task_id: str, **kwargs):
    """更新任务状态"""
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task:
            for key, value in kwargs.items():
                setattr(task, key, value)
            db.add(task)
            db.commit()


def _is_task_cancelled(task_id: str) -> bool:
    """检查任务是否被取消"""
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task and task.status == TaskStatus.cancelled:
            return True
    return False


def _wait_for_asset(client, asset_id: str, poll_seconds: float) -> None:
    """等待 TwelveLabs 资产处理完成"""
    while True:
        asset = client.assets.retrieve(asset_id)
        print(f"[asset] {asset_id} status={asset.status}")
        if asset.status == "ready":
            return
        if asset.status == "failed":
            raise RuntimeError(f"Asset processing failed: {asset_id}")
        import time
        time.sleep(poll_seconds)


def _wait_for_analysis(client, task_id: str, poll_seconds: float):
    """等待 Pegasus 分析完成"""
    while True:
        task = client.analyze_async.tasks.retrieve(task_id)
        print(f"[pegasus] task={task_id} status={task.status}")
        if task.status == "ready":
            return task
        if task.status == "failed":
            message = getattr(getattr(task, "error", None), "message", "Unknown error")
            raise RuntimeError(f"Pegasus analysis failed: {message}")
        import time
        time.sleep(poll_seconds)


def _to_number(value, fallback: float = 0.0) -> float:
    """安全转换为数字"""
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _candidate_score(candidate: dict) -> float:
    """计算候选镜头分数"""
    metadata = candidate.get("metadata", {})
    technical = _to_number(metadata.get("technical_quality_score"), 0.0)
    visual = _to_number(metadata.get("visual_strength_score"), 0.0)
    return round(technical * 0.45 + visual * 0.55, 2)


def _overlap_ratio(a: dict, b: dict) -> float:
    """计算两个镜头的重叠比例"""
    start = max(_to_number(a.get("start_time")), _to_number(b.get("start_time")))
    end = min(_to_number(a.get("end_time")), _to_number(b.get("end_time")))
    intersection = max(0.0, end - start)
    shortest = min(
        max(0.001, _to_number(a.get("end_time")) - _to_number(a.get("start_time"))),
        max(0.001, _to_number(b.get("end_time")) - _to_number(b.get("start_time"))),
    )
    return intersection / shortest


def _normalize_catalog(
    source: dict,
    raw_response: dict,
    max_candidates: int,
    min_shot_seconds: float,
    max_shot_seconds: float,
) -> List[dict]:
    """标准化 Pegasus 输出为候选镜头目录"""
    items = raw_response.get("usable_editorial_shots", [])
    if not isinstance(items, list):
        raise ValueError(f"Unexpected Pegasus result for {source['label']}: usable_editorial_shots is not a list.")
    
    normalized = []
    for idx, item in enumerate(items, start=1):
        start = _to_number(item.get("start_time"), -1)
        end = _to_number(item.get("end_time"), -1)
        if start < 0 or end <= start:
            continue
        
        duration = end - start
        if duration < min_shot_seconds or duration > max_shot_seconds:
            continue
        
        metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        normalized.append({
            "candidate_id": f"{source['source_id']}_shot_{idx:03d}",
            "source_id": source["source_id"],
            "source_label": source["label"],
            "source_locator": source["locator"],
            "local_source": source.get("local_path"),
            "start_time": round(start, 3),
            "end_time": round(end, 3),
            "duration": round(duration, 3),
            "selection_score": _candidate_score(item),
            "metadata": metadata,
        })
    
    # 去重：移除高度重叠的镜头
    chosen = []
    for candidate in sorted(normalized, key=_candidate_score, reverse=True):
        if any(_overlap_ratio(candidate, existing) >= 0.80 for existing in chosen):
            continue
        chosen.append(candidate)
        if len(chosen) >= max_candidates:
            break
    
    chosen.sort(key=lambda row: row["start_time"])
    return chosen


def _compact_candidate(candidate: dict) -> dict:
    """压缩候选镜头信息用于 Gemini prompt"""
    metadata = candidate.get("metadata", {})
    return {
        "candidate_id": candidate["candidate_id"],
        "source_id": candidate["source_id"],
        "source_label": candidate["source_label"],
        "start_time": candidate["start_time"],
        "end_time": candidate["end_time"],
        "duration": candidate["duration"],
        "selection_score": candidate["selection_score"],
        "shot_description": str(metadata.get("shot_description", ""))[:260],
        "shot_size": metadata.get("shot_size", "unknown"),
        "camera_motion": metadata.get("camera_motion", "unknown"),
        "actions": metadata.get("actions", []),
        "moods": metadata.get("moods", []),
        "visual_roles": metadata.get("visual_roles", []),
        "continuity_notes": str(metadata.get("continuity_notes", ""))[:180],
    }


def _director_schema(candidate_ids: List[str]) -> dict:
    """构建 Gemini 响应 Schema"""
    shot_choice = {
        "type": "object",
        "properties": {
            "candidate_id": {"type": "string", "enum": candidate_ids},
            "trim_start_offset_sec": {"type": "number"},
            "trim_end_offset_sec": {"type": "number"},
            "why_this_shot": {"type": "string"},
        },
        "required": ["candidate_id", "trim_start_offset_sec", "trim_end_offset_sec", "why_this_shot"],
    }
    return {
        "type": "object",
        "properties": {
            "project_title": {"type": "string"},
            "creative_rationale": {"type": "string"},
            "timeline": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "script_index": {"type": "integer"},
                        "script_line": {"type": "string"},
                        "shots": {"type": "array", "items": shot_choice},
                        "on_screen_text": {"type": "string"},
                        "transition": {"type": "string", "enum": ["cut", "fade"]},
                        "edit_intent": {"type": "string"},
                        "confidence": {"type": "number"},
                    },
                    "required": [
                        "script_index",
                        "script_line",
                        "shots",
                        "on_screen_text",
                        "transition",
                        "edit_intent",
                        "confidence",
                    ],
                },
            },
            "uncovered_script_lines": {"type": "array", "items": {"type": "string"}},
            "review_flags": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["project_title", "creative_rationale", "timeline", "uncovered_script_lines", "review_flags"],
    }


def _make_director_prompt(
    script_lines: List[str],
    style: str,
    candidates: List[dict],
    target_seconds: float,
) -> str:
    """构建 Gemini 导演 prompt"""
    beats = "\n".join(f"{idx}. {line}" for idx, line in enumerate(script_lines, start=1))
    compact = [_compact_candidate(item) for item in candidates]
    catalog_json = json.dumps(compact, ensure_ascii=False, indent=2)
    
    return f"""
You are an expert fashion-film and commercial editor. Build a conservative, footage-grounded rough-cut plan.

PROJECT STYLE:
{style}

TARGET DURATION:
About {target_seconds:.0f} seconds total. Favor 2-6 second shots unless a shot clearly needs longer.

WRITTEN VISUAL SCRIPT (one beat per line):
{beats}

AVAILABLE FOOTAGE CATALOG:
{catalog_json}

RULES:
1. Use only candidate_id values from the catalog. Do not invent footage, people, props, camera angles, or timestamps.
2. Match each script beat by its visual meaning, emotional rhythm, composition, action, and commercial purpose—not by literal word overlap only.
3. Keep the sequence coherent: establish -> reveal/personality -> escalation/detail -> payoff/closing when the script supports it.
4. Avoid near-duplicate shots, repeated poses, accidental jump cuts, and reuse of a candidate unless it is genuinely essential.
5. For every selected shot, give offsets relative to the candidate boundaries. Use 0 <= trim_start_offset_sec < trim_end_offset_sec <= candidate duration. Prefer the strongest continuous moment.
6. If no footage honestly matches a script line, leave shots empty and list that exact line in uncovered_script_lines. Do not hallucinate a match.
7. on_screen_text should normally repeat or slightly condense that script line for later title/subtitle work. It is NOT burned into the demo MP4 automatically.
8. Return the full plan in Chinese. Use cut by default; use fade only where it helps the mood.
""".strip()


def _run_gemini_director(
    api_key: str,
    model: str,
    script_lines: List[str],
    style: str,
    catalog: List[dict],
    target_seconds: float,
    thinking_level: str,
) -> dict:
    """运行 Gemini 导演"""
    if not catalog:
        raise ValueError("No usable candidate shots were found, so Gemini cannot build a plan.")
    
    if not genai:
        raise RuntimeError("Google GenAI SDK is not available")
    
    client = genai.Client(api_key=api_key)
    prompt = _make_director_prompt(script_lines, style, catalog, target_seconds)
    
    last_error = None
    for attempt in range(1, 4):
        try:
            response = client.interactions.create(
                model=model,
                input=prompt,
                generation_config={"thinking_level": thinking_level},
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": _director_schema([row["candidate_id"] for row in catalog]),
                },
            )
            if not response.output_text:
                raise RuntimeError("Gemini returned an empty director response.")
            
            try:
                return json.loads(response.output_text)
            except json.JSONDecodeError as exc:
                raise RuntimeError(
                    f"Gemini returned invalid JSON despite structured output: {exc}\n{response.output_text}"
                ) from exc
                
        except Exception as exc:
            last_error = exc
            message = str(exc).lower()
            is_quota = "429" in message or "quota" in message or "too_many_requests" in message
            
            if not is_quota or attempt == 3:
                break
            
            delay = 4 * (2 ** (attempt - 1))
            print(f"[gemini] quota/rate-limit on attempt {attempt}/3; retrying in {delay}s ...")
            import time
            time.sleep(delay)
    
    if last_error:
        raise RuntimeError(f"Gemini director request failed: {str(last_error)}")
    
    raise RuntimeError("Gemini director request failed for unknown reason")


def _clamp(value, low: float, high: float, fallback: float) -> float:
    """限制值在范围内"""
    number = _to_number(value, fallback)
    return max(low, min(high, number))


def _validate_plan(
    plan: dict,
    script_lines: List[str],
    catalog: List[dict],
) -> tuple:
    """验证并标准化 Gemini 返回的计划"""
    catalog_by_id = {row["candidate_id"]: row for row in catalog}
    seen_script_indices = set()
    edl = []
    normalized_timeline = []
    review_flags = list(plan.get("review_flags", [])) if isinstance(plan.get("review_flags"), list) else []
    
    raw_timeline = plan.get("timeline", [])
    if not isinstance(raw_timeline, list):
        raw_timeline = []
    
    for entry in raw_timeline:
        if not isinstance(entry, dict):
            continue
        
        script_index = int(_to_number(entry.get("script_index"), 0))
        if not 1 <= script_index <= len(script_lines):
            review_flags.append(f"忽略了无效 script_index: {entry.get('script_index')}")
            continue
        
        if script_index in seen_script_indices:
            review_flags.append(f"文案第 {script_index} 句出现重复计划，保留第一次。")
            continue
        
        seen_script_indices.add(script_index)
        
        shots = entry.get("shots", [])
        if not isinstance(shots, list):
            shots = []
        
        accepted_shots = []
        for shot in shots:
            if not isinstance(shot, dict):
                continue
            
            candidate_id = shot.get("candidate_id")
            candidate = catalog_by_id.get(candidate_id)
            
            if not candidate:
                review_flags.append(f"Gemini 选择了不存在的候选镜头 {candidate_id}，已忽略。")
                continue
            
            duration = candidate["duration"]
            start_offset = _clamp(shot.get("trim_start_offset_sec"), 0.0, max(0.01, duration - 0.05), 0.0)
            end_offset = _clamp(shot.get("trim_end_offset_sec"), start_offset + 0.05, duration, duration)
            
            if end_offset <= start_offset + 0.05:
                start_offset, end_offset = 0.0, duration
            
            clip = {
                "candidate_id": candidate_id,
                "source_id": candidate["source_id"],
                "source_label": candidate["source_label"],
                "source_locator": candidate["source_locator"],
                "local_source": candidate.get("local_source"),
                "start_time": round(candidate["start_time"] + start_offset, 3),
                "end_time": round(candidate["start_time"] + end_offset, 3),
                "duration": round(end_offset - start_offset, 3),
                "script_index": script_index,
                "script_line": script_lines[script_index - 1],
                "why_this_shot": str(shot.get("why_this_shot", "")),
                "transition": entry.get("transition", "cut"),
                "on_screen_text": str(entry.get("on_screen_text", script_lines[script_index - 1])),
                "edit_intent": str(entry.get("edit_intent", "")),
                "confidence": _to_number(entry.get("confidence"), 0.0),
            }
            accepted_shots.append(clip)
            edl.append(clip)
        
        normalized_timeline.append({
            "script_index": script_index,
            "script_line": script_lines[script_index - 1],
            "shots": accepted_shots,
            "on_screen_text": str(entry.get("on_screen_text", script_lines[script_index - 1])),
            "transition": entry.get("transition", "cut"),
            "edit_intent": str(entry.get("edit_intent", "")),
            "confidence": _to_number(entry.get("confidence"), 0.0),
        })
    
    missing = [
        f"{idx}. {line}" 
        for idx, line in enumerate(script_lines, start=1) 
        if idx not in seen_script_indices
    ]
    uncovered = plan.get("uncovered_script_lines", [])
    if not isinstance(uncovered, list):
        uncovered = []
    
    all_uncovered = list(dict.fromkeys([*uncovered, *missing]))
    
    normalized_plan = {
        "project_title": str(plan.get("project_title", "visual_rough_cut")),
        "creative_rationale": str(plan.get("creative_rationale", "")),
        "timeline": normalized_timeline,
        "uncovered_script_lines": all_uncovered,
        "review_flags": review_flags,
    }
    
    return normalized_plan, edl


def _timecode(seconds: float) -> str:
    """将秒转换为 SRT 时间码"""
    milliseconds = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _write_srt(edl: List[dict], path: str) -> None:
    """生成 SRT 字幕文件"""
    blocks = []
    cursor = 0.0
    
    for index, clip in enumerate(edl, start=1):
        end = cursor + float(clip["duration"])
        text = str(clip.get("on_screen_text") or clip.get("script_line") or "")
        blocks.extend([str(index), f"{_timecode(cursor)} --> {_timecode(end)}", text, ""])
        cursor = end
    
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(blocks))


def _write_ffmpeg_commands(
    edl: List[dict],
    out_dir: str,
    canvas: str,
    fit: str,
    output_path: str,
) -> None:
    """生成 FFmpeg 渲染命令"""
    canvas_dims = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}
    width, height = canvas_dims.get(canvas, (1080, 1920))
    
    if fit == "cover":
        vf = (
            f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},setsar=1,fps=30,format=yuv420p"
        )
    else:
        vf = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p"
        )
    
    clips_dir = os.path.join(out_dir, "clips")
    os.makedirs(clips_dir, exist_ok=True)
    
    lines = [
        "# Generated by Visual Script Editor",
        "# All clips are normalized to the same silent canvas before concatenation.",
        "",
    ]
    
    for index, clip in enumerate(edl, start=1):
        source = str(clip.get("local_source") or clip["source_locator"])
        target = os.path.join(clips_dir, f"{index:03d}_{clip['candidate_id']}.mp4")
        
        lines.append(f"# {index:03d} | script {clip['script_index']} | {clip['script_line']}")
        lines.append(
            'ffmpeg -y -i "{source}" -ss {start:.3f} -t {duration:.3f} '
            '-filter_complex "[0:v]{vf}[v];anullsrc=channel_layout=stereo:sample_rate=48000[a]" '
            '-map "[v]" -map "[a]" -shortest -c:v libx264 -crf 18 -preset medium '
            '-pix_fmt yuv420p -c:a aac -b:a 192k "{target}"'.format(
                start=float(clip["start_time"]),
                source=source.replace('"', '\\"'),
                duration=float(clip["duration"]),
                vf=vf,
                target=target.replace('"', '\\"'),
            )
        )
        lines.append("")
    
    concat_path = os.path.join(out_dir, "concat.txt")
    concat_lines = []
    for index in range(1, len(edl) + 1):
        clip_path = os.path.join(clips_dir, f"{index:03d}_*.mp4")
        concat_lines.append(f"file '{clip_path}'")
    
    lines.extend([
        "# concat.txt is generated automatically by --render",
        f'ffmpeg -y -f concat -safe 0 -i "{concat_path}" -c copy "{os.path.join(out_dir, "rough_cut.mp4")}"',
    ])
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def _render_rough_cut(
    edl: List[dict],
    out_dir: str,
    canvas: str,
    fit: str,
) -> str:
    """渲染 rough cut MP4"""
    import subprocess
    
    if not edl:
        raise ValueError("No EDL clips to render.")
    
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("FFmpeg was not found in PATH")
    
    canvas_dims = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}
    width, height = canvas_dims.get(canvas, (1080, 1920))
    
    if fit == "cover":
        vf = (
            f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},setsar=1,fps=30,format=yuv420p"
        )
    else:
        vf = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p"
        )
    
    clips_dir = os.path.join(out_dir, "clips")
    os.makedirs(clips_dir, exist_ok=True)
    
    rendered = []
    for index, clip in enumerate(edl, start=1):
        source = str(clip.get("local_source"))
        if not source or not os.path.isfile(source):
            raise RuntimeError(f"Source file not found: {source}")
        
        target = os.path.join(clips_dir, f"{index:03d}_{clip['candidate_id']}.mp4")
        
        print(f"[render] {index:03d}: {clip['source_label']} {clip['start_time']:.2f}s–{clip['end_time']:.2f}s")
        
        command = [
            "ffmpeg", "-y", "-i", source,
            "-ss", f"{float(clip['start_time']):.3f}",
            "-t", f"{float(clip['duration']):.3f}",
            "-filter_complex", f"[0:v]{vf}[v];anullsrc=channel_layout=stereo:sample_rate=48000[a]",
            "-map", "[v]", "-map", "[a]", "-shortest",
            "-c:v", "libx264", "-crf", "18", "-preset", "medium",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
            str(target),
        ]
        subprocess.run(command, check=True)
        rendered.append(target)
    
    concat_path = os.path.join(out_dir, "concat.txt")
    with open(concat_path, "w", encoding="utf-8") as f:
        for path in rendered:
            # 处理单引号
            safe_path = path.replace("'", "'\\''")
            f.write(f"file '{safe_path}'\n")
    
    final_path = os.path.join(out_dir, "rough_cut.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_path, "-c", "copy", final_path],
        check=True,
    )
    
    return final_path


def _download_file(url: str, path: str) -> None:
    """下载文件"""
    import requests
    
    with requests.get(url, stream=True) as r:
        r.raise_for_status()
        with open(path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)


def _create_proxy_video(input_path: str, output_path: str) -> None:
    """创建代理视频（压缩到 200MB 以内）"""
    import subprocess
    
    command = [
        "ffmpeg", "-y", "-i", input_path,
        "-vf", "scale=720:-2",
        "-c:v", "libx264", "-crf", "23",
        "-c:a", "aac",
        output_path,
    ]
    subprocess.run(command, check=True)


def _send_callback(callback_url: str, payload: dict, secret: str = None) -> None:
    """发送回调通知"""
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
    except Exception as e:
        print(f"[callback] failed to send to {callback_url}: {e}")
