#!/usr/bin/env python3
"""
视频片段合并 + 转场特效 + 字幕/文字叠加工具 (merge_videos.py)
================================================================
功能:
  1. 将多个视频片段合并为一个完整视频
  2. 支持 30+ 种转场特效（渐变、溶解、滑动、旋转等）
  3. 支持烧录 SRT/ASS 字幕文件（自定义字体）
  4. 支持添加文字水印/标题
  5. 自动标准化不同分辨率/帧率的视频片段
  6. 可选添加背景音乐

用法:
  python merge_videos.py clip1.mp4 clip2.mp4 clip3.mp4
  python merge_videos.py clip*.mp4 -t dissolve --td 0.8 -o output.mp4
  python merge_videos.py *.mp4 --subtitle sub.srt --font ./SimHei.ttf
  python merge_videos.py *.mp4 --text "精彩回顾" --font-size 48
  python merge_videos.py --list-transitions
"""

import subprocess
import os
import sys
import json
import argparse
import shutil
import tempfile
import random
from typing import List, Optional


# ═══════════════════════════════════════════════════════════════
#  转场特效定义
# ═══════════════════════════════════════════════════════════════

XFADE_TRANSITIONS = [
    "fade", "fadeblack", "fadewhite", "fadegrays",
    "distance", "wipeleft", "wiperight", "wipeup", "wipedown",
    "slideleft", "slideright", "slideup", "slidedown",
    "smoothleft", "smoothright", "smoothup", "smoothdown",
    "circlecrop", "rectcrop",
    "circleclose", "circleopen",
    "horzclose", "horzopen",
    "vertclose", "vertopen",
    "diagbl", "diagbr", "diagtl", "diagtr",
    "dissolve", "pixelize",
    "radial", "hblur",
    "hlslice", "hrslice", "vuslice", "vdslice",
]

POPULAR_TRANSITIONS = {
    "fade":        "经典淡入淡出",
    "fadeblack":   "黑场过渡",
    "fadewhite":   "白场过渡",
    "dissolve":    "溶解过渡",
    "wipeleft":    "向左擦除",
    "wiperight":   "向右擦除",
    "slideright":  "向右滑动",
    "slideleft":   "向左滑动",
    "circlecrop":  "圆形裁切",
    "circleopen":  "圆形展开",
    "circleclose": "圆形收缩",
    "radial":      "径向旋转",
    "pixelize":    "像素化",
    "hblur":       "水平模糊",
    "smoothleft":  "平滑左移",
    "smoothright": "平滑右移",
    "diagbl":      "左下对角线",
    "diagtr":      "右上对角线",
}


# ═══════════════════════════════════════════════════════════════
#  工具函数
# ═══════════════════════════════════════════════════════════════

def check_ffmpeg():
    """检查 ffmpeg / ffprobe 是否可用"""
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            print(f"❌ 未找到 {tool}，请先安装:")
            print("   Ubuntu/Debian : sudo apt install ffmpeg")
            print("   macOS         : brew install ffmpeg")
            print("   Windows       : https://ffmpeg.org/download.html")
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


def get_video_info(path: str) -> dict:
    """获取视频流 + 音频流信息"""
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate",
        "-of", "json", path,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, check=True)
    info = json.loads(r.stdout)
    if not info.get("streams"):
        raise ValueError(f"文件 {path} 中未找到视频流")

    s = info["streams"][0]
    parts = s.get("r_frame_rate", "30/1").split("/")
    fps = float(parts[0]) / float(parts[1]) if len(parts) == 2 else float(parts[0])

    # 音频流
    cmd2 = [
        "ffprobe", "-v", "error", "-select_streams", "a",
        "-show_entries", "stream=index", "-of", "csv=p=0", path,
    ]
    r2 = subprocess.run(cmd2, capture_output=True, text=True)
    has_audio = bool(r2.stdout.strip())

    return {
        "width": int(s["width"]),
        "height": int(s["height"]),
        "fps": round(fps, 3),
        "has_audio": has_audio,
        "duration": get_duration(path),
    }


# ── 字体自动查找 ──────────────────────────────

