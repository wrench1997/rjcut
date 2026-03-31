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

用法:
  # 嘴型同步模式: 重新识别 + 生成字幕
  python lip_sync.py cleaned_video.mp4 -o final.mp4

  # 时间线合成模式: 根据 timeline.json 合成
  python lip_sync.py --timeline timeline.json --scene-dir ./scenes -o final.mp4

  # 使用大模型 + GPU
  python lip_sync.py --timeline timeline.json -o final.mp4 -m large-v3 --device cuda

  # 指定特效
  python lip_sync.py --timeline timeline.json -o final.mp4 --effect highlight --color cyan

  # 对比新旧 JSON 时间戳偏移
  python lip_sync.py --compare old.json new.json
"""

import json
import os
import sys
import argparse
import tempfile
import shutil
from typing import Optional, List, Dict, Any

DOWNLOAD_ROOT = "./model"


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
    """
    对视频重新进行语音识别，获取精准的逐字时间戳。

    参数:
        video_path  : 视频文件路径（应为处理后的最终视频）
        model_size  : Whisper 模型大小
        device      : 推理设备 (cpu/cuda)
        language    : 语言代码
        output_json : 保存 JSON 的路径 (可选)

    返回:
        Whisper 识别结果 dict (含 segments → words 逐字时间戳)
    """
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

    # ── 统计 ──
    seg_count = len(result.get("segments", []))
    word_count = sum(
        len(seg.get("words", []))
        for seg in result.get("segments", [])
    )
    total_dur = 0.0
    if result.get("segments"):
        total_dur = result["segments"][-1].get("end", 0)

    print(f"  ✅ 识别完成")
    print(f"     语句段: {seg_count}")
    print(f"     逐字数: {word_count}")
    print(f"     时间跨度: 0.00s ~ {total_dur:.2f}s")

    # ── 打印识别结果预览 ──
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

    # ── 保存 JSON ──
    if output_json:
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\n  💾 时间戳 JSON 已保存: {output_json}")

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
    corrections: Optional[Dict[str, str]] = None,      # 新增
    corrections_file: Optional[str] = None,             # 新增
) -> str:
    """
    完整嘴型同步流水线:
      1. 对视频重新进行 whisper_timestamped 语音识别
      2. 用全新的时间戳生成逐字 ASS 字幕
      3. 烧录到视频

    参数:
        input_video      : 输入视频（已处理过的，如 _cleaned.mp4）
        output_video     : 输出视频路径
        model_size       : Whisper 模型大小
        device           : 推理设备
        language         : 语言代码
        effect           : 字幕特效 (karaoke/highlight/typewriter/bounce)
        font_file        : 字体文件路径
        font_size        : 字号
        highlight_color  : 高亮颜色名或 ASS 颜色码
        filter_transition: 是否过滤文本中的 "转场" 标记
        max_chars_per_line: 每行最大字符数
        save_json        : 是否保存 JSON 文件

    返回: 输出视频路径
    """
    from subtitle_effects import burn_whisper_subtitle

    # ── 保存 JSON 路径 ──
    json_path = None
    if save_json:
        base = os.path.splitext(output_video)[0]
        json_path = f"{base}_resync.json"

    # ── STEP 1: 重新识别 ──
    result = resync_transcribe(
        video_path=input_video,
        model_size=model_size,
        device=device,
        language=language,
        output_json=json_path,
    )

    # ── STEP 2: 写临时 JSON ──
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
            corrections=corrections,               # 新增
            corrections_file=corrections_file,      # 新增
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
    """
    对比旧 JSON 和重新识别的结果，生成对齐后的 JSON。
    
    如果旧 JSON 中某段文本在新识别中也存在，就用新的时间戳；
    这样可以保留人工修正过的文本，同时获取精准时间戳。

    参数:
        old_json_path      : 旧的 Whisper JSON 文件
        video_path          : 视频文件路径
        model_size          : Whisper 模型
        device              : 推理设备
        language            : 语言
        output_json         : 输出 JSON 路径
        similarity_threshold: 文本相似度阈值

    返回:
        对齐后的 JSON dict
    """
    # ── 读取旧 JSON ──
    with open(old_json_path, "r", encoding="utf-8") as f:
        old_data = json.load(f)

    # ── 重新识别 ──
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

    # ── 用新时间戳替换旧的 ──
    aligned_segs = []
    new_idx = 0

    for old_seg in old_segs:
        old_text = old_seg.get("text", "").replace(" ", "").strip()
        if not old_text:
            continue

        # 在新结果中找最匹配的段
        best_match = None
        best_sim = 0.0
        best_j = -1

        search_range = range(
            max(0, new_idx - 3),
            min(len(new_segs), new_idx + 10)
        )
        for j in search_range:
            new_text = new_segs[j].get("text", "").replace(" ", "").strip()
            sim = _text_similarity(old_text, new_text)
            if sim > best_sim:
                best_sim = sim
                best_match = new_segs[j]
                best_j = j

        if best_match and best_sim >= similarity_threshold:
            # 用旧文本 + 新时间戳
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
            # 未匹配，保留旧段但标记
            aligned_segs.append(old_seg)
            print(f"     ⚠️  未匹配: \"{old_text[:15]}\" "
                  f"(最佳相似度 {best_sim:.0%})")

    result = {
        "text": " ".join(s.get("text", "").strip() for s in aligned_segs),
        "segments": aligned_segs,
        "language": language,
    }

    if output_json:
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\n  💾 对齐 JSON 已保存: {output_json}")

    return result


def _text_similarity(a: str, b: str) -> float:
    """简单的字符级 Jaccard 相似度"""
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
    """
    对比两个 Whisper JSON 的时间戳差异，
    帮助诊断嘴型不同步问题。
    """
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

    # ── 逐段对比 ──
    max_show = min(20, len(old_segs), len(new_segs))
    total_drift_start = 0.0
    total_drift_end = 0.0
    max_drift = 0.0
    count = 0

    for i in range(max_show):
        old_s = old_segs[i]
        new_s = new_segs[i]
        old_text = old_s.get("text", "").strip()[:20]
        new_text = new_s.get("text", "").strip()[:20]

        drift_start = new_s["start"] - old_s["start"]
        drift_end = new_s["end"] - old_s["end"]
        avg_drift = (abs(drift_start) + abs(drift_end)) / 2
        max_drift = max(max_drift, avg_drift)
        total_drift_start += abs(drift_start)
        total_drift_end += abs(drift_end)
        count += 1

        # 状态图标
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

    # ── 逐字级别对比（如果有的话） ──
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

        # 抽样对比前10个字
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
    scene_path: str,
    audio_part_path: str,
    output_path: str,
    duration: float,
    width: int,
    height: int,
    fps: float,
):
    """
    用 scene 视频作为画面，audio_part 作为音频，生成一个固定时长片段
    最小版策略:
      - scene 不够长时循环
      - 音频完全使用 audio_part
    """
    import subprocess

    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-stream_loop", "-1", "-i", scene_path,
        "-i", audio_part_path,
        "-t", f"{duration:.4f}",
        "-vf", (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"fps={fps},format=yuv420p"
        ),
        "-map", "0:v",
        "-map", "1:a",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        "-shortest",
        "-movflags", "+faststart",
        output_path,
    ]
    subprocess.run(cmd, check=True)



def prepare_timeline_render_clips(
    timeline_path: str,
    work_dir: str,
    scene_dir: Optional[str] = None,
) -> List[str]:
    """
    根据 timeline.json 生成最终用于拼接的片段列表
    - human: 直接使用 part_file
    - scene: 用 scene_file 替换画面，但保留对应 part 音频
    返回: clip_paths
    """
    from video_utils import normalize_clip

    # 获取时间线文件所在目录，用于解析相对路径
    timeline_dir = os.path.dirname(os.path.abspath(timeline_path))
    
    with open(timeline_path, "r", encoding="utf-8") as f:
        timeline = json.load(f)

    parts_dir = timeline["parts_dir"]
    
    # 如果parts_dir是相对路径，则相对于时间线文件所在目录解析
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
    corrections_file: Optional[str] = None,  # 新增
):
    """
    从 timeline.json 进行最终合成
    """
    from video_utils import check_ffmpeg
    from transitions import merge_with_xfade
    from video_utils import concat_simple

    if not check_ffmpeg():
        sys.exit(1)

    with open(timeline_path, "r", encoding="utf-8") as f:
        timeline = json.load(f)

    work_dir = tempfile.mkdtemp(prefix="timeline_compose_")
    tmp_merged = os.path.join(work_dir, "merged.mp4")

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
            merge_with_xfade(
                clip_paths=clips,
                output_path=tmp_merged,
                transitions=transitions,
                td=transition_duration,
            )
        else:
            concat_simple(clips, tmp_merged)

        if resync:
            print(f"\n{'='*60}")
            print(f"  👄 重新识别并烧录字幕")
            print(f"{'='*60}")
            resync_subtitle(
                input_video=tmp_merged,
                output_video=output_video,
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
                
            )
        else:
            shutil.copy2(tmp_merged, output_video)

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
        epilog="""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
