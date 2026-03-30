#!/usr/bin/env python3
"""
数字人视频 "转场" 口播检测与批量切除工具 (v2)
================================================
针对数字人带货视频中多次出现 "转场" 口播标记的场景：
  1. whisper_timestamped 识别中文语音，获取字级时间戳
  2. 定位所有 "转场" 的精确时间段
  3. ffmpeg 切除全部转场片段
  4. 自动合并为干净的完整视频
  5. 可选生成 timeline.json 用于 lip_sync.py

用法:
  python cut_transition.py input.mp4
  python cut_transition.py input.mp4 -k 转场 -m large-v3 --margin 0.15
  python cut_transition.py input.mp4 --gen-timeline --lip-sync
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

# 修正拼写错误，与 lip_sync.py 保持一致
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
    """
    在 whisper 识别结果中查找所有 keyword 出现位置。
    
    策略:
      ① 在每个 segment 的 words 列表中，用滑动窗口拼接字符，
         匹配到 keyword 后取对应 word 的 start/end。
      ② 若 segment 无 word 级信息，退回使用 segment 时间。
    
    返回: 所有命中的 TimeSpan 列表（按时间排序）
    """
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
        # 先清理每个 word 的文本
        clean_words = []
        for w in words:
            txt = w.get("text", "").replace(" ", "")
            clean_words.append({
                "text": txt,
                "start": float(w["start"]),
                "end": float(w["end"]),
                "confidence": float(w.get("confidence", 0)),
            })

        # 拼接所有字，同时记录每个字符 → word 索引的映射
        full_text = ""
        char_to_word_idx = []
        for i, cw in enumerate(clean_words):
            for ch in cw["text"]:
                char_to_word_idx.append(i)
            full_text += cw["text"]

        # 搜索所有出现位置
        search_start = 0
        while True:
            idx = full_text.find(keyword, search_start)
            if idx == -1:
                break

            # 找到 keyword 对应的 word 范围
            first_word_idx = char_to_word_idx[idx]
            last_word_idx = char_to_word_idx[idx + len(keyword) - 1]

            span = TimeSpan(
                start=clean_words[first_word_idx]["start"],
                end=clean_words[last_word_idx]["end"],
                label=keyword,
            )
            hits.append(span)
            search_start = idx + len(keyword)

    # 按时间排序
    hits.sort(key=lambda s: s.start)
    return hits


# ═══════════════════════════════════════════════
#  3. ffmpeg 工具
# ═══════════════════════════════════════════════

def check_ffmpeg():
    """检查 ffmpeg 是否可用"""
    if shutil.which("ffmpeg") is None:
        print("❌ 未找到 ffmpeg，请先安装:")
        print("   Ubuntu:  sudo apt install ffmpeg")
        print("   macOS:   brew install ffmpeg")
        print("   Windows: https://ffmpeg.org/download.html")
        sys.exit(1)


def get_duration(path: str) -> float:
    """用 ffprobe 取视频时长"""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def get_video_info(path: str) -> Dict[str, Any]:
    """获取视频信息: 宽度、高度、帧率等"""
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
    
    # 解析帧率
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
    """精确截取 [ss, to) 段（重编码，帧级精确）"""
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
    """用 concat demuxer 无损拼接（各段编码参数一致）"""
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
    """合并有重叠或相邻的切除区间"""
    if not spans:
        return []

    # 扩展 margin 后排序
    expanded = sorted([
        TimeSpan(max(0, s.start - margin), s.end + margin, s.label)
        for s in spans
    ], key=lambda s: s.start)

    merged = [expanded[0]]
    for cur in expanded[1:]:
        prev = merged[-1]
        if cur.start <= prev.end:
            # 合并
            merged[-1] = TimeSpan(prev.start, max(prev.end, cur.end), "merged")
        else:
            merged.append(cur)
    return merged


def compute_keep_segments(duration: float,
                          cut_spans: List[TimeSpan],
                          margin: float,
                          min_duration: float = 0.1) -> List[TimeSpan]:
    """
    从总时长和切除区间计算保留区间
    min_duration: 保留段最短时长（太短的丢弃）
    """
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
) -> str:
    """
    生成时间线 JSON 文件，用于 lip_sync.py 时间线合成
    
    参数:
        input_path: 原始视频路径
        parts_dir: 分段文件目录
        part_files: 分段文件路径列表
        output_json: 输出 JSON 文件路径
        keeps: 计算得到的保留段
    
    返回: 生成的 JSON 文件路径
    """
    # 获取视频信息
    info = get_video_info(input_path)
    duration = get_duration(input_path)
    
    # 构建时间线数据
    segments = []
    for i, (part_file, seg) in enumerate(zip(part_files, keeps), 1):
        segments.append({
            "id": i,
            "type": "human",  # 默认为人类片段
            "start": seg.start,
            "end": seg.end,
            "duration": seg.duration,
            "part_file": os.path.basename(part_file)
        })
    
    timeline = {
        "video_info": {
            "width": info["width"],
            "height": info["height"],
            "fps": info["fps"],
            "duration": duration,
            "original_file": os.path.basename(input_path)
        },
        "parts_dir": os.path.basename(parts_dir),
        "segments": segments
    }
    
    # 写入文件
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
            lip_sync: bool = False,
            lip_sync_args: Optional[List[str]] = None):
    """
    端到端处理流程:
      识别 → 定位关键词 → 切割 → 合并 → [生成时间线] → [执行嘴型同步]
    """

    # ── 校验 ──
    check_ffmpeg()

    if not os.path.isfile(input_path):
        print(f"❌ 文件不存在: {input_path}")
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
    result = transcribe_video(input_path, model_size=model_size,
                              device=device)

    # 保存完整识别 JSON
    json_path = os.path.join(output_dir, f"{base}_transcription.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    # ── 打印完整识别结果 ──
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
        # 清理临时目录
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
    print(f"  保留 {len(keeps)} 段，合计 {kept_total:.2f}s")
    print()

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
        
        # 如果需要保存分段或生成时间线
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
            keeps=keeps
        )
        print(f"  ✅ 时间线已保存: {timeline_path}")

    # ── STEP 7: 执行嘴型同步（可选）──
    if lip_sync:
        print(f"\n{'='*60}")
        print(f"  👄 执行嘴型同步")
        print(f"{'='*60}")
        
        # 构建命令行
        cmd = [sys.executable, "lip_sync.py"]
        if timeline_path:
            cmd.extend(["--timeline", timeline_path])
        else:
            cmd.append(cleaned_path)
        
        # 添加默认或自定义参数
        if lip_sync_args:
            cmd.extend(lip_sync_args)
        else:
            out_video = os.path.join(output_dir, f"{base}_final.mp4")
            cmd.extend(["-o", out_video])
            
        # 执行命令
        print(f"  执行命令: {' '.join(cmd)}")
        subprocess.run(cmd, check=True)

    # ── 清理 ──
    shutil.rmtree(tmp_dir, ignore_errors=True)
    if not (keep_parts or gen_timeline):
        if os.path.exists(parts_dir):
            shutil.rmtree(parts_dir, ignore_errors=True)

    # ── 生成切割报告 ──
    report = {
        "input": os.path.abspath(input_path),
        "output": os.path.abspath(cleaned_path),
        "keyword": keyword,
        "margin": margin,
        "original_duration": duration,
        "cleaned_duration": kept_total,
        "cut_count": len(hits),
        "cuts": [asdict(h) for h in hits],
        "kept_segments": [asdict(k) for k in keeps],
    }
    report_path = os.path.join(output_dir, f"{base}_cut_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    # ── 完成 ──
    cleaned_size = os.path.getsize(cleaned_path) / 1024 / 1024
    original_size = os.path.getsize(input_path) / 1024 / 1024

    print(f"\n{'='*60}")
    print(f"  🎉 处理完成！")
    print(f"{'='*60}")
    print(f"  原始视频:  {input_path}")
    print(f"             {original_size:.1f} MB  |  {duration:.2f}s")
    print(f"  输出视频:  {cleaned_path}")
    print(f"             {cleaned_size:.1f} MB  |  {kept_total:.2f}s")
    print(f"  切除数量:  {len(hits)} 处「{keyword}」")
    print(f"  切除时长:  {duration - kept_total:.2f}s")
    print(f"  识别报告:  {json_path}")
    print(f"  切割报告:  {report_path}")
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
        epilog="""
