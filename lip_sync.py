#!/usr/bin/env python3
"""
嘴型同步模块 (lip_sync.py)
===========================
解决数字人视频切割/合并后，字幕与嘴型不同步的问题。

新增功能：时间线智能合成器
===========================
读取 timeline.json，根据类型合成最终视频：
  - human: 直接使用 part_file
  - scene: 用 scene_file 替换画面，但保留 part 音频
最后重新识别并烧录字幕，确保嘴型同步。
"""

import json
import os
import sys
import argparse
import tempfile
import shutil
from typing import Optional, List, Dict, Any
import gc
import torch
from audio_mixer import add_background_music
from oss import download_file_from_oss, is_oss_key
import time
from urllib.parse import urlparse


DOWNLOAD_ROOT = "./model"


def _is_http_url(s: str) -> bool:
    try:
        p = urlparse(s)
        return p.scheme in ("http", "https")
    except Exception:
        return False


def _prepare_bgm_file(bgm_input: str, work_dir: str, max_retries: int = 3) -> str:
    """
    bgm_input 支持:
      - 本地文件路径
      - OSS key
      - http(s) url
    返回: 本地 bgm 文件路径
    """
    if not bgm_input:
        raise ValueError("bgm_input is empty")

    # 1) 本地文件直接用
    if os.path.isfile(bgm_input):
        print(f"  🎵 使用本地背景音乐文件: {bgm_input}")
        return bgm_input

    bgm_path = os.path.join(work_dir, "bgm_audio.mp3")

    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            # 2) OSS key
            if is_oss_key(bgm_input):
                print(f"  📥 从 OSS 下载背景音乐 (attempt {attempt}/{max_retries})...")
                download_file_from_oss(bgm_input, bgm_path)
                return bgm_path

            # 3) HTTP URL
            if _is_http_url(bgm_input):
                print(f"  📥 下载背景音乐: {bgm_input} (attempt {attempt}/{max_retries})...")
                import requests
                resp = requests.get(bgm_input, timeout=120, stream=True)
                resp.raise_for_status()
                with open(bgm_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            f.write(chunk)
                return bgm_path

            raise ValueError(f"bgm_url 既不是本地文件/OSS key/http url: {bgm_input}")

        except Exception as e:
            last_err = e
            if attempt < max_retries:
                wait = 2 ** (attempt - 1)
                print(f"  ⚠️ 背景音乐准备失败: {e}，{wait}s 后重试...")
                time.sleep(wait)
            else:
                break

    raise last_err


# ═══════════════════════════════════════════════
#  1. 重新语音识别
# ═══════════════════════════════════════════════

def resync_transcribe(
    video_path: str,
    model_size: str = "medium",
    device: str = "cpu",
    language: str = "zh",
    output_json: Optional[str] = None,
) -> dict:
    import whisper_timestamped as whisper

    print(f"\n{'='*60}")
    print(f"  👄 嘴型同步 — 重新语音识别")
    print(f"{'='*60}")
    print(f"  视频: {os.path.basename(video_path)}")
    print(f"  模型: {model_size}  |  设备: {device}  |  语言: {language}")
    print(f"{'─'*60}")

    print(f"  ⏳ 加载模型 {model_size} ...")
    model = whisper.load_model(
        model_size, device=device, download_root=DOWNLOAD_ROOT
    )

    print(f"  ⏳ 识别语音中（获取精准嘴型时间戳）...")
    audio = whisper.load_audio(video_path)
    result = whisper.transcribe(
        model, audio,
        language=language,
        detect_disfluencies=False,
        vad=True,
    )

    seg_count = len(result.get("segments", []))
    word_count = sum(len(seg.get("words", [])) for seg in result.get("segments", []))
    total_dur = 0.0
    if result.get("segments"):
        total_dur = result["segments"][-1].get("end", 0)

    print(f"  ✅ 识别完成")
    print(f"     语句段: {seg_count}")
    print(f"     逐字数: {word_count}")
    print(f"     时间跨度: 0.00s ~ {total_dur:.2f}s")

    print(f"\n  {'─'*56}")
    print(f"  📝 识别文本预览:")
    print(f"  {'─'*56}")
    for i, seg in enumerate(result.get("segments", [])[:15], 1):
        text = seg.get("text", "").strip()
        w_count = len(seg.get("words", []))
        print(f"  {i:02d}. [{seg['start']:6.2f}s → {seg['end']:6.2f}s] "
              f"({w_count}字) {text}")
    if seg_count > 15:
        print(f"  ... 共 {seg_count} 段，仅显示前 15 段")
    print(f"  {'─'*56}")

    if output_json:
        os.makedirs(os.path.dirname(os.path.abspath(output_json)), exist_ok=True)
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\n  💾 时间戳 JSON 已保存: {output_json}")

    del model
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()

    return result


# ═══════════════════════════════════════════════
#  2. 重新识别 + 烧录字幕 (一步到位)
# ═══════════════════════════════════════════════

def resync_subtitle(
    input_video: str,
    output_video: str,
    model_size: str = "medium",
    device: str = "cpu",
    language: str = "zh",
    effect: str = "karaoke",
    font_file: Optional[str] = None,
    font_size: int = 52,
    highlight_color: str = "gold",
    filter_transition: bool = True,
    max_chars_per_line: int = 18,
    save_json: bool = True,
    alignment: int = 2,
    margin_v: int = 50,
    margin_l: int = 10,
    margin_r: int = 10,
    offset_x: int = 0,
    offset_y: int = 0,
    corrections: Optional[Dict[str, str]] = None,
    corrections_file: Optional[str] = None,
    ad_keywords: Optional[List[str]] = None,
    # 🆕 新增：明确指定 resync json 输出路径
    resync_json_path: Optional[str] = None,
) -> str:
    from subtitle_effects import burn_whisper_subtitle

    json_path = None
    if save_json:
        if resync_json_path:
            json_path = resync_json_path
        else:
            base = os.path.splitext(output_video)[0]
            json_path = f"{base}_resync.json"

    result = resync_transcribe(
        video_path=input_video,
        model_size=model_size,
        device=device,
        language=language,
        output_json=json_path,
    )

    tmp_json = tempfile.NamedTemporaryFile(
        suffix=".json", delete=False, mode="w", encoding="utf-8"
    )
    json.dump(result, tmp_json, ensure_ascii=False, indent=2)
    tmp_json.close()

    try:
        print(f"\n  🎬 烧录逐字字幕 (特效: {effect}) ...")

        actual_margin_l = margin_l + (offset_x if offset_x > 0 else 0)
        actual_margin_r = margin_r + (abs(offset_x) if offset_x < 0 else 0)

        burn_whisper_subtitle(
            input_video=input_video,
            output_video=output_video,
            json_path=tmp_json.name,
            effect=effect,
            font_file=font_file,
            font_size=font_size,
            highlight_color=highlight_color,
            filter_transition=filter_transition,
            max_chars_per_line=max_chars_per_line,
            alignment=alignment,
            margin_v=margin_v,
            margin_l=actual_margin_l,
            margin_r=actual_margin_r,
            offset_x=offset_x,
            offset_y=offset_y,
            corrections=corrections,
            corrections_file=corrections_file,
            ad_keywords=ad_keywords,
        )
    finally:
        os.unlink(tmp_json.name)

    return output_video


# ═══════════════════════════════════════════════
#  3. 从已有 JSON 重新对齐（可选辅助方法）
# ═══════════════════════════════════════════════

def resync_from_json(
    old_json_path: str,
    video_path: str,
    model_size: str = "medium",
    device: str = "cpu",
    language: str = "zh",
    output_json: Optional[str] = None,
    similarity_threshold: float = 0.6,
) -> dict:
    with open(old_json_path, "r", encoding="utf-8") as f:
        old_data = json.load(f)

    new_data = resync_transcribe(
        video_path=video_path,
        model_size=model_size,
        device=device,
        language=language,
    )

    old_segs = old_data.get("segments", [])
    new_segs = new_data.get("segments", [])

    print(f"\n  🔄 对齐旧文本与新时间戳 ...")
    print(f"     旧 JSON: {len(old_segs)} 段  |  新识别: {len(new_segs)} 段")

    aligned_segs = []
    new_idx = 0

    for old_seg in old_segs:
        old_text = old_seg.get("text", "").replace(" ", "").strip()
        if not old_text:
            continue

        best_match = None
        best_sim = 0.0
        best_j = -1

        search_range = range(max(0, new_idx - 3), min(len(new_segs), new_idx + 10))
        for j in search_range:
            new_text = new_segs[j].get("text", "").replace(" ", "").strip()
            sim = _text_similarity(old_text, new_text)
            if sim > best_sim:
                best_sim = sim
                best_match = new_segs[j]
                best_j = j

        if best_match and best_sim >= similarity_threshold:
            aligned_seg = {
                "text": old_seg.get("text", ""),
                "start": best_match["start"],
                "end": best_match["end"],
                "words": best_match.get("words", old_seg.get("words", [])),
            }
            aligned_segs.append(aligned_seg)
            new_idx = best_j + 1
            print(f"     ✅ 匹配 (相似度 {best_sim:.0%}): "
                  f"\"{old_text[:15]}\" → "
                  f"[{best_match['start']:.2f}s~{best_match['end']:.2f}s]")
        else:
            aligned_segs.append(old_seg)
            print(f"     ⚠️  未匹配: \"{old_text[:15]}\" "
                  f"(最佳相似度 {best_sim:.0%})")

    result = {
        "text": " ".join(s.get("text", "").strip() for s in aligned_segs),
        "segments": aligned_segs,
        "language": language,
    }

    if output_json:
        os.makedirs(os.path.dirname(os.path.abspath(output_json)), exist_ok=True)
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\n  💾 对齐 JSON 已保存: {output_json}")

    return result


def _text_similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    set_a = set(a)
    set_b = set(b)
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union) if union else 0.0


