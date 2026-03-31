#!/usr/bin/env python3
"""
数字人视频 "转场" 口播检测与批量切除工具 (v2)
================================================
针对数字人带货视频中多次出现 "转场" 口播标记的场景：
  1. whisper_timestamped 识别中文语音，获取字级时间戳
  2. 定位所有 "转场" 的精确时间段
  3. ffmpeg 切除全部转场片段
  4. 自动合并为干净的完整视频
  5. 可选结合 script.json 生成 timeline.json，用于 lip_sync.py 插入分镜画面

用法:
  python cut_transition.py input.mp4
  python cut_transition.py input.mp4 -k 转场 -m large-v3 --margin 0.15
  python cut_transition.py input.mp4 --script script.json --lip-sync
"""

import whisper_timestamped as whisper
import subprocess
import os
import sys
import json
import argparse
import tempfile
import shutil
from dataclasses import dataclass, asdict
from typing import List, Optional, Dict, Any

DOWNLOAD_ROOT = "./model"

# ═══════════════════════════════════════════════
#  数据结构
# ═══════════════════════════════════════════════

@dataclass
class TimeSpan:
    """一个时间区间"""
    start: float
    end: float
    label: str = ""

    @property
    def duration(self) -> float:
        return self.end - self.start

    def __repr__(self):
        return f"[{self.start:.3f}s → {self.end:.3f}s] ({self.duration:.3f}s) {self.label}"


# ═══════════════════════════════════════════════
#  1. 语音识别
# ═══════════════════════════════════════════════

def transcribe_video(video_path: str,
                     model_size: str = "medium",
                     device: str = "cpu",
                     language: str = "zh") -> dict:
    """用 whisper_timestamped 做带字级时间戳的中文语音识别"""

    print(f"\n{'='*60}")
    print(f"  🎙️  语音识别")
    print(f"  模型: {model_size}  |  设备: {device}  |  语言: {language}")
    print(f"{'='*60}")

    print(f"  ⏳ 加载模型 {model_size} ...")
    model = whisper.load_model(model_size, device=device, download_root=DOWNLOAD_ROOT)

    print(f"  ⏳ 识别语音中（可能需要几分钟）...")
    audio = whisper.load_audio(video_path)
    result = whisper.transcribe(
        model, audio,
        language=language,
        detect_disfluencies=False,
        vad=True,
    )
    print(f"  ✅ 识别完成，共 {len(result.get('segments', []))} 个语句段")
    return result


# ═══════════════════════════════════════════════
#  2. 关键词定位 —— 字级精确匹配
# ═══════════════════════════════════════════════

def find_all_keyword_spans(result: dict,
                           keyword: str = "转场") -> List[TimeSpan]:
    hits: List[TimeSpan] = []

    for seg in result.get("segments", []):
        words = seg.get("words", [])

        if not words:
            # fallback: segment 级匹配
            seg_text = seg.get("text", "").replace(" ", "")
            if keyword in seg_text:
                hits.append(TimeSpan(
                    start=float(seg["start"]),
                    end=float(seg["end"]),
                    label=f"segment级: {seg_text}",
                ))
            continue

        # --- word 级滑动窗口匹配 ---
        clean_words = []
        for w in words:
            txt = w.get("text", "").replace(" ", "")
            clean_words.append({
                "text": txt,
                "start": float(w["start"]),
                "end": float(w["end"]),
                "confidence": float(w.get("confidence", 0)),
            })

        full_text = ""
        char_to_word_idx = []
        for i, cw in enumerate(clean_words):
            for ch in cw["text"]:
                char_to_word_idx.append(i)
            full_text += cw["text"]

        search_start = 0
        while True:
            idx = full_text.find(keyword, search_start)
            if idx == -1:
                break

            first_word_idx = char_to_word_idx[idx]
            last_word_idx = char_to_word_idx[idx + len(keyword) - 1]

            span = TimeSpan(
                start=clean_words[first_word_idx]["start"],
                end=clean_words[last_word_idx]["end"],
                label=keyword,
            )
            hits.append(span)
            search_start = idx + len(keyword)

    hits.sort(key=lambda s: s.start)
    return hits


# ═══════════════════════════════════════════════
#  3. ffmpeg 工具
# ═══════════════════════════════════════════════

def check_ffmpeg():
    if shutil.which("ffmpeg") is None:
        print("❌ 未找到 ffmpeg，请先安装:")
        sys.exit(1)