def find_chinese_font() -> Optional[str]:
    """尝试自动查找系统中文字体"""
    candidates = [
        # Linux
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
        # macOS
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        # Windows
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simsun.ttc",
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    return None


# ── ffmpeg 滤镜路径/文本转义 ─────────────────

def _esc_filter_path(path: str) -> str:
    """转义文件路径用于 ffmpeg 滤镜参数"""
    path = os.path.abspath(path).replace("\\", "/")
    path = path.replace(":", "\\:")
    path = path.replace("'", "''")
    return path


def _esc_drawtext(text: str) -> str:
    """转义 drawtext text= 中的特殊字符"""
    text = text.replace("\\", "\\\\")
    text = text.replace(":", "\\:")
    text = text.replace("'", "''")
    text = text.replace("%", "%%")
    return text


# ═══════════════════════════════════════════════════════════════
#  视频标准化
# ═══════════════════════════════════════════════════════════════

def normalize_clip(input_path: str, output_path: str,
                   width: int, height: int, fps: float):
    """
    标准化视频片段：统一分辨率 / 帧率 / 像素格式 / 音频格式。
    无音频的片段会自动添加静音轨道。
    """
    info = get_video_info(input_path)

    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
        f"fps={fps},format=yuv420p"
    )

    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-i", input_path,
    ]

    if not info["has_audio"]:
        cmd += [
            "-f", "lavfi",
            "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        ]

    cmd += ["-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2"]

    if not info["has_audio"]:
        cmd += ["-shortest"]

    cmd.append(output_path)
    subprocess.run(cmd, check=True)


# ═══════════════════════════════════════════════════════════════
#  合并方式 A：无转场 — concat demuxer（stream copy，快速）
# ═══════════════════════════════════════════════════════════════

def concat_simple(clip_paths: List[str], output_path: str):
    """用 concat demuxer 快速拼接（要求各段编码参数一致）"""
    list_file = tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, encoding="utf-8",
    )
    try:
        for p in clip_paths:
            list_file.write(f"file '{os.path.abspath(p)}'\n")
        list_file.close()
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
            "-f", "concat", "-safe", "0",
            "-i", list_file.name,
            "-c", "copy",
            "-movflags", "+faststart",
            output_path,
        ]
        subprocess.run(cmd, check=True)
    finally:
        os.unlink(list_file.name)


# ═══════════════════════════════════════════════════════════════
#  合并方式 B：xfade + acrossfade 转场
# ═══════════════════════════════════════════════════════════════

def merge_with_xfade(clip_paths: List[str],
                     output_path: str,
                     transitions: List[str],
                     td: float = 0.5):
    """
    用 xfade（视频）+ acrossfade（音频）把 N 段视频合并。

    参数:
      clip_paths  : 已标准化的视频文件列表
      transitions : 长度为 N-1 的转场名称列表
      td          : 每段转场时长（秒）
    """
    n = len(clip_paths)
    if n == 1:
        shutil.copy2(clip_paths[0], output_path)
        return

    durations = [get_duration(p) for p in clip_paths]

    # 安全检查：转场不能超过最短片段的一半
    min_dur = min(durations)
    safe_td = min(td, min_dur / 2 - 0.05)
    if safe_td < 0.05:
        print("  ⚠️  片段过短，已退回无转场拼接")
        concat_simple(clip_paths, output_path)
        return
    if safe_td < td:
        print(f"  ⚠️  转场时长已自动缩短: {td}s → {safe_td:.2f}s "
              f"(最短片段仅 {min_dur:.2f}s)")
        td = safe_td

    # ── 构建 filter_complex ──
    vf_parts: List[str] = []
    af_parts: List[str] = []

    accumulated = durations[0]
    prev_v = "0:v"
    prev_a = "0:a"

    for i in range(1, n):
        offset = max(0, accumulated - td)
        t_name = transitions[i - 1]

        # 视频 xfade
        out_v = "vout" if i == n - 1 else f"v{i}"
        vf_parts.append(
            f"[{prev_v}][{i}:v]xfade=transition={t_name}"
            f":duration={td:.4f}:offset={offset:.4f}[{out_v}]"
        )

        # 音频 acrossfade
        out_a = "aout" if i == n - 1 else f"a{i}"
        af_parts.append(
            f"[{prev_a}][{i}:a]acrossfade=d={td:.4f}"
            f":c1=tri:c2=tri[{out_a}]"
        )

        accumulated += durations[i] - td
        prev_v = out_v
        prev_a = out_a

    filter_complex = ";\n".join(vf_parts + af_parts)

    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning"]
    for p in clip_paths:
        cmd += ["-i", p]
    cmd += [
        "-filter_complex", filter_complex,
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        output_path,
    ]
    subprocess.run(cmd, check=True)


