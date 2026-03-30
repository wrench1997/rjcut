#!/usr/bin/env python3
"""
视频处理基础工具函数
"""

import subprocess
import os
import json
import shutil
import tempfile
from typing import List, Optional, Dict, Any, Tuple


def check_ffmpeg():
    """检查 ffmpeg 和 ffprobe 是否已安装"""
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            print(f"❌ 未找到 {tool}，请先安装:")
            print("   Ubuntu/Debian : sudo apt install ffmpeg")
            print("   macOS         : brew install ffmpeg")
            print("   Windows       : https://ffmpeg.org/download.html")
            return False
    return True


def get_duration(path: str) -> float:
    """获取视频时长（秒）"""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def get_video_info(path: str) -> dict:
    """获取视频信息：分辨率、帧率、是否有音频等"""
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


def find_chinese_font() -> Optional[str]:
    """查找系统中可用的中文字体"""
    candidates = [
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simsun.ttc",
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    return None


def _esc_filter_path(path: str) -> str:
    """转义路径，用于 FFmpeg 过滤器"""
    path = os.path.abspath(path).replace("\\", "/")
    path = path.replace(":", "\\:")
    path = path.replace("'", "''")
    return path


def _esc_drawtext(text: str) -> str:
    """转义文本，用于 FFmpeg drawtext 过滤器"""
    text = text.replace("\\", "\\\\")
    text = text.replace(":", "\\:")
    text = text.replace("'", "''")
    text = text.replace("%", "%%")
    return text


def format_ass_time(seconds: float) -> str:
    """秒数 → ASS 时间格式 H:MM:SS.cc"""
    if seconds < 0:
        seconds = 0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def normalize_clip(input_path: str, output_path: str,
                   width: int, height: int, fps: float):
    """标准化视频片段：统一分辨率、帧率、格式"""
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
        cmd += ["-f", "lavfi", "-i",
                "anullsrc=channel_layout=stereo:sample_rate=44100"]
    cmd += ["-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2"]
    if not info["has_audio"]:
        cmd += ["-shortest"]
    cmd.append(output_path)
    subprocess.run(cmd, check=True)


def concat_simple(clip_paths: List[str], output_path: str):
    """稳健拼接视频（使用 filter_complex 确保音视频绝对同步，消除 DTS 错误）"""
    n = len(clip_paths)
    if n == 0:
        return
    if n == 1:
        shutil.copy2(clip_paths[0], output_path)
        return

    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning"]
    for p in clip_paths:
        cmd += ["-i", p]

    # 构建滤镜链: [0:v:0][0:a:0][1:v:0][1:a:0]concat=n=X:v=1:a=1[vout][aout]
    filter_parts = []
    for i in range(n):
        filter_parts.append(f"[{i}:v:0][{i}:a:0]")
    filter_parts.append(f"concat=n={n}:v=1:a=1[vout][aout]")
    filter_complex = "".join(filter_parts)

    cmd += [
        "-filter_complex", filter_complex,
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        "-movflags", "+faststart",
        output_path,
    ]
    subprocess.run(cmd, check=True)


def burn_subtitle(input_path: str, output_path: str,
                  subtitle_file: str,
                  font_file: Optional[str] = None,
                  font_size: int = 24,
                  font_color: str = "&Hffffff&",
                  outline: int = 2,
                  margin_v: int = 30):
    """烧录传统字幕（SRT/ASS）到视频"""
    ext = os.path.splitext(subtitle_file)[1].lower()
    esc_sub = _esc_filter_path(subtitle_file)

    if ext == ".ass":
        vf = f"ass='{esc_sub}'"
        if font_file:
            font_dir = os.path.dirname(os.path.abspath(font_file))
            esc_dir = _esc_filter_path(font_dir)
            vf = f"ass='{esc_sub}':fontsdir='{esc_dir}'"
    else:
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
        "-i", input_path, "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "copy", "-movflags", "+faststart",
        output_path,
    ]
    subprocess.run(cmd, check=True)


# 文字位置预设
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
    """叠加文字到视频"""
    if font_file is None:
        has_cjk = any("\u4e00" <= ch <= "\u9fff" for ch in text)
        if has_cjk:
            font_file = find_chinese_font()

    pos_template = TEXT_POSITIONS.get(position, TEXT_POSITIONS["bottom"])
    pos_str = pos_template.format(m=margin_px)
    esc_text = _esc_drawtext(text)

    dt_parts = [f"text='{esc_text}'"]
    if font_file:
        dt_parts.append(f"fontfile='{_esc_filter_path(font_file)}'")
    dt_parts += [
        f"fontsize={font_size}", f"fontcolor={font_color}",
        pos_str,
        f"box=1:boxcolor={bg_color}:boxborderw={box_border}",
        "line_spacing=8",
    ]
    if show_from is not None and show_to is not None:
        dt_parts.append(f"enable='between(t\\,{show_from}\\,{show_to})'")
    elif show_from is not None:
        dt_parts.append(f"enable='gte(t\\,{show_from})'")
    elif show_to is not None:
        dt_parts.append(f"enable='lte(t\\,{show_to})'")

    vf = "drawtext=" + ":".join(dt_parts)
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-i", input_path, "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "copy", "-movflags", "+faststart",
        output_path,
    ]
    subprocess.run(cmd, check=True)


def mix_bgm(input_path: str, output_path: str,
            bgm_path: str, bgm_volume: float = 0.3,
            original_volume: float = 1.0, fade_out: float = 3.0):
    """混合背景音乐到视频"""
    dur = get_duration(input_path)
    af = (
        f"[1:a]aloop=loop=-1:size=2e+09,atrim=0:{dur:.4f},"
        f"volume={bgm_volume},afade=t=out:st={max(0, dur - fade_out)}"
        f":d={fade_out}[bgm];"
        f"[0:a]volume={original_volume}[orig];"
        f"[orig][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]"
    )
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-i", input_path, "-i", bgm_path,
        "-filter_complex", af,
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        output_path,
    ]
    subprocess.run(cmd, check=True)