def get_duration(path: str) -> float:
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def get_video_info(path: str) -> Dict[str, Any]:
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "stream=width,height,r_frame_rate,codec_name",
        "-select_streams", "v:0",
        "-of", "json",
        path,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, check=True)
    info = json.loads(r.stdout)
    stream = info["streams"][0]
    
    fr_parts = stream.get("r_frame_rate", "").split("/")
    fps = float(fr_parts[0]) / float(fr_parts[1]) if len(fr_parts) == 2 else 0
    
    return {
        "width": int(stream.get("width", 0)),
        "height": int(stream.get("height", 0)),
        "fps": fps,
        "codec": stream.get("codec_name", "")
    }


def ffmpeg_cut_segment(input_path: str, output_path: str,
                       ss: float, to: float):
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-i", input_path,
        "-ss", f"{ss:.4f}",
        "-to", f"{to:.4f}",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        "-avoid_negative_ts", "make_zero",
        "-max_muxing_queue_size", "1024",
        output_path,
    ]
    subprocess.run(cmd, check=True)


def ffmpeg_concat_segments(part_files: List[str], output_path: str):
    list_file = tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, encoding="utf-8"
    )
    try:
        for pf in part_files:
            list_file.write(f"file '{os.path.abspath(pf)}'\n")
        list_file.close()

        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
            "-f", "concat", "-safe", "0",
            "-i", list_file.name,
            "-c", "copy",
            output_path,
        ]
        subprocess.run(cmd, check=True)
    finally:
        os.unlink(list_file.name)


# ═══════════════════════════════════════════════
#  4. 合并重叠区间 + 计算保留段
# ═══════════════════════════════════════════════

def merge_overlapping(spans: List[TimeSpan], margin: float = 0.0) -> List[TimeSpan]:
    if not spans:
        return []

    expanded = sorted([
        TimeSpan(max(0, s.start - margin), s.end + margin, s.label)
        for s in spans
    ], key=lambda s: s.start)

    merged = [expanded[0]]
    for cur in expanded[1:]:
        prev = merged[-1]
        if cur.start <= prev.end:
            merged[-1] = TimeSpan(prev.start, max(prev.end, cur.end), "merged")
        else:
            merged.append(cur)
    return merged


def compute_keep_segments(duration: float,
                          cut_spans: List[TimeSpan],
                          margin: float,
                          min_duration: float = 0.1) -> List[TimeSpan]:
    merged_cuts = merge_overlapping(cut_spans, margin=margin)

    keeps: List[TimeSpan] = []
    cursor = 0.0

    for cut in merged_cuts:
        if cursor < cut.start:
            seg = TimeSpan(cursor, cut.start, f"keep_{len(keeps)+1}")
            if seg.duration >= min_duration:
                keeps.append(seg)
        cursor = max(cursor, cut.end)

    if cursor < duration:
        seg = TimeSpan(cursor, duration, f"keep_{len(keeps)+1}")
        if seg.duration >= min_duration:
            keeps.append(seg)

    return keeps


# ═══════════════════════════════════════════════
#  5. 生成时间线 JSON（用于 lip_sync.py）
# ═══════════════════════════════════════════════

def generate_timeline_json(
    input_path: str,
    parts_dir: str,
    part_files: List[str],
    output_json: str,
    keeps: List[TimeSpan],
    script_path: Optional[str] = None
) -> str:
    """结合保留的视频段和 script.json 自动生成合并时间线"""
    info = get_video_info(input_path)
    duration = get_duration(input_path)
    
    script_segments = []
    ad_keywords = []

    if script_path and os.path.isfile(script_path):
        with open(script_path, "r", encoding="utf-8") as f:
            script_data = json.load(f)
            script_segments = script_data.get("segments", [])
            ad_keywords = script_data.get("ad_keywords", [])
            
        if len(script_segments) != len(keeps):
            print(f"  ⚠️  警告: 脚本中的段落数 ({len(script_segments)}) 与实际切割保留的段落数 ({len(keeps)}) 不一致！")

    segments = []
    for i, (part_file, seg) in enumerate(zip(part_files, keeps), 1):
        seg_type = "human"
        scene_file = None
        
        # 匹配对应 script.json 中的配置信息
        if script_segments and i <= len(script_segments):
            script_seg = script_segments[i - 1]
            seg_type = script_seg.get("flag", "human")
            scene_file = script_seg.get("scene_file")

        segment_info = {
            "id": i,
            "type": seg_type,
            "start": seg.start,
            "end": seg.end,
            "duration": seg.duration,
            "part_file": os.path.basename(part_file)
        }
        
        if scene_file:
            segment_info["scene_file"] = scene_file
            
        segments.append(segment_info)
    
    timeline = {
        "video_info": {
            "width": info["width"],
            "height": info["height"],
            "fps": info["fps"],
            "duration": duration,
            "original_file": os.path.basename(input_path)
        },
        "parts_dir": os.path.basename(parts_dir),
        "ad_keywords": ad_keywords,
        "segments": segments
    }
    
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(timeline, f, ensure_ascii=False, indent=2)
    
    return output_json