# ═══════════════════════════════════════════════════════════════
#  字幕烧录
# ═══════════════════════════════════════════════════════════════

def burn_subtitle(input_path: str, output_path: str,
                  subtitle_file: str,
                  font_file: Optional[str] = None,
                  font_size: int = 24,
                  font_color: str = "&Hffffff&",
                  outline: int = 2,
                  margin_v: int = 30):
    """
    将 SRT / ASS 字幕烧录到视频。

    对 SRT 会通过 force_style 覆盖字体样式；
    ASS 文件自带样式，仅在指定 font_dir 时补充字体搜索路径。
    """
    ext = os.path.splitext(subtitle_file)[1].lower()
    esc_sub = _esc_filter_path(subtitle_file)

    if ext == ".ass":
        vf = f"ass='{esc_sub}'"
        if font_file:
            font_dir = os.path.dirname(os.path.abspath(font_file))
            esc_dir = _esc_filter_path(font_dir)
            vf = f"ass='{esc_sub}':fontsdir='{esc_dir}'"
    else:
        # SRT / 其他文本字幕
        style_parts = [
            f"FontSize={font_size}",
            f"PrimaryColour={font_color}",
            f"Outline={outline}",
            f"MarginV={margin_v}",
        ]
        if font_file:
            font_name = os.path.splitext(os.path.basename(font_file))[0]
            style_parts.insert(0, f"FontName={font_name}")

        force_style = ",".join(style_parts)
        vf = f"subtitles='{esc_sub}':force_style='{force_style}'"

        if font_file:
            font_dir = os.path.dirname(os.path.abspath(font_file))
            esc_dir = _esc_filter_path(font_dir)
            vf += f":fontsdir='{esc_dir}'"

    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-i", input_path,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "copy",
        "-movflags", "+faststart",
        output_path,
    ]
    subprocess.run(cmd, check=True)


# ═══════════════════════════════════════════════════════════════
#  文字水印 / 标题叠加
# ═══════════════════════════════════════════════════════════════

TEXT_POSITIONS = {
    "top":          "x=(w-text_w)/2:y={m}",
    "center":       "x=(w-text_w)/2:y=(h-text_h)/2",
    "bottom":       "x=(w-text_w)/2:y=h-text_h-{m}",
    "top-left":     "x={m}:y={m}",
    "top-right":    "x=w-text_w-{m}:y={m}",
    "bottom-left":  "x={m}:y=h-text_h-{m}",
    "bottom-right": "x=w-text_w-{m}:y=h-text_h-{m}",
}