示例:
  # 基本用法（检测并切除所有"转场"）
  python cut_transition.py video.mp4

  # 自定义关键词
  python cut_transition.py video.mp4 -k "正在转场"

  # 使用大模型 + GPU
  python cut_transition.py video.mp4 -m large-v3 --device cuda

  # 加大切割边距（多切一点，确保口型干净）
  python cut_transition.py video.mp4 --margin 0.25

  # 保留分段文件
  python cut_transition.py video.mp4 --keep-parts

  # 指定输出目录
  python cut_transition.py video.mp4 -o ./output
  
  # 生成 timeline.json 用于 lip_sync.py
  python cut_transition.py video.mp4 --gen-timeline
  
  # 切割完成后直接执行嘴型同步
  python cut_transition.py video.mp4 --lip-sync
        """,
    )
    parser.add_argument("input", help="输入视频文件路径")
    parser.add_argument("-k", "--keyword", default="转场",
                        help="要检测并切除的关键词 (默认: 转场)")
    parser.add_argument("-m", "--model", default="large-v3",
                        choices=["tiny", "base", "small", "medium",
                                 "large", "large-v2", "large-v3"],
                        help="Whisper 模型 (默认: medium, 推荐 medium/large-v3)")
    parser.add_argument("--device", default="cpu",
                        choices=["cpu", "cuda"],
                        help="推理设备 (默认: cpu, 有GPU选cuda)")
    parser.add_argument("-o", "--output-dir", default=None,
                        help="输出目录 (默认: 与输入同目录)")
    parser.add_argument("--margin", type=float, default=0.15,
                        help="切割点两侧额外切除量/秒 (默认: 0.15)")
    parser.add_argument("--keep-parts", action="store_true",
                        help="保留中间分段文件")
    parser.add_argument("--min-seg", type=float, default=0.1,
                        help="保留段最短时长/秒 (默认: 0.1)")
                        
    # 新增参数 - 时间线与嘴型同步
    parser.add_argument("--gen-timeline", action="store_true",
                        help="生成时间线 JSON (用于 lip_sync.py)")
    parser.add_argument("--lip-sync", action="store_true",
                        help="处理完成后执行嘴型同步")
    parser.add_argument("--lip-sync-args", nargs=argparse.REMAINDER,
                        help="传递给 lip_sync.py 的额外参数")

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
        lip_sync=args.lip_sync,
        lip_sync_args=args.lip_sync_args
    )


if __name__ == "__main__":
    main()