# ═══════════════════════════════════════════════
#  6. 主处理流程
# ═══════════════════════════════════════════════

def process(input_path: str, *,
            keyword: str = "转场",
            model_size: str = "medium",
            device: str = "cpu",
            output_dir: Optional[str] = None,
            margin: float = 0.15,
            keep_parts: bool = False,
            min_seg_duration: float = 0.1,
            gen_timeline: bool = False,
            script_path: Optional[str] = None,
            lip_sync: bool = False,
            lip_sync_args: Optional[List[str]] = None):

    check_ffmpeg()

    if not os.path.isfile(input_path):
        print(f"❌ 文件不存在: {input_path}")
        sys.exit(1)
        
    # 如果指定了脚本，强制开启生成时间线与保存素材
    if script_path:
        gen_timeline = True
        if not os.path.isfile(script_path):
            print(f"❌ 脚本文件不存在: {script_path}")
            sys.exit(1)

    if output_dir is None:
        output_dir = os.path.dirname(os.path.abspath(input_path)) or "."
    os.makedirs(output_dir, exist_ok=True)

    base = os.path.splitext(os.path.basename(input_path))[0]
    tmp_dir = os.path.join(output_dir, f".{base}_tmp_parts")
    parts_dir = os.path.join(output_dir, f"{base}_parts")
    os.makedirs(tmp_dir, exist_ok=True)
    if keep_parts or gen_timeline:
        os.makedirs(parts_dir, exist_ok=True)

    # ── STEP 1: 语音识别 ──
    result = transcribe_video(input_path, model_size=model_size, device=device)

    json_path = os.path.join(output_dir, f"{base}_transcription.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n{'─'*60}")
    print("  📝 完整识别文本")
    print(f"{'─'*60}")
    for seg in result.get("segments", []):
        text = seg["text"].strip()
        marker = " 🔴" if keyword in text.replace(" ", "") else ""
        print(f"  [{seg['start']:7.2f}s → {seg['end']:7.2f}s]{marker}  {text}")
    print(f"{'─'*60}")

    # ── STEP 2: 定位关键词 ──
    hits = find_all_keyword_spans(result, keyword=keyword)

    if not hits:
        print(f"\n✅ 未检测到关键词「{keyword}」，视频无需处理。")
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return

    print(f"\n{'='*60}")
    print(f"  🔍 检测到 {len(hits)} 处「{keyword}」")
    print(f"{'='*60}")
    total_cut = 0.0
    for i, h in enumerate(hits, 1):
        print(f"  #{i:02d}  {h.start:7.3f}s → {h.end:7.3f}s  "
              f"(时长 {h.duration:.3f}s)")
        total_cut += h.duration
    print(f"  {'─'*50}")
    print(f"  合计切除约 {total_cut:.2f}s  |  margin ±{margin}s")

    # ── STEP 3: 计算保留区间 ──
    duration = get_duration(input_path)
    print(f"\n  📏 视频总时长: {duration:.2f}s")

    keeps = compute_keep_segments(duration, hits,
                                  margin=margin,
                                  min_duration=min_seg_duration)

    if not keeps:
        print("  ⚠️ 切割后无有效内容！请检查 margin 参数。")
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return

    kept_total = sum(k.duration for k in keeps)
    print(f"  保留 {len(keeps)} 段，合计 {kept_total:.2f}s\n")

    # ── STEP 4: 逐段切割 ──
    print(f"  ✂️  开始切割 ...")
    tmp_parts: List[str] = []
    final_parts: List[str] = []
    
    for i, seg in enumerate(keeps, 1):
        tmp_path = os.path.join(tmp_dir, f"part_{i:03d}.mp4")
        print(f"     片段 {i:02d}/{len(keeps)}  "
              f"[{seg.start:.3f}s → {seg.end:.3f}s]  "
              f"({seg.duration:.2f}s)")
        ffmpeg_cut_segment(input_path, tmp_path, seg.start, seg.end)
        tmp_parts.append(tmp_path)
        
        if keep_parts or gen_timeline:
            final_part = os.path.join(parts_dir, f"{base}_part{i:02d}.mp4")
            shutil.copy2(tmp_path, final_part)
            final_parts.append(final_part)

    # ── STEP 5: 合并 ──
    cleaned_path = os.path.join(output_dir, f"{base}_cleaned.mp4")

    if len(tmp_parts) == 1:
        shutil.copy2(tmp_parts[0], cleaned_path)
    else:
        print(f"\n  🔗 合并 {len(tmp_parts)} 段 ...")
        ffmpeg_concat_segments(tmp_parts, cleaned_path)

    # ── STEP 6: 生成时间线（可选）──
    timeline_path = None
    if gen_timeline:
        print(f"\n  📜 生成时间线 JSON ...")
        timeline_path = os.path.join(output_dir, f"{base}_timeline.json")
        generate_timeline_json(
            input_path=input_path,
            parts_dir=parts_dir,
            part_files=final_parts,
            output_json=timeline_path,
            keeps=keeps,
            script_path=script_path
        )
        print(f"  ✅ 时间线已保存: {timeline_path}")

    # ── STEP 7: 执行嘴型同步（可选）──
    if lip_sync:
        print(f"\n{'='*60}")
        print(f"  👄 启动 lip_sync 嘴型合成与字幕烧录")
        print(f"{'='*60}")
        
        cmd = [sys.executable, "lip_sync.py"]
        if timeline_path:
            cmd.extend(["--timeline", timeline_path])
        else:
            cmd.append(cleaned_path)
        
        if lip_sync_args:
            cmd.extend(lip_sync_args)
        else:
            out_video = os.path.join(output_dir, f"{base}_final.mp4")
            cmd.extend(["-o", out_video])
            
        print(f"  执行命令: {' '.join(cmd)}")
        subprocess.run(cmd, check=True)

    # ── 清理 ──
    shutil.rmtree(tmp_dir, ignore_errors=True)
    if not (keep_parts or gen_timeline):
        if os.path.exists(parts_dir):
            shutil.rmtree(parts_dir, ignore_errors=True)

    # ── 完成 ──
    cleaned_size = os.path.getsize(cleaned_path) / 1024 / 1024
    original_size = os.path.getsize(input_path) / 1024 / 1024

    print(f"\n{'='*60}")
    print(f"  🎉 预处理完成！")
    print(f"{'='*60}")
    print(f"  原始视频:  {input_path}")
    print(f"             {original_size:.1f} MB  |  {duration:.2f}s")
    print(f"  输出视频:  {cleaned_path}")
    print(f"             {cleaned_size:.1f} MB  |  {kept_total:.2f}s")
    print(f"  切除数量:  {len(hits)} 处「{keyword}」")
    if timeline_path:
        print(f"  时间线:    {timeline_path}")
    print(f"{'='*60}\n")