典型工作流:

  # 方式 A: 嘴型同步模式 (针对单个视频)
  python cut_transition.py output/阳光百纳.mp4 --device cuda
  python lip_sync.py output/阳光百纳_cleaned.mp4 -o 阳光百纳_final.mp4

  # 方式 B: 时间线合成模式 (用于多段+场景)
  python cut_transition.py avatar.mp4 --script script.json -o ./output
  python lip_sync.py --timeline output/avatar_timeline.json -o final.mp4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
示例:

  # 时间线合成模式
  python lip_sync.py --timeline timeline.json -o final.mp4 --scene-dir ./scenes

  # 时间线合成 + 转场特效
  python lip_sync.py --timeline timeline.json -o final.mp4 --use-transitions

  # 嘴型同步模式 (单个视频)
  python lip_sync.py video.mp4 -o video_synced.mp4 --effect karaoke

  # GPU + 大模型
  python lip_sync.py --timeline timeline.json -o final.mp4 -m large-v3 --device cuda

  # 仅重新识别, 输出 JSON (不烧录字幕)
  python lip_sync.py video.mp4 --json-only -o transcript.json

  # 对比新旧 JSON 时间戳偏移
  python lip_sync.py --compare old_transcription.json new_resync.json

  # 用旧文本 + 新时间戳对齐 (保留人工修正的文本)
  python lip_sync.py video.mp4 --align-from old.json -o aligned.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """,
    )

    parser.add_argument("input", nargs="?", help="输入视频文件")
    parser.add_argument("-o", "--output", default=None,
                        help="输出路径 (视频或 JSON)")
    parser.add_argument("-m", "--model", default="large-v3",
                        choices=["tiny", "base", "small", "medium",
                                 "large", "large-v2", "large-v3"],
                        help="Whisper 模型 (默认: medium)")
    parser.add_argument("--device", default="cpu",
                        choices=["cpu", "cuda"],
                        help="推理设备 (默认: cpu)")
    parser.add_argument("--language", default="zh",
                        help="语言代码 (默认: zh)")

    # ── 字幕设置 ──
    sg = parser.add_argument_group("✨ 字幕设置")
    sg.add_argument("--effect", default="karaoke",
                    choices=["karaoke", "highlight", "typewriter", "bounce"],
                    help="字幕特效 (默认: karaoke)")
    sg.add_argument("--font", default=None,
                    help="字体文件路径 (.ttf/.ttc)")
    sg.add_argument("--font-size", type=int, default=52,
                    help="字号 (默认: 52)")
    sg.add_argument("--color", default="gold",
                    help="高亮颜色: gold/yellow/cyan/red/pink/orange "
                         "或 ASS 颜色码 (默认: gold)")
    sg.add_argument("--max-chars", type=int, default=18,
                    help="每行最大字符数 (默认: 18)")
    sg.add_argument("--no-filter-transition", action="store_true",
                    help="不过滤文本中的 '转场' 标记")

    # 字幕设置部分
    sg.add_argument("--position", default="bottom", 
                    choices=["bottom", "top", "middle"],
                    help="字幕位置: bottom(底部)/top(顶部)/middle(中间) (默认: bottom)")
    sg.add_argument("--margin-v", type=int, default=50,
                    help="字幕垂直边距像素 (默认: 50)")
    sg.add_argument("--margin-l", type=int, default=10,
                    help="字幕左边距像素 (默认: 10)")
    sg.add_argument("--margin-r", type=int, default=10,
                    help="字幕右边距像素 (默认: 10)")
    sg.add_argument("--offset-x", type=int, default=0,
                    help="字幕水平偏移像素，正值向右偏移 (默认: 0)")
    sg.add_argument("--offset-y", type=int, default=0,
                    help="字幕垂直偏移像素，正值向下偏移 (默认: 0)")
    # ── 字幕设置组中新增 ──
    sg.add_argument("--corrections", default=None,
                    help="错别字校正文件路径 (corrections.json)")
    
    # ── 时间线合成设置 ──
    tg = parser.add_argument_group("🎬 时间线合成")
    tg.add_argument("--timeline", default=None,
                    help="timeline.json 路径，用于按时间线合成多段视频")
    tg.add_argument("--scene-dir", default=None,
                    help="场景素材目录")
    tg.add_argument("--no-resync", action="store_true",
                    help="合成后不重新识别字幕")
    tg.add_argument("--use-transitions", action="store_true",
                    help="合并片段时使用 xfade 转场")
    tg.add_argument("--transition", default="fade",
                    help="转场类型 (默认: fade)")
    tg.add_argument("--transition-duration", type=float, default=0.8,
                    help="转场时长秒 (默认: 0.5)")

    # ── 特殊模式 ──
    mg = parser.add_argument_group("🔧 特殊模式")
    mg.add_argument("--json-only", action="store_true",
                    help="仅输出 JSON，不烧录字幕")
    mg.add_argument("--compare", nargs=2, metavar=("OLD_JSON", "NEW_JSON"),
                    help="对比两个 JSON 的时间戳差异")
    mg.add_argument("--align-from", default=None, metavar="OLD_JSON",
                    help="用旧 JSON 文本 + 新时间戳对齐")



    args = parser.parse_args()



    # 位置映射到alignment值
    alignment = 2  # 默认：底部中央
    if args.position == "top":
        alignment = 8  # 顶部中央
    elif args.position == "middle":
        alignment = 5  # 中间中央

    # 使用X/Y偏移调整垂直边距
    actual_margin_v = args.margin_v
    if args.offset_y != 0:
        if alignment in [7, 8, 9]:  # 顶部对齐
            actual_margin_v = max(0, args.margin_v + args.offset_y)
        elif alignment in [1, 2, 3]:  # 底部对齐
            actual_margin_v = max(0, args.margin_v - args.offset_y)
        # 对于中间对齐，Y偏移会在subtitle_effects.py中处理
    
    # ══════════════════════════════════
    #  对比模式
    # ══════════════════════════════════
    if args.compare:
        for jp in args.compare:
            if not os.path.isfile(jp):
                print(f"❌ 文件不存在: {jp}")
                sys.exit(1)
        compare_timestamps(args.compare[0], args.compare[1])
        return

    # ══════════════════════════════════
    #  时间线合成模式
    # ══════════════════════════════════
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

        print(f"\n{'='*62}")
        print(f"  🎉 时间线合成完成!")
        print(f"{'='*62}")
        print(f"  timeline: {args.timeline}")
        print(f"  输出:     {args.output}")
        print(f"{'='*62}\n")
        return

    # ══════════════════════════════════
    #  需要输入视频的模式
    # ══════════════════════════════════
    if not args.input:
        parser.print_help()
        print("\n  💡 提示: 请指定输入视频文件或 timeline.json")
        print("     例: python lip_sync.py video.mp4 -o output.mp4")
        print("     例: python lip_sync.py --timeline timeline.json -o output.mp4\n")
        sys.exit(1)

    if not os.path.isfile(args.input):
        print(f"❌ 文件不存在: {args.input}")
        sys.exit(1)

    # ── 对齐模式 ──
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
        print(f"\n  🎉 对齐完成! JSON: {out_json}\n")
        return

    # ── 仅 JSON 模式 ──
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
        print(f"\n  🎉 识别完成! JSON: {json_out}\n")
        return

    # ══════════════════════════════════
    #  嘴型同步模式: 识别 + 字幕 + 烧录
    # ══════════════════════════════════
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
    )

    out_dur = get_duration(args.output)
    out_size = os.path.getsize(args.output) / 1024 / 1024

    print(f"\n{'='*62}")
    print(f"  🎉 嘴型同步完成!")
    print(f"{'='*62}")
    print(f"  输入:  {args.input}")
    print(f"         {in_size:.1f} MB  |  {in_dur:.2f}s")
    print(f"  输出:  {args.output}")
    print(f"         {out_size:.1f} MB  |  {out_dur:.2f}s")
    print(f"  特效:  {args.effect}  |  颜色: {args.color}")
    resync_json = os.path.splitext(args.output)[0] + "_resync.json"
    if os.path.isfile(resync_json):
        print(f"  JSON:  {resync_json}")
    print(f"{'='*62}\n")


if __name__ == "__main__":
    main()