# ═══════════════════════════════════════════════
#  4. 时间戳对比诊断工具
# ═══════════════════════════════════════════════

def compare_timestamps(old_json_path: str, new_json_path: str):
    with open(old_json_path, "r", encoding="utf-8") as f:
        old_data = json.load(f)
    with open(new_json_path, "r", encoding="utf-8") as f:
        new_data = json.load(f)

    old_segs = old_data.get("segments", [])
    new_segs = new_data.get("segments", [])

    print(f"\n{'='*62}")
    print(f"  📊 时间戳对比诊断")
    print(f"{'='*62}")
    print(f"  旧 JSON: {old_json_path}")
    print(f"           {len(old_segs)} 段")
    print(f"  新 JSON: {new_json_path}")
    print(f"           {len(new_segs)} 段")
    print(f"  {'─'*58}")

    max_show = min(20, len(old_segs), len(new_segs))
    total_drift_start = 0.0
    total_drift_end = 0.0
    max_drift = 0.0
    count = 0

    for i in range(max_show):
        old_s = old_segs[i]
        new_s = new_segs[i]
        old_text = old_s.get("text", "").strip()[:20]

        drift_start = new_s["start"] - old_s["start"]
        drift_end = new_s["end"] - old_s["end"]
        avg_drift = (abs(drift_start) + abs(drift_end)) / 2
        max_drift = max(max_drift, avg_drift)
        total_drift_start += abs(drift_start)
        total_drift_end += abs(drift_end)
        count += 1

        if avg_drift < 0.1:
            icon = "✅"
        elif avg_drift < 0.3:
            icon = "⚡"
        elif avg_drift < 0.5:
            icon = "⚠️ "
        else:
            icon = "❌"

        print(f"  {icon} 段{i+1:02d}: "
              f"旧[{old_s['start']:6.2f}s] → 新[{new_s['start']:6.2f}s] "
              f"偏移 {drift_start:+.3f}s  \"{old_text}\"")

    if count > 0:
        avg_start = total_drift_start / count
        avg_end = total_drift_end / count
        print(f"\n  {'─'*58}")
        print(f"  📈 统计:")
        print(f"     平均起始偏移: {avg_start:.3f}s")
        print(f"     平均结束偏移: {avg_end:.3f}s")
        print(f"     最大偏移:     {max_drift:.3f}s")
        print()

        if max_drift > 0.5:
            print(f"  ❌ 时间戳偏差较大！强烈建议使用 --resync 重新识别")
        elif max_drift > 0.2:
            print(f"  ⚠️  存在明显偏移，建议使用 --resync 重新识别")
        else:
            print(f"  ✅ 时间戳偏移较小，基本可用")

    old_words = []
    for seg in old_segs:
        old_words.extend(seg.get("words", []))
    new_words = []
    for seg in new_segs:
        new_words.extend(seg.get("words", []))

    if old_words and new_words:
        print(f"\n  📝 逐字级别:")
        print(f"     旧 JSON: {len(old_words)} 个字")
        print(f"     新 JSON: {len(new_words)} 个字")

        max_w = min(10, len(old_words), len(new_words))
        word_drifts = []
        for j in range(max_w):
            ow = old_words[j]
            nw = new_words[j]
            drift = abs(nw["start"] - ow["start"])
            word_drifts.append(drift)
            print(f"     字'{ow.get('text','?')}': "
                  f"旧{ow['start']:.3f}s → 新{nw['start']:.3f}s "
                  f"(偏移 {drift:.3f}s)")

        if word_drifts:
            avg_w = sum(word_drifts) / len(word_drifts)
            print(f"     平均逐字偏移: {avg_w:.3f}s")

    print(f"{'='*62}\n")