# ═══════════════════════════════════════════════
#  7. CLI
# ═══════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description='数字人视频"转场"口播自动检测与批量切除',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("input", help="输入视频文件路径")
    parser.add_argument("-k", "--keyword", default="转场", help="要检测并切除的关键词 (默认: 转场)")
    parser.add_argument("-m", "--model", default="large-v3", help="Whisper 模型")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"], help="推理设备")
    parser.add_argument("-o", "--output-dir", default=None, help="输出目录")
    parser.add_argument("--margin", type=float, default=0.15, help="切割点两侧额外切除量/秒")
    parser.add_argument("--keep-parts", action="store_true", help="保留中间分段文件")
    parser.add_argument("--min-seg", type=float, default=0.1, help="保留段最短时长/秒")
                        
    # ── 时间线与场景合成相关 ──
    parser.add_argument("--gen-timeline", action="store_true",
                        help="生成时间线 JSON (用于 lip_sync.py)")
    parser.add_argument("--script", default=None,
                        help="导入 script.json (自动结合 timeline 将某些段落替换为 scene 文件)")
    parser.add_argument("--lip-sync", action="store_true",
                        help="处理完成后自动调用 lip_sync.py 进行视频合成与字幕烧录")
    parser.add_argument("--lip-sync-args", nargs=argparse.REMAINDER,
                        help="传递给 lip_sync.py 的额外参数, 例如: --scene-dir ./")

    args = parser.parse_args()

    process(
        input_path=args.input,
        keyword=args.keyword,
        model_size=args.model,
        device=args.device,
        output_dir=args.output_dir,
        margin=args.margin,
        keep_parts=args.keep_parts,
        min_seg_duration=args.min_seg,
        gen_timeline=args.gen_timeline,
        script_path=args.script,
        lip_sync=args.lip_sync,
        lip_sync_args=args.lip_sync_args
    )

if __name__ == "__main__":
    main()