def overlay_text(input_path: str, output_path: str,
                 text: str,
                 font_file: Optional[str] = None,
                 font_size: int = 36,
                 font_color: str = "white",
                 position: str = "bottom",
                 bg_color: str = "black@0.5",
                 box_border: int = 8,
                 margin_px: int = 30,
                 show_from: Optional[float] = None,
                 show_to: Optional[float] = None):
    """
    用 drawtext 添加文字叠加层。
    支持自定义字体、颜色、位置、半透明背景框、显示时间段。
    """
    # 若未指定字体且文本含中文，自动查找
    if font_file is None:
        has_cjk = any("\u4e00" <= ch <= "\u9fff" for ch in text)
        if has_cjk:
            font_file = find_chinese_font()
            if font_file:
                print(f"     🔤 自动使用中文字体: {font_file}")
            else:
                print("     ⚠️  未找到中文字体，中文可能显示为方块。")
                print("        请用 --font 指定 .ttf/.ttc 字体文件")

    pos_template = TEXT_POSITIONS.get(position, TEXT_POSITIONS["bottom"])
    pos_str = pos_template.format(m=margin_px)

    esc_text = _esc_drawtext(text)

    dt_parts = [f"text='{esc_text}'"]
    if font_file:
        dt_parts.append(f"fontfile='{_esc_filter_path(font_file)}'")
    dt_parts += [
        f"fontsize={font_size}",
        f"fontcolor={font_color}",
        pos_str,
        f"box=1:boxcolor={bg_color}:boxborderw={box_border}",
        "line_spacing=8",
    ]

    # 时间范围
    if show_from is not None and show_to is not None:
        dt_parts.append(f"enable='between(t\\,{show_from}\\,{show_to})'")
    elif show_from is not None:
        dt_parts.append(f"enable='gte(t\\,{show_from})'")
    elif show_to is not None:
        dt_parts.append(f"enable='lte(t\\,{show_to})'")

    vf = "drawtext=" + ":".join(dt_parts)

    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-i", input_path,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "copy",
        "-movflags", "+faststart",
        output_path,
    ]
    subprocess.run(cmd, check=True)


# ═══════════════════════════════════════════════════════════════
#  背景音乐
# ═══════════════════════════════════════════════════════════════

def mix_bgm(input_path: str, output_path: str,
            bgm_path: str,
            bgm_volume: float = 0.3,
            original_volume: float = 1.0,
            fade_out: float = 3.0):
    """
    混合背景音乐：
    - 背景音乐自动循环到视频长度
    - 支持调节原声/背景音量比
    - 结尾自动淡出
    """
    dur = get_duration(input_path)

    af = (
        f"[1:a]aloop=loop=-1:size=2e+09,atrim=0:{dur:.4f},"
        f"volume={bgm_volume},afade=t=out:st={max(0, dur - fade_out)}:d={fade_out}[bgm];"
        f"[0:a]volume={original_volume}[orig];"
        f"[orig][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]"
    )

    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-i", input_path,
        "-i", bgm_path,
        "-filter_complex", af,
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        output_path,
    ]
    subprocess.run(cmd, check=True)


# ═══════════════════════════════════════════════════════════════
#  主处理流程
# ═══════════════════════════════════════════════════════════════