# ═══════════════════════════════════════════════
#  5. 时间线智能合成
# ═══════════════════════════════════════════════

def build_scene_clip(
    scene_path: str, audio_part_path: str, output_path: str,
    duration: float, width: int, height: int, fps: float,
):
    import subprocess

    cmd = [
        "ffmpeg", "-nostdin", "-threads", "2", "-y", "-hide_banner", "-loglevel", "warning",
        "-stream_loop", "-1", "-i", scene_path,
        "-i", audio_part_path,
        "-t", f"{duration:.4f}",
        "-vf", (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"fps={fps},format=yuv420p"
        ),
        "-map", "0:v", "-map", "1:a",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        "-shortest", "-movflags", "+faststart",
        output_path,
    ]
    subprocess.run(cmd, check=True, timeout=600, stdin=subprocess.DEVNULL)


def prepare_timeline_render_clips(
    timeline_path: str,
    work_dir: str,
    scene_dir: Optional[str] = None,
) -> List[str]:
    from video_utils import normalize_clip

    timeline_dir = os.path.dirname(os.path.abspath(timeline_path))

    with open(timeline_path, "r", encoding="utf-8") as f:
        timeline = json.load(f)

    parts_dir = timeline["parts_dir"]
    if not os.path.isabs(parts_dir):
        parts_dir = os.path.join(timeline_dir, parts_dir)

    info = timeline["video_info"]
    width = info["width"]
    height = info["height"]
    fps = info["fps"]

    segments = timeline.get("segments", [])
    if not segments:
        raise ValueError("timeline 中没有 segments")

    render_clips = []
    render_dir = os.path.join(work_dir, "render_segments")
    os.makedirs(render_dir, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  🎞️  准备时间线片段")
    print(f"{'='*60}")

    for seg in segments:
        seg_id = seg["id"]
        seg_type = seg["type"]
        duration = float(seg["duration"])
        part_path = os.path.join(parts_dir, seg["part_file"])

        if not os.path.isfile(part_path):
            raise FileNotFoundError(f"part 文件不存在: {part_path}")

        out_path = os.path.join(render_dir, f"render_{seg_id:03d}.mp4")

        if seg_type == "human":
            print(f"  #{seg_id:02d} [human] 直接使用 part")
            normalize_clip(part_path, out_path, width, height, fps)

        elif seg_type == "scene":
            scene_file = seg.get("scene_file")
            if not scene_file:
                raise ValueError(f"scene 段缺少 scene_file: segment #{seg_id}")

            scene_path = scene_file
            if scene_dir and not os.path.isabs(scene_file):
                scene_path = os.path.join(scene_dir, scene_file)

            if not os.path.isfile(scene_path):
                raise FileNotFoundError(f"scene 文件不存在: {scene_path}")

            print(f"  #{seg_id:02d} [scene] {os.path.basename(scene_path)}")
            build_scene_clip(
                scene_path=scene_path,
                audio_part_path=part_path,
                output_path=out_path,
                duration=duration,
                width=width,
                height=height,
                fps=fps,
            )
        else:
            raise ValueError(f"不支持的 segment type: {seg_type}")

        render_clips.append(out_path)

    return render_clips


def compose_from_timeline(
    timeline_path: str,
    output_video: str,
    scene_dir: Optional[str] = None,
    use_transitions: bool = False,
    transition_type: str = "fade",
    transition_duration: float = 0.5,
    resync: bool = True,
    model_size: str = "medium",
    device: str = "cpu",
    language: str = "zh",
    effect: str = "karaoke",
    font_file: Optional[str] = None,
    font_size: int = 52,
    highlight_color: str = "gold",
    max_chars_per_line: int = 18,
    alignment: int = 2,
    margin_v: int = 50,
    margin_l: int = 10,
    margin_r: int = 10,
    offset_x: int = 0,
    offset_y: int = 0,
    corrections_file: Optional[str] = None,
    bgm_url: Optional[str] = None,
    bgm_volume: float = 0.3,
    original_volume: float = 1.0,
    bgm_start_time: float = 0.0,
    bgm_loop: bool = True,
    fade_in_duration: float = 0.5,
    fade_out_duration: float = 0.5,
    # 🆕 新增：明确输出路径
    ass_output_path: Optional[str] = None,
    resync_json_output_path: Optional[str] = None,
    # 🆕 Task 1: pipeline.mode 支持纯场景模式
    mode: str = "normal",
    subtitle_json: Optional[str] = None,
    # 🎨 与前端统一的字幕样式参数
    stroke_color: Optional[str] = None,
    stroke_width: Optional[int] = None,
    background_color: Optional[str] = None,
    background_padding: Optional[int] = None,
    background_radius: Optional[int] = None,
):
    """
    从 timeline.json 进行最终合成
    
    Args:
        mode: 运行模式
            - "normal": 正常模式，使用 Whisper 重新识别字幕
            - "scene_only": 纯场景模式，跳过 Whisper，使用提供的 subtitle_json
        subtitle_json: 纯场景模式下使用的字幕 JSON 路径（mode="scene_only" 时必填）
    """
    from video_utils import check_ffmpeg
    from transitions import merge_with_xfade
    from video_utils import concat_simple

    if not check_ffmpeg():
        sys.exit(1)

    with open(timeline_path, "r", encoding="utf-8") as f:
        timeline = json.load(f)
    ad_keywords = timeline.get("ad_keywords", [])

    work_dir = tempfile.mkdtemp(prefix="timeline_compose_")
    tmp_merged = os.path.join(work_dir, "merged.mp4")
    tmp_subtitled = os.path.join(work_dir, "subtitled.mp4")

    try:
        clips = prepare_timeline_render_clips(
            timeline_path=timeline_path,
            work_dir=work_dir,
            scene_dir=scene_dir,
        )

        if not clips:
            raise ValueError("没有可合成的视频片段")

        print(f"\n{'='*60}")
        print(f"  🔗 合并最终视频")
        print(f"{'='*60}")

        if use_transitions and len(clips) > 1:
            transitions = [transition_type] * (len(clips) - 1)
            
            # 🎨 获取视频宽高比，用于智能滑动方向 (与前端一致)
            from video_utils import get_video_resolution
            try:
                width, height = get_video_resolution(clips[0])
                video_aspect = "9/16" if width < height else "16/9"
            except Exception as e:
                print(f"  ⚠️ 无法获取视频分辨率，默认使用 16/9: {e}")
                video_aspect = "16/9"
            
            merge_with_xfade(
                clip_paths=clips,
                output_path=tmp_merged,
                transitions=transitions,
                td=transition_duration,
                video_aspect=video_aspect,
            )
        else:
            concat_simple(clips, tmp_merged)

        video_for_bgm = tmp_merged

        if mode == "scene_only":
            # 🆕 Task 1: 纯场景模式 - 跳过 Whisper，使用提供的 subtitle_json
            print(f"\n{'='*60}")
            print(f"  🎬 纯场景模式 - 使用提供的字幕 JSON 烧录字幕")
            print(f"{'='*60}")
            
            if not subtitle_json or not os.path.isfile(subtitle_json):
                raise ValueError(f"纯场景模式需要提供有效的 subtitle_json 路径：{subtitle_json}")
            
            # 直接使用提供的 JSON 烧录字幕，不重新识别
            from subtitle_effects import burn_whisper_subtitle
            
            # 加载提供的字幕 JSON
            with open(subtitle_json, "r", encoding="utf-8") as f:
                subtitle_data = json.load(f)
            
            # 保存到临时文件供烧录使用
            tmp_subtitle_json = tempfile.NamedTemporaryFile(
                suffix=".json", delete=False, mode="w", encoding="utf-8"
            )
            json.dump(subtitle_data, tmp_subtitle_json, ensure_ascii=False, indent=2)
            tmp_subtitle_json.close()
            
            try:
                actual_margin_l = margin_l + (offset_x if offset_x > 0 else 0)
                actual_margin_r = margin_r + (abs(offset_x) if offset_x < 0 else 0)
                
                burn_whisper_subtitle(
                    input_video=tmp_merged,
                    output_video=tmp_subtitled,
                    json_path=tmp_subtitle_json.name,
                    effect=effect,
                    font_file=font_file,
                    font_size=font_size,
                    highlight_color=highlight_color,
                    filter_transition=False,
                    max_chars_per_line=max_chars_per_line,
                    alignment=alignment,
                    margin_v=margin_v,
                    margin_l=actual_margin_l,
                    margin_r=actual_margin_r,
                    offset_x=offset_x,
                    offset_y=offset_y,
                    corrections_file=corrections_file,
                    ad_keywords=ad_keywords,
                    # 🎨 与前端统一的字幕样式参数
                    stroke_color=stroke_color,
                    stroke_width=stroke_width,
                    background_color=background_color,
                    background_padding=background_padding,
                    background_radius=background_radius,
                )
                
                # 复制 resync JSON 到指定路径（如果提供了）
                if resync_json_output_path:
                    os.makedirs(os.path.dirname(os.path.abspath(resync_json_output_path)), exist_ok=True)
                    shutil.copy2(subtitle_json, resync_json_output_path)
                
                # 复制 ASS 文件到指定路径（如果提供了）
                if ass_output_path:
                    produced_ass = os.path.join(work_dir, "subtitled.ass")
                    if os.path.isfile(produced_ass):
                        os.makedirs(os.path.dirname(os.path.abspath(ass_output_path)), exist_ok=True)
                        shutil.copy2(produced_ass, ass_output_path)
                    else:
                        print(f"  ⚠️ 未找到生成的 ASS: {produced_ass}")
                
                video_for_bgm = tmp_subtitled
                
            finally:
                os.unlink(tmp_subtitle_json.name)
        
        elif resync:
            print(f"\n{'='*60}")
            print(f"  👄 重新识别并烧录字幕")
            print(f"{'='*60}")

            resync_subtitle(
                input_video=tmp_merged,
                output_video=tmp_subtitled,
                model_size=model_size,
                device=device,
                language=language,
                effect=effect,
                font_file=font_file,
                font_size=font_size,
                highlight_color=highlight_color,
                filter_transition=False,
                max_chars_per_line=max_chars_per_line,
                save_json=True,
                alignment=alignment,
                margin_v=margin_v,
                margin_l=margin_l,
                margin_r=margin_r,
                offset_x=offset_x,
                offset_y=offset_y,
                corrections_file=corrections_file,
                ad_keywords=ad_keywords,
                # 🆕 关键：把 resync json 写到指定路径
                resync_json_path=resync_json_output_path,
                # 🎨 与前端统一的字幕样式参数
                stroke_color=stroke_color,
                stroke_width=stroke_width,
                background_color=background_color,
                background_padding=background_padding,
                background_radius=background_radius,
            )

            # 🆕 关键：把 work_dir 里的 subtitled.ass 拷贝到指定路径
            if ass_output_path:
                produced_ass = os.path.join(work_dir, "subtitled.ass")
                if os.path.isfile(produced_ass):
                    os.makedirs(os.path.dirname(os.path.abspath(ass_output_path)), exist_ok=True)
                    shutil.copy2(produced_ass, ass_output_path)
                else:
                    print(f"  ⚠️ 未找到生成的 ASS: {produced_ass}")

            video_for_bgm = tmp_subtitled

        if bgm_url:
            print(f"\n{'='*60}")
            print(f"  🎵 添加背景音乐")
            print(f"{'='*60}")

            bgm_path = _prepare_bgm_file(bgm_url, work_dir=work_dir, max_retries=3)

            add_background_music(
                input_video=video_for_bgm,
                output_video=output_video,
                bgm_path=bgm_path,
                bgm_volume=bgm_volume,
                original_volume=original_volume,
                bgm_start_time=bgm_start_time,
                bgm_loop=bgm_loop,
                fade_in_duration=fade_in_duration,
                fade_out_duration=fade_out_duration,
            )
        else:
            shutil.copy2(video_for_bgm, output_video)

        # 如果 resync=True 且用户没传 resync_json_output_path，也会默认写到 tmp_subtitled_base_resync.json（临时目录）
        # 这里不额外处理；task_runner 需要的情况会传 resync_json_output_path

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    return output_video


# ═══════════════════════════════════════════════
#  6. CLI
# ═══════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="👄 嘴型同步与时间线合成工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument("input", nargs="?", help="输入视频文件")
    parser.add_argument("-o", "--output", default=None, help="输出路径 (视频或 JSON)")
    parser.add_argument("-m", "--model", default="large-v3", choices=["large-v3"], help="Whisper 模型")
    parser.add_argument("--device", default="cuda", choices=["cuda"], help="推理设备")
    parser.add_argument("--language", default="zh", help="语言代码")

    sg = parser.add_argument_group("✨ 字幕设置")
    sg.add_argument("--effect", default="ad",
                    choices=["karaoke", "highlight", "typewriter", "bounce", "ad"])
    sg.add_argument("--font", default=None)
    sg.add_argument("--font-size", type=int, default=88)
    sg.add_argument("--color", default="gold")
    sg.add_argument("--max-chars", type=int, default=18)
    sg.add_argument("--no-filter-transition", action="store_true")

    sg.add_argument("--position", default="bottom", choices=["bottom", "top", "middle"])
    sg.add_argument("--margin-v", type=int, default=50)
    sg.add_argument("--margin-l", type=int, default=10)
    sg.add_argument("--margin-r", type=int, default=10)
    sg.add_argument("--offset-x", type=int, default=0)
    sg.add_argument("--offset-y", type=int, default=0)
    sg.add_argument("--corrections", default=None)

    tg = parser.add_argument_group("🎬 时间线合成")
    tg.add_argument("--timeline", default=None)
    tg.add_argument("--scene-dir", default=None)
    tg.add_argument("--no-resync", action="store_true")
    tg.add_argument("--use-transitions", action="store_true")
    tg.add_argument("--transition", default="fade")
    tg.add_argument("--transition-duration", type=float, default=0.8)

    mg = parser.add_argument_group("🔧 特殊模式")
    mg.add_argument("--json-only", action="store_true")
    mg.add_argument("--compare", nargs=2, metavar=("OLD_JSON", "NEW_JSON"))
    mg.add_argument("--align-from", default=None, metavar="OLD_JSON")

    args = parser.parse_args()

    alignment = 2
    if args.position == "top":
        alignment = 8
    elif args.position == "middle":
        alignment = 5

    actual_margin_v = args.margin_v
    if args.offset_y != 0:
        if alignment in [7, 8, 9]:
            actual_margin_v = max(0, args.margin_v + args.offset_y)
        elif alignment in [1, 2, 3]:
            actual_margin_v = max(0, args.margin_v - args.offset_y)

    if args.compare:
        for jp in args.compare:
            if not os.path.isfile(jp):
                print(f"❌ 文件不存在: {jp}")
                sys.exit(1)
        compare_timestamps(args.compare[0], args.compare[1])
        return

    if args.timeline:
        if not os.path.isfile(args.timeline):
            print(f"❌ timeline 文件不存在: {args.timeline}")
            sys.exit(1)

        if args.output is None:
            base = os.path.splitext(args.timeline)[0]
            args.output = f"{base}_composed.mp4"

        compose_from_timeline(
            timeline_path=args.timeline,
            output_video=args.output,
            scene_dir=args.scene_dir,
            use_transitions=args.use_transitions,
            transition_type=args.transition,
            transition_duration=args.transition_duration,
            resync=not args.no_resync,
            model_size=args.model,
            device=args.device,
            language=args.language,
            effect=args.effect,
            font_file=args.font,
            font_size=args.font_size,
            highlight_color=args.color,
            max_chars_per_line=args.max_chars,
            alignment=alignment,
            margin_v=actual_margin_v,
            margin_l=args.margin_l,
            margin_r=args.margin_r,
            offset_x=args.offset_x,
            offset_y=args.offset_y,
            corrections_file=args.corrections,
        )
        print("✅ 时间线合成完成")
        return

    if not args.input:
        parser.print_help()
        sys.exit(1)

    if not os.path.isfile(args.input):
        print(f"❌ 文件不存在: {args.input}")
        sys.exit(1)

    if args.align_from:
        if not os.path.isfile(args.align_from):
            print(f"❌ 旧 JSON 不存在: {args.align_from}")
            sys.exit(1)
        base = os.path.splitext(args.input)[0]
        out_json = args.output or f"{base}_aligned.json"
        resync_from_json(
            old_json_path=args.align_from,
            video_path=args.input,
            model_size=args.model,
            device=args.device,
            language=args.language,
            output_json=out_json,
        )
        return

    if args.json_only:
        base = os.path.splitext(args.input)[0]
        json_out = args.output or f"{base}_resync.json"
        resync_transcribe(
            video_path=args.input,
            model_size=args.model,
            device=args.device,
            language=args.language,
            output_json=json_out,
        )
        return

    if args.output is None:
        base = os.path.splitext(args.input)[0]
        args.output = f"{base}_synced.mp4"

    from video_utils import check_ffmpeg, get_duration
    if not check_ffmpeg():
        sys.exit(1)

    in_dur = get_duration(args.input)
    in_size = os.path.getsize(args.input) / 1024 / 1024
    print(f"\n  📂 输入: {args.input}")
    print(f"     大小: {in_size:.1f} MB  |  时长: {in_dur:.2f}s")

    resync_subtitle(
        input_video=args.input,
        output_video=args.output,
        model_size=args.model,
        device=args.device,
        language=args.language,
        effect=args.effect,
        font_file=args.font,
        font_size=args.font_size,
        highlight_color=args.color,
        filter_transition=not args.no_filter_transition,
        max_chars_per_line=args.max_chars,
        save_json=True,
        alignment=alignment,
        margin_v=actual_margin_v,
        margin_l=args.margin_l,
        margin_r=args.margin_r,
        offset_x=args.offset_x,
        offset_y=args.offset_y,
        corrections_file=args.corrections,
        ad_keywords=[],
    )

    out_dur = get_duration(args.output)
    out_size = os.path.getsize(args.output) / 1024 / 1024
    print(f"✅ 输出: {args.output} ({out_size:.1f}MB, {out_dur:.2f}s)")


if __name__ == "__main__":
    main()