def process(input_files: List[str], *,
            output: Optional[str] = None,
            transition: str = "fade",
            transition_duration: float = 0.5,
            subtitle: Optional[str] = None,
            text: Optional[str] = None,
            font: Optional[str] = None,
            font_size: int = 36,
            font_color: str = "white",
            text_position: str = "bottom",
            sub_font_size: int = 24,
            target_width: Optional[int] = None,
            target_height: Optional[int] = None,
            target_fps: Optional[float] = None,
            bgm: Optional[str] = None,
            bgm_volume: float = 0.3,
            show_from: Optional[float] = None,
            show_to: Optional[float] = None):
    """端到端处理: 标准化 → 合并(转场) → 字幕 → 文字 → 背景音乐"""

    check_ffmpeg()

    # ── 校验输入 ──
    for f in input_files:
        if not os.path.isfile(f):
            print(f"❌ 文件不存在: {f}")
            sys.exit(1)
    if subtitle and not os.path.isfile(subtitle):
        print(f"❌ 字幕文件不存在: {subtitle}")
        sys.exit(1)
    if font and not os.path.isfile(font):
        print(f"❌ 字体文件不存在: {font}")
        sys.exit(1)
    if bgm and not os.path.isfile(bgm):
        print(f"❌ 背景音乐文件不存在: {bgm}")
        sys.exit(1)

    if output is None:
        base = os.path.splitext(input_files[0])[0]
        output = f"{base}_merged.mp4"

    tmp_dir = tempfile.mkdtemp(prefix="merge_vids_")

    try:
        # ══════════════════════════════════════
        #  STEP 0: 收集信息
        # ══════════════════════════════════════
        print(f"\n{'='*62}")
        print(f"  🎬  视频合并工具")
        print(f"{'='*62}")
        print(f"\n  📂  输入文件 ({len(input_files)} 个):")

        infos = []
        total_in_dur = 0
        for i, fp in enumerate(input_files, 1):
            info = get_video_info(fp)
            infos.append(info)
            total_in_dur += info["duration"]
            audio_icon = "🔊" if info["has_audio"] else "🔇"
            print(f"     {i:02d}. {os.path.basename(fp):40s} "
                  f"{info['width']}×{info['height']}  "
                  f"{info['fps']}fps  {info['duration']:.1f}s  {audio_icon}")

        # ── 确定目标格式 ──
        tw = target_width  or max(i["width"]  for i in infos)
        th = target_height or max(i["height"] for i in infos)
        tfps = target_fps  or max(i["fps"]    for i in infos)
        # 保证偶数（x264 要求）
        tw = tw if tw % 2 == 0 else tw + 1
        th = th if th % 2 == 0 else th + 1

        print(f"\n  🎯  目标格式: {tw}×{th} @ {tfps}fps")

        # ══════════════════════════════════════
        #  STEP 1: 标准化
        # ══════════════════════════════════════
        print(f"\n  ⚙️   标准化片段 ...")
        norm_clips: List[str] = []
        for i, fp in enumerate(input_files):
            norm_path = os.path.join(tmp_dir, f"norm_{i:04d}.mp4")
            print(f"     [{i+1}/{len(input_files)}] {os.path.basename(fp)}")
            normalize_clip(fp, norm_path, tw, th, tfps)
            norm_clips.append(norm_path)
        print(f"  ✅  标准化完成")

        # ══════════════════════════════════════
        #  STEP 2: 合并
        # ══════════════════════════════════════
        need_post = bool(subtitle or text or bgm)
        merged_path = os.path.join(tmp_dir, "merged.mp4") if need_post else output

        if transition == "none" or len(norm_clips) == 1:
            # ── 无转场直接拼接 ──
            print(f"\n  🔗  拼接 {len(norm_clips)} 个片段 (无转场) ...")
            if len(norm_clips) == 1:
                shutil.copy2(norm_clips[0], merged_path)
            else:
                concat_simple(norm_clips, merged_path)
        else:
            # ── 解析转场列表 ──
            n = len(norm_clips)
            if transition == "random":
                trans_list = [random.choice(XFADE_TRANSITIONS) for _ in range(n - 1)]
                t_desc = "随机"
            elif "," in transition:
                parts = [t.strip() for t in transition.split(",")]
                if len(parts) == 1:
                    trans_list = parts * (n - 1)
                elif len(parts) == n - 1:
                    trans_list = parts
                else:
                    print(f"  ❌ 指定了 {len(parts)} 个转场，但有 {n-1} 个连接点")
                    sys.exit(1)
                t_desc = ",".join(trans_list)
            else:
                trans_list = [transition] * (n - 1)
                t_desc = transition

            print(f"\n  ✨  转场合并 {n} 个片段 ...")
            print(f"     转场效果:   {t_desc}")
            print(f"     转场时长:   {transition_duration}s")
            if transition == "random":
                for idx, t in enumerate(trans_list, 1):
                    print(f"       #{idx}: {t}")

            merge_with_xfade(norm_clips, merged_path,
                             transitions=trans_list,
                             td=transition_duration)

        print(f"  ✅  合并完成")
        current = merged_path

        # ══════════════════════════════════════
        #  STEP 3: 烧录字幕
        # ══════════════════════════════════════
        if subtitle:
            print(f"\n  📝  烧录字幕: {os.path.basename(subtitle)}")
            sub_out = os.path.join(tmp_dir, "subtitled.mp4") if (text or bgm) else output
            burn_subtitle(
                current, sub_out,
                subtitle_file=subtitle,
                font_file=font,
                font_size=sub_font_size,
            )
            current = sub_out
            print(f"  ✅  字幕烧录完成")

        # ══════════════════════════════════════
        #  STEP 4: 文字叠加
        # ══════════════════════════════════════
        if text:
            print(f"\n  🏷️   添加文字: {text}")
            text_out = os.path.join(tmp_dir, "texted.mp4") if bgm else output
            overlay_text(
                current, text_out,
                text=text,
                font_file=font,
                font_size=font_size,
                font_color=font_color,
                position=text_position,
                show_from=show_from,
                show_to=show_to,
            )
            current = text_out
            print(f"  ✅  文字叠加完成")

        # ══════════════════════════════════════
        #  STEP 5: 背景音乐
        # ══════════════════════════════════════
        if bgm:
            print(f"\n  🎵  混合背景音乐: {os.path.basename(bgm)}")
            mix_bgm(current, output,
                    bgm_path=bgm,
                    bgm_volume=bgm_volume)
            current = output
            print(f"  ✅  背景音乐混合完成")

        # ── 确保输出到位 ──
        if current != output:
            shutil.copy2(current, output)

        # ══════════════════════════════════════
        #  完成摘要
        # ══════════════════════════════════════
        out_dur  = get_duration(output)
        out_size = os.path.getsize(output) / 1024 / 1024
        in_size  = sum(os.path.getsize(f) for f in input_files) / 1024 / 1024

        print(f"\n{'='*62}")
        print(f"  🎉  处理完成!")
        print(f"{'='*62}")
        print(f"  输入:  {len(input_files)} 个文件  |  "
              f"{in_size:.1f} MB  |  {total_in_dur:.2f}s")
        print(f"  输出:  {output}")
        print(f"         {out_size:.1f} MB  |  {out_dur:.2f}s")
        if transition not in ("none",) and len(input_files) > 1:
            overlap = total_in_dur - out_dur
            print(f"  转场:  {len(input_files)-1} 处  |  重叠 {overlap:.2f}s")
        extras = []
        if subtitle: extras.append("字幕")
        if text:     extras.append("文字")
        if bgm:      extras.append("BGM")
        if extras:
            print(f"  附加:  {' + '.join(extras)}")
        print(f"{'='*62}\n")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# ═══════════════════════════════════════════════════════════════
#  列出转场特效
# ═══════════════════════════════════════════════════════════════

def list_transitions():
    print(f"\n{'='*58}")
    print(f"  可用转场特效 (共 {len(XFADE_TRANSITIONS)} 种)")
    print(f"{'='*58}")

    print(f"\n  🌟 常用推荐:")
    print(f"  {'─'*52}")
    for name, desc in POPULAR_TRANSITIONS.items():
        print(f"     {name:<16s}  {desc}")

    print(f"\n  📋 全部列表:")
    print(f"  {'─'*52}")
    cols = 4
    for i in range(0, len(XFADE_TRANSITIONS), cols):
        row = XFADE_TRANSITIONS[i:i+cols]
        print("    ", "  ".join(f"{t:<16s}" for t in row))

    print(f"\n  💡 特殊值:")
    print(f"     random           随机选择（每个连接点不同）")
    print(f"     none             无转场，直接拼接")
    print(f"     fade,dissolve    逗号分隔 = 逐个指定")
    print(f"{'='*58}\n")


# ═══════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="视频片段合并 + 转场特效 + 字幕/文字叠加工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
示例:
  # 基本合并（默认 fade 转场）
  python merge_videos.py clip1.mp4 clip2.mp4 clip3.mp4

  # 指定转场 + 时长
  python merge_videos.py clip1.mp4 clip2.mp4 -t dissolve --td 0.8

  # 每个连接点用不同转场
  python merge_videos.py a.mp4 b.mp4 c.mp4 -t fade,dissolve

  # 随机转场
  python merge_videos.py *.mp4 -t random

  # 无转场快速拼接
  python merge_videos.py *.mp4 -t none

  # 烧录字幕 + 自定义字体
  python merge_videos.py *.mp4 --subtitle sub.srt --font SimHei.ttf

  # 添加文字水印
  python merge_videos.py *.mp4 --text "精彩回顾" --font SimHei.ttf \\
                         --font-size 48 --text-pos top

  # 添加背景音乐
  python merge_videos.py *.mp4 --bgm music.mp3 --bgm-volume 0.2

  # 完整示例
  python merge_videos.py part*.mp4 -t fadeblack --td 1.0 \\
      --subtitle sub.srt --text "我的视频" --font SimHei.ttf \\
      --bgm bg.mp3 -o final.mp4

  # 查看所有转场特效
  python merge_videos.py --list-transitions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        """,
    )

    parser.add_argument("inputs", nargs="*", help="输入视频文件（按顺序）")
    parser.add_argument("-o", "--output", default=None,
                        help="输出文件路径 (默认: <第一个文件>_merged.mp4)")

    # ── 转场 ──
    tg = parser.add_argument_group("🎞️  转场设置")
    tg.add_argument("-t", "--transition", default="fade",
                    help="转场特效名称 / random / none / 逗号分隔列表"
                         " (默认: fade)")
    tg.add_argument("--td", type=float, default=0.5,
                    dest="transition_duration",
                    help="转场时长/秒 (默认: 0.5)")
    tg.add_argument("--list-transitions", action="store_true",
                    help="列出所有可用转场特效")

    # ── 字幕 ──
    sg = parser.add_argument_group("📝  字幕设置")
    sg.add_argument("--subtitle", default=None,
                    help="字幕文件路径 (.srt / .ass)")
    sg.add_argument("--sub-font-size", type=int, default=24,
                    help="字幕字号 (默认: 24)")

    # ── 文字叠加 ──
    xg = parser.add_argument_group("🏷️   文字叠加")
    xg.add_argument("--text", default=None, help="叠加文字内容")
    xg.add_argument("--text-pos", default="bottom",
                    choices=list(TEXT_POSITIONS.keys()),
                    help="文字位置 (默认: bottom)")
    xg.add_argument("--show-from", type=float, default=None,
                    help="文字出现时间/秒 (默认: 始终显示)")
    xg.add_argument("--show-to", type=float, default=None,
                    help="文字消失时间/秒")

    # ── 字体 ──
    fg = parser.add_argument_group("🔤  字体设置")
    fg.add_argument("--font", default=None,
                    help="字体文件路径 (.ttf/.ttc，中文推荐 SimHei)")
    fg.add_argument("--font-size", type=int, default=36,
                    help="文字叠加字号 (默认: 36)")
    fg.add_argument("--font-color", default="white",
                    help="文字颜色 (默认: white)")

    # ── 背景音乐 ──
    bg = parser.add_argument_group("🎵  背景音乐")
    bg.add_argument("--bgm", default=None, help="背景音乐文件路径")
    bg.add_argument("--bgm-volume", type=float, default=0.3,
                    help="背景音乐音量 0.0~1.0 (默认: 0.3)")

    # ── 视频格式 ──
    vg = parser.add_argument_group("📐  视频格式")
    vg.add_argument("--width",  type=int, default=None, help="目标宽度")
    vg.add_argument("--height", type=int, default=None, help="目标高度")
    vg.add_argument("--fps",    type=float, default=None, help="目标帧率")

    args = parser.parse_args()

    # ── 特殊命令 ──
    if args.list_transitions:
        list_transitions()
        return

    if not args.inputs:
        parser.print_help()
        print("\n  💡 提示: 至少需要一个输入视频文件\n")
        sys.exit(1)

    # ── 校验转场名称 ──
    t = args.transition
    if t not in ("none", "random"):
        for part in t.split(","):
            part = part.strip()
            if part not in XFADE_TRANSITIONS:
                print(f"❌ 未知转场特效: {part}")
                print(f"   运行 --list-transitions 查看可用列表")
                sys.exit(1)

    process(
        input_files=args.inputs,
        output=args.output,
        transition=args.transition,
        transition_duration=args.transition_duration,
        subtitle=args.subtitle,
        text=args.text,
        font=args.font,
        font_size=args.font_size,
        font_color=args.font_color,
        text_position=args.text_pos,
        sub_font_size=args.sub_font_size,
        target_width=args.width,
        target_height=args.height,
        target_fps=args.fps,
        bgm=args.bgm,
        bgm_volume=args.bgm_volume,
        show_from=args.show_from,
        show_to=args.show_to,
    )


if __name__ == "__main__":
    main()