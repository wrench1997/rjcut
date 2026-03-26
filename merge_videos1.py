#!/usr/bin/env python3
"""
视频片段合并 + 转场特效 + 逐字字幕特效工具 (merge_videos.py v2)
================================================================
新增功能:
  ★ 读取 Whisper JSON 逐字时间戳，生成精准口型同步字幕
  ★ 4种字幕特效: 卡拉OK填充 / 逐字高亮 / 打字机 / 弹跳
  ★ 自动过滤"转场"标记词
  ★ 长句自动分行

用法:
  # 单视频 + Whisper JSON 字幕 (卡拉OK效果)
  python merge_videos.py video.mp4 --whisper-json transcript.json

  # 指定特效 + 字体
  python merge_videos.py video.mp4 --whisper-json t.json \\
         --sub-effect highlight --font SimHei.ttf

  # 合并多段 + 转场 + 逐字字幕
  python merge_videos.py clip*.mp4 -t dissolve --td 0.8 \\
         --whisper-json transcript.json --sub-effect karaoke

  # 查看所有字幕特效
  python merge_videos.py --list-effects
"""

import subprocess
import os
import sys
import json
import argparse
import shutil
import tempfile
import random
from typing import List, Optional, Tuple


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
#  字幕特效定义  ★ 新增
# ═══════════════════════════════════════════════════════════════

SUBTITLE_EFFECTS = {
    "karaoke":    "卡拉OK填充 — 逐字从白变金，填充动画",
    "highlight":  "逐字高亮 — 当前字放大变色，其余变暗",
    "typewriter": "打字机 — 字逐个出现，逐步构建句子",
    "bounce":     "弹跳出现 — 当前字弹跳放大后回弹",
}

# ASS 颜色 (格式: &HAABBGGRR)
COLOR_PRESETS = {
    "gold":    "&H0000DDFF",  # 金黄
    "yellow":  "&H0000FFFF",  # 纯黄
    "cyan":    "&H00FFFF00",  # 青色
    "red":     "&H000000FF",  # 红色
    "green":   "&H0000FF00",  # 绿色
    "pink":    "&H009F00FF",  # 粉色
    "orange":  "&H000099FF",  # 橙色
    "white":   "&H00FFFFFF",  # 白色
}


# ═══════════════════════════════════════════════════════════════
#  工具函数
# ═══════════════════════════════════════════════════════════════

def check_ffmpeg():
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
    path = os.path.abspath(path).replace("\\", "/")
    path = path.replace(":", "\\:")
    path = path.replace("'", "''")
    return path


def _esc_drawtext(text: str) -> str:
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


# ═══════════════════════════════════════════════════════════════
#  ★ Whisper JSON 解析 + 预处理  (新增)
# ═══════════════════════════════════════════════════════════════

def load_whisper_json(json_path: str) -> dict:
    """加载 Whisper 输出的 JSON 文件"""
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def preprocess_segments(
    data: dict,
    filter_transition: bool = True,
    max_chars_per_line: int = 18,
) -> List[dict]:
    """
    预处理 Whisper segments:
      1. 过滤 "转场" 标记词
      2. 拆分超长句子为多行
      3. 跳过空段
    返回: [{"words": [...], "text": "...", "start": float, "end": float}, ...]
    """
    segments = data.get("segments", [])
    processed = []

    for seg in segments:
        words = list(seg.get("words", []))
        if not words:
            continue

        # ── 过滤 "转场" ──
        if filter_transition:
            filtered = []
            i = 0
            while i < len(words):
                w = words[i]
                # 检测 "转" + "场" 连续两字
                if (w["text"] == "转"
                        and i + 1 < len(words)
                        and words[i + 1]["text"] == "场"):
                    i += 2  # 跳过这两个字
                    continue
                # 检测单个 token "转场"
                if w["text"] == "转场":
                    i += 1
                    continue
                filtered.append(w)
                i += 1
            words = filtered

        if not words:
            continue

        full_text = "".join(w["text"] for w in words)
        if not full_text.strip():
            continue

        # ── 拆分过长句子 ──
        if len(full_text) <= max_chars_per_line:
            processed.append({
                "words": words,
                "text": full_text,
                "start": words[0]["start"],
                "end": words[-1]["end"],
            })
        else:
            for chunk_words in _split_words_into_lines(words, max_chars_per_line):
                if chunk_words:
                    processed.append({
                        "words": chunk_words,
                        "text": "".join(w["text"] for w in chunk_words),
                        "start": chunk_words[0]["start"],
                        "end": chunk_words[-1]["end"],
                    })

    return processed


def _split_words_into_lines(
    words: List[dict], max_chars: int
) -> List[List[dict]]:
    """按最大字符数将 words 拆分成多行"""
    lines: List[List[dict]] = []
    cur_line: List[dict] = []
    cur_len = 0

    # 优先在标点/语气词处断行
    break_chars = set("，。！？；：、,.")

    for w in words:
        wlen = len(w["text"])
        if cur_len + wlen > max_chars and cur_line:
            lines.append(cur_line)
            cur_line = []
            cur_len = 0
        cur_line.append(w)
        cur_len += wlen

        # 在标点后断行
        if cur_len >= max_chars * 0.6 and w["text"][-1] in break_chars:
            lines.append(cur_line)
            cur_line = []
            cur_len = 0

    if cur_line:
        lines.append(cur_line)
    return lines


# ═══════════════════════════════════════════════════════════════
#  ★ ASS 字幕生成 — 逐字特效  (新增)
# ═══════════════════════════════════════════════════════════════

def generate_word_ass(
    segments: List[dict],
    output_path: str,
    effect: str = "karaoke",
    font_name: str = "SimHei",
    font_size: int = 52,
    res_x: int = 1920,
    res_y: int = 1080,
    margin_v: int = 50,
    highlight_color: str = "&H0000DDFF",   # 金黄 (高亮/填充色)
    base_color: str = "&H00FFFFFF",        # 白色 (基础色)
    outline_color: str = "&H00000000",     # 黑色描边
    back_color: str = "&H80000000",        # 半透明阴影
    outline: int = 3,
    shadow: int = 2,
) -> str:
    """
    根据逐字时间戳生成 ASS 字幕文件。

    支持的特效 (effect):
      karaoke   — 卡拉OK填充 (逐字从 base_color 变为 highlight_color)
      highlight — 逐字高亮 (当前字放大变色)
      typewriter— 打字机 (字逐个出现)
      bounce    — 弹跳 (当前字弹跳出现)

    返回: 生成的 ASS 文件路径
    """

    # ══════════════════════════════════
    #  ASS 文件头
    # ══════════════════════════════════
    header = f"""[Script Info]
Title: Word-Sync Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: {res_x}
PlayResY: {res_y}
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
"""

    # 根据特效类型定义样式
    if effect == "karaoke":
        # 卡拉OK: Primary=高亮色(填充完成), Secondary=基础色(未填充)
        header += (
            f"Style: Default,{font_name},{font_size},"
            f"{highlight_color},{base_color},{outline_color},{back_color},"
            f"-1,0,0,0,100,100,2,0,1,{outline},{shadow},"
            f"2,10,10,{margin_v},1\n"
        )
    elif effect in ("highlight", "bounce"):
        # 高亮/弹跳: 默认白色, 事件中用 override 变色
        header += (
            f"Style: Default,{font_name},{font_size},"
            f"{base_color},{base_color},{outline_color},{back_color},"
            f"0,0,0,0,100,100,2,0,1,{outline},{shadow},"
            f"2,10,10,{margin_v},1\n"
        )
    elif effect == "typewriter":
        header += (
            f"Style: Default,{font_name},{font_size},"
            f"{base_color},{base_color},{outline_color},{back_color},"
            f"-1,0,0,0,100,100,2,0,1,{outline},{shadow},"
            f"2,10,10,{margin_v},1\n"
        )

    header += f"""
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    # ══════════════════════════════════
    #  生成事件
    # ══════════════════════════════════
    events: List[str] = []

    for seg in segments:
        words = seg["words"]
        if not words:
            continue

        if effect == "karaoke":
            events.extend(_eff_karaoke(seg, highlight_color))
        elif effect == "highlight":
            events.extend(_eff_highlight(seg, highlight_color))
        elif effect == "typewriter":
            events.extend(_eff_typewriter(seg, highlight_color))
        elif effect == "bounce":
            events.extend(_eff_bounce(seg, highlight_color))

    # ── 写入 ASS 文件 ──
    with open(output_path, "w", encoding="utf-8-sig") as f:
        f.write(header)
        for ev in events:
            f.write(ev + "\n")

    print(f"     📄 ASS 字幕已生成: {output_path}")
    print(f"        共 {len(events)} 条字幕事件, {len(segments)} 段")
    return output_path


# ── 特效 1: 卡拉OK 填充 ─────────────────────────

def _eff_karaoke(seg: dict, hl_color: str) -> List[str]:
    """
    卡拉OK效果: 文字从 SecondaryColour(白) 逐字填充为 PrimaryColour(金)
    使用 ASS \\kf 标签实现平滑填充动画
    """
    words = seg["words"]
    seg_start = seg["start"]
    seg_end = seg["end"]

    parts = []
    prev_end = seg_start

    for w in words:
        # 包含前面的间隙时间, 确保总时长精确
        dur = w["end"] - prev_end
        dur_cs = max(1, round(dur * 100))
        parts.append(f"{{\\kf{dur_cs}}}{w['text']}")
        prev_end = w["end"]

    # 添加淡入淡出
    text = "{\\fad(150,300)}" + "".join(parts)

    return [
        f"Dialogue: 0,{format_ass_time(seg_start)},"
        f"{format_ass_time(seg_end + 0.3)},Default,,0,0,0,,{text}"
    ]


# ── 特效 2: 逐字高亮 ────────────────────────────

def _eff_highlight(seg: dict, hl_color: str) -> List[str]:
    """
    逐字高亮: 显示完整句子, 当前发音的字用醒目颜色+放大显示
    每个字的时间段生成一条独立事件
    """
    words = seg["words"]
    full_text = seg["text"]
    events = []

    # 颜色 (override 格式: \\c&HBBGGRR&)
    # 从 &HAABBGGRR 转为 \\c&HBBGGRR&
    hl_c = "\\c" + hl_color.replace("&H00", "&H") if hl_color.startswith("&H00") else "\\c" + hl_color
    # 简化: 直接用 BBGGRR 部分
    hl_bgr = hl_color[4:]  # 去掉 &H00 前缀, 得到 BBGGRR
    dim_bgr = "999999"     # 暗灰色

    # 计算每个 word 在 full_text 中的字符位置
    positions = []
    pos = 0
    for w in words:
        positions.append(pos)
        pos += len(w["text"])

    for i, w in enumerate(words):
        p = positions[i]
        wt = w["text"]
        before = full_text[:p]
        after = full_text[p + len(wt):]

        # 构建高亮文本
        line_parts = []
        if before:
            line_parts.append(f"{{\\c&H{dim_bgr}&\\b0}}{before}")
        # 当前字: 高亮色 + 加粗 + 放大115%
        line_parts.append(
            f"{{\\c&H{hl_bgr}&\\b1\\fscx115\\fscy115}}{wt}"
        )
        if after:
            line_parts.append(
                f"{{\\c&H{dim_bgr}&\\b0\\fscx100\\fscy100}}{after}"
            )

        line_text = "".join(line_parts)

        # 首字淡入, 末字淡出
        if i == 0:
            line_text = "{\\fad(200,0)}" + line_text
        if i == len(words) - 1:
            line_text = "{\\fad(0,300)}" + line_text

        # 时间: 从当前字开始 到 下一个字开始 (或末尾+缓冲)
        start_t = w["start"]
        end_t = words[i + 1]["start"] if i < len(words) - 1 else w["end"] + 0.3

        events.append(
            f"Dialogue: 0,{format_ass_time(start_t)},"
            f"{format_ass_time(end_t)},Default,,0,0,0,,{line_text}"
        )

    return events


# ── 特效 3: 打字机 ──────────────────────────────

def _eff_typewriter(seg: dict, hl_color: str) -> List[str]:
    """
    打字机效果: 字逐个出现, 逐步构建完整句子
    最新出现的字用高亮色显示
    """
    words = seg["words"]
    seg_end = seg["end"]
    events = []
    hl_bgr = hl_color[4:]

    for i, w in enumerate(words):
        # 已出现的文字
        prev_text = "".join(ww["text"] for ww in words[:i])
        cur_text = w["text"]

        # 前面的字用白色, 当前字用高亮色
        display_parts = []
        if prev_text:
            display_parts.append(f"{{\\c&HFFFFFF&}}{prev_text}")
        display_parts.append(
            f"{{\\c&H{hl_bgr}&\\b1}}{cur_text}"
        )

        display = "".join(display_parts)

        # 首字淡入
        if i == 0:
            display = "{\\fad(150,0)}" + display

        start_t = w["start"]
        end_t = words[i + 1]["start"] if i < len(words) - 1 else seg_end + 0.5

        # 末字: 显示完整句子并淡出
        if i == len(words) - 1:
            full = f"{{\\fad(0,400)}}{{\\c&HFFFFFF&}}{seg['text']}"
            # 先显示带高亮的版本
            events.append(
                f"Dialogue: 0,{format_ass_time(start_t)},"
                f"{format_ass_time(w['end'])},Default,,0,0,0,,{display}"
            )
            # 再显示全白版本并淡出
            events.append(
                f"Dialogue: 0,{format_ass_time(w['end'])},"
                f"{format_ass_time(seg_end + 0.5)},Default,,0,0,0,,{full}"
            )
            continue

        events.append(
            f"Dialogue: 0,{format_ass_time(start_t)},"
            f"{format_ass_time(end_t)},Default,,0,0,0,,{display}"
        )

    return events


# ── 特效 4: 弹跳出现 ────────────────────────────

def _eff_bounce(seg: dict, hl_color: str) -> List[str]:
    """
    弹跳效果: 每个字出现时有放大→回弹的动画
    使用 ASS \\t 动画标签
    """
    words = seg["words"]
    full_text = seg["text"]
    events = []
    hl_bgr = hl_color[4:]
    dim_bgr = "AAAAAA"

    positions = []
    pos = 0
    for w in words:
        positions.append(pos)
        pos += len(w["text"])

    for i, w in enumerate(words):
        p = positions[i]
        wt = w["text"]
        before = full_text[:p]
        after = full_text[p + len(wt):]

        # 当前字带弹跳动画: 先放大130%, 然后回弹到100%
        line_parts = []
        if before:
            line_parts.append(f"{{\\c&H{dim_bgr}&}}{before}")

        # \\t(start,end,style): 在时间范围内做动画
        # 弹跳: 0→80ms 放大到130%, 80→200ms 缩回100%
        line_parts.append(
            f"{{\\c&H{hl_bgr}&\\b1"
            f"\\fscx130\\fscy130"
            f"\\t(0,120,\\fscx100\\fscy100)"
            f"}}{wt}"
        )
        if after:
            line_parts.append(
                f"{{\\c&H{dim_bgr}&\\b0\\fscx100\\fscy100}}{after}"
            )

        line_text = "".join(line_parts)

        if i == 0:
            line_text = "{\\fad(150,0)}" + line_text
        if i == len(words) - 1:
            line_text = "{\\fad(0,300)}" + line_text

        start_t = w["start"]
        end_t = words[i + 1]["start"] if i < len(words) - 1 else w["end"] + 0.3

        events.append(
            f"Dialogue: 0,{format_ass_time(start_t)},"
            f"{format_ass_time(end_t)},Default,,0,0,0,,{line_text}"
        )

    return events


# ═══════════════════════════════════════════════════════════════
#  ★ 端到端: Whisper JSON → 烧录到视频  (新增)
# ═══════════════════════════════════════════════════════════════

def burn_whisper_subtitle(
    input_video: str,
    output_video: str,
    json_path: str,
    effect: str = "karaoke",
    font_file: Optional[str] = None,
    font_size: int = 52,
    highlight_color: str = "&H0000DDFF",
    filter_transition: bool = True,
    max_chars_per_line: int = 18,
) -> str:
    """
    完整流水线: 读取 Whisper JSON → 生成 ASS → 烧录到视频

    参数:
      input_video     : 输入视频
      output_video    : 输出视频
      json_path       : Whisper JSON 文件
      effect          : 特效类型 (karaoke/highlight/typewriter/bounce)
      font_file       : 字体文件路径 (.ttf/.ttc)
      font_size       : 字号
      highlight_color : 高亮颜色 (ASS格式 &HAABBGGRR)
      filter_transition: 是否过滤"转场"标记
      max_chars_per_line: 每行最大字符数
    """
    # ── 确定字体 ──
    if font_file is None:
        font_file = find_chinese_font()
        if font_file:
            print(f"     🔤 自动使用中文字体: {os.path.basename(font_file)}")
        else:
            print("     ⚠️  未找到中文字体, 中文可能显示为方块")
            print("        请用 --font 指定 .ttf/.ttc 字体文件")

    font_name = "Sans"
    font_dir = None
    if font_file:
        font_name = os.path.splitext(os.path.basename(font_file))[0]
        font_dir = os.path.dirname(os.path.abspath(font_file))

    # ── 获取视频分辨率 ──
    info = get_video_info(input_video)
    res_x = info["width"]
    res_y = info["height"]

    # ── 读取 + 预处理 JSON ──
    data = load_whisper_json(json_path)
    segments = preprocess_segments(
        data,
        filter_transition=filter_transition,
        max_chars_per_line=max_chars_per_line,
    )

    if not segments:
        print("     ⚠️  JSON 中没有可用的字幕段落")
        shutil.copy2(input_video, output_video)
        return output_video

    print(f"     📊 解析到 {len(segments)} 段字幕, "
          f"时间范围 {segments[0]['start']:.1f}s ~ {segments[-1]['end']:.1f}s")

    # ── 生成 ASS ──
    tmp_ass = tempfile.NamedTemporaryFile(
        suffix=".ass", delete=False, mode="w", encoding="utf-8"
    )
    tmp_ass.close()

    try:
        # 根据颜色名查找预设
        hl_color = COLOR_PRESETS.get(highlight_color, highlight_color)

        generate_word_ass(
            segments=segments,
            output_path=tmp_ass.name,
            effect=effect,
            font_name=font_name,
            font_size=font_size,
            res_x=res_x,
            res_y=res_y,
            highlight_color=hl_color,
        )

        # ── 烧录 ASS 到视频 ──
        esc_ass = _esc_filter_path(tmp_ass.name)
        vf = f"ass='{esc_ass}'"
        if font_dir:
            esc_dir = _esc_filter_path(font_dir)
            vf = f"ass='{esc_ass}':fontsdir='{esc_dir}'"

        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
            "-i", input_video,
            "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "copy",
            "-movflags", "+faststart",
            output_video,
        ]
        subprocess.run(cmd, check=True)

    finally:
        # 保留 ASS 文件副本供调试
        debug_ass = output_video.rsplit(".", 1)[0] + ".ass"
        try:
            shutil.copy2(tmp_ass.name, debug_ass)
            print(f"     💾 ASS 副本已保存: {debug_ass}")
        except Exception:
            pass
        os.unlink(tmp_ass.name)

    return output_video


# ═══════════════════════════════════════════════════════════════
#  视频标准化
# ═══════════════════════════════════════════════════════════════

def normalize_clip(input_path: str, output_path: str,
                   width: int, height: int, fps: float):
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


# ═══════════════════════════════════════════════════════════════
#  合并方式 A: 无转场 concat demuxer
# ═══════════════════════════════════════════════════════════════

def concat_simple(clip_paths: List[str], output_path: str):
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
            "-c", "copy", "-movflags", "+faststart",
            output_path,
        ]
        subprocess.run(cmd, check=True)
    finally:
        os.unlink(list_file.name)


# ═══════════════════════════════════════════════════════════════
#  合并方式 B: xfade + acrossfade 转场
# ═══════════════════════════════════════════════════════════════

def merge_with_xfade(clip_paths: List[str], output_path: str,
                     transitions: List[str], td: float = 0.5):
    n = len(clip_paths)
    if n == 1:
        shutil.copy2(clip_paths[0], output_path)
        return

    durations = [get_duration(p) for p in clip_paths]
    min_dur = min(durations)
    safe_td = min(td, min_dur / 2 - 0.05)
    if safe_td < 0.05:
        print("  ⚠️  片段过短，已退回无转场拼接")
        concat_simple(clip_paths, output_path)
        return
    if safe_td < td:
        print(f"  ⚠️  转场时长已自动缩短: {td}s → {safe_td:.2f}s")
        td = safe_td

    vf_parts: List[str] = []
    af_parts: List[str] = []
    accumulated = durations[0]
    prev_v, prev_a = "0:v", "0:a"

    for i in range(1, n):
        offset = max(0, accumulated - td)
        t_name = transitions[i - 1]
        out_v = "vout" if i == n - 1 else f"v{i}"
        vf_parts.append(
            f"[{prev_v}][{i}:v]xfade=transition={t_name}"
            f":duration={td:.4f}:offset={offset:.4f}[{out_v}]"
        )
        out_a = "aout" if i == n - 1 else f"a{i}"
        af_parts.append(
            f"[{prev_a}][{i}:a]acrossfade=d={td:.4f}"
            f":c1=tri:c2=tri[{out_a}]"
        )
        accumulated += durations[i] - td
        prev_v, prev_a = out_v, out_a

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
#  传统字幕烧录 (SRT/ASS 文件)
# ═══════════════════════════════════════════════════════════════

def burn_subtitle(input_path: str, output_path: str,
                  subtitle_file: str,
                  font_file: Optional[str] = None,
                  font_size: int = 24,
                  font_color: str = "&Hffffff&",
                  outline: int = 2,
                  margin_v: int = 30):
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


# ═══════════════════════════════════════════════════════════════
#  背景音乐
# ═══════════════════════════════════════════════════════════════

def mix_bgm(input_path: str, output_path: str,
            bgm_path: str, bgm_volume: float = 0.3,
            original_volume: float = 1.0, fade_out: float = 3.0):
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


# ═══════════════════════════════════════════════════════════════
#  主处理流程  (★ 已修改: 增加 whisper_json 支持)
# ═══════════════════════════════════════════════════════════════

def process(input_files: List[str], *,
            output: Optional[str] = None,
            transition: str = "fade",
            transition_duration: float = 0.5,
            # ── 传统字幕 ──
            subtitle: Optional[str] = None,
            sub_font_size: int = 24,
            # ── ★ Whisper JSON 逐字字幕 ──
            whisper_json: Optional[str] = None,
            sub_effect: str = "karaoke",
            sub_highlight_color: str = "gold",
            sub_word_size: int = 52,
            filter_transition: bool = True,
            max_chars_line: int = 18,
            # ── 文字叠加 ──
            text: Optional[str] = None,
            font: Optional[str] = None,
            font_size: int = 36,
            font_color: str = "white",
            text_position: str = "bottom",
            show_from: Optional[float] = None,
            show_to: Optional[float] = None,
            # ── 视频格式 ──
            target_width: Optional[int] = None,
            target_height: Optional[int] = None,
            target_fps: Optional[float] = None,
            # ── 背景音乐 ──
            bgm: Optional[str] = None,
            bgm_volume: float = 0.3):
    """端到端处理: 标准化 → 合并 → 逐字字幕 → 文字 → BGM"""

    check_ffmpeg()

    # ── 校验输入 ──
    for f in input_files:
        if not os.path.isfile(f):
            print(f"❌ 文件不存在: {f}"); sys.exit(1)
    if subtitle and not os.path.isfile(subtitle):
        print(f"❌ 字幕文件不存在: {subtitle}"); sys.exit(1)
    if whisper_json and not os.path.isfile(whisper_json):
        print(f"❌ JSON 文件不存在: {whisper_json}"); sys.exit(1)
    if font and not os.path.isfile(font):
        print(f"❌ 字体文件不存在: {font}"); sys.exit(1)
    if bgm and not os.path.isfile(bgm):
        print(f"❌ 背景音乐不存在: {bgm}"); sys.exit(1)

    if output is None:
        base = os.path.splitext(input_files[0])[0]
        output = f"{base}_merged.mp4"

    tmp_dir = tempfile.mkdtemp(prefix="merge_vids_")

    try:
        # ══════════════════════════════════
        #  STEP 0: 收集信息
        # ══════════════════════════════════
        print(f"\n{'='*62}")
        print(f"  🎬  视频合并 + 逐字字幕工具  v2")
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

        tw = target_width  or max(i["width"]  for i in infos)
        th = target_height or max(i["height"] for i in infos)
        tfps = target_fps  or max(i["fps"]    for i in infos)
        tw = tw if tw % 2 == 0 else tw + 1
        th = th if th % 2 == 0 else th + 1
        print(f"\n  🎯  目标格式: {tw}×{th} @ {tfps}fps")

        if whisper_json:
            print(f"  📝  逐字字幕: {os.path.basename(whisper_json)}")
            print(f"  ✨  字幕特效: {sub_effect} — "
                  f"{SUBTITLE_EFFECTS.get(sub_effect, '')}")

        # ══════════════════════════════════
        #  STEP 1: 标准化
        # ══════════════════════════════════
        print(f"\n  ⚙️   标准化片段 ...")
        norm_clips: List[str] = []
        for i, fp in enumerate(input_files):
            norm_path = os.path.join(tmp_dir, f"norm_{i:04d}.mp4")
            print(f"     [{i+1}/{len(input_files)}] {os.path.basename(fp)}")
            normalize_clip(fp, norm_path, tw, th, tfps)
            norm_clips.append(norm_path)
        print(f"  ✅  标准化完成")

        # ══════════════════════════════════
        #  STEP 2: 合并
        # ══════════════════════════════════
        need_post = bool(subtitle or whisper_json or text or bgm)
        merged_path = os.path.join(tmp_dir, "merged.mp4") if need_post else output

        if transition == "none" or len(norm_clips) == 1:
            print(f"\n  🔗  拼接 {len(norm_clips)} 个片段 (无转场) ...")
            if len(norm_clips) == 1:
                shutil.copy2(norm_clips[0], merged_path)
            else:
                concat_simple(norm_clips, merged_path)
        else:
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
            print(f"     转场效果: {t_desc}  |  时长: {transition_duration}s")
            merge_with_xfade(norm_clips, merged_path,
                             transitions=trans_list, td=transition_duration)

        print(f"  ✅  合并完成")
        current = merged_path

        # ══════════════════════════════════
        #  STEP 3: ★ 逐字字幕 (Whisper JSON)
        # ══════════════════════════════════
        if whisper_json:
            print(f"\n  📝  烧录逐字字幕 (特效: {sub_effect}) ...")
            sub_out = os.path.join(tmp_dir, "whisper_sub.mp4") \
                if (subtitle or text or bgm) else output

            burn_whisper_subtitle(
                input_video=current,
                output_video=sub_out,
                json_path=whisper_json,
                effect=sub_effect,
                font_file=font,
                font_size=sub_word_size,
                highlight_color=sub_highlight_color,
                filter_transition=filter_transition,
                max_chars_per_line=max_chars_line,
            )
            current = sub_out
            print(f"  ✅  逐字字幕烧录完成")

        # ══════════════════════════════════
        #  STEP 4: 传统字幕 (SRT/ASS)
        # ══════════════════════════════════
        if subtitle:
            print(f"\n  📝  烧录字幕: {os.path.basename(subtitle)}")
            sub_out = os.path.join(tmp_dir, "subtitled.mp4") \
                if (text or bgm) else output
            burn_subtitle(current, sub_out, subtitle_file=subtitle,
                          font_file=font, font_size=sub_font_size)
            current = sub_out
            print(f"  ✅  字幕烧录完成")

        # ══════════════════════════════════
        #  STEP 5: 文字叠加
        # ══════════════════════════════════
        if text:
            print(f"\n  🏷️   添加文字: {text}")
            text_out = os.path.join(tmp_dir, "texted.mp4") if bgm else output
            overlay_text(current, text_out, text=text,
                         font_file=font, font_size=font_size,
                         font_color=font_color, position=text_position,
                         show_from=show_from, show_to=show_to)
            current = text_out
            print(f"  ✅  文字叠加完成")

        # ══════════════════════════════════
        #  STEP 6: 背景音乐
        # ══════════════════════════════════
        if bgm:
            print(f"\n  🎵  混合背景音乐: {os.path.basename(bgm)}")
            mix_bgm(current, output, bgm_path=bgm, bgm_volume=bgm_volume)
            current = output
            print(f"  ✅  背景音乐混合完成")

        # ── 确保输出到位 ──
        if current != output:
            shutil.copy2(current, output)

        # ══════════════════════════════════
        #  完成摘要
        # ══════════════════════════════════
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
        if whisper_json: extras.append(f"逐字字幕({sub_effect})")
        if subtitle:     extras.append("字幕")
        if text:         extras.append("文字")
        if bgm:          extras.append("BGM")
        if extras:
            print(f"  附加:  {' + '.join(extras)}")
        print(f"{'='*62}\n")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# ═══════════════════════════════════════════════════════════════
#  列表显示
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
    print(f"     random           随机选择")
    print(f"     none             无转场")
    print(f"     fade,dissolve    逗号分隔 = 逐个指定")
    print(f"{'='*58}\n")


def list_effects():
    print(f"\n{'='*58}")
    print(f"  可用字幕特效 (共 {len(SUBTITLE_EFFECTS)} 种)")
    print(f"{'='*58}\n")
    for name, desc in SUBTITLE_EFFECTS.items():
        print(f"  ✨ {name:<14s}  {desc}")
    print(f"\n  🎨 可用高亮颜色:")
    print(f"  {'─'*52}")
    for name, code in COLOR_PRESETS.items():
        print(f"     {name:<10s}  {code}")
    print(f"\n  💡 也可直接输入 ASS 颜色代码, 如 &H0000DDFF")
    print(f"{'='*58}\n")


# ═══════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="视频合并 + 转场 + 逐字字幕特效工具 v2",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
示例:

  # ★ 单视频 + Whisper JSON 逐字字幕 (卡拉OK效果)
  python merge_videos.py video.mp4 \\
         --whisper-json transcript.json

  # ★ 逐字高亮效果 + 自定义字体
  python merge_videos.py video.mp4 \\
         --whisper-json transcript.json \\
         --sub-effect highlight \\
         --font SimHei.ttf

  # ★ 打字机效果 + 青色高亮
  python merge_videos.py video.mp4 \\
         --whisper-json transcript.json \\
         --sub-effect typewriter \\
         --sub-color cyan

  # ★ 弹跳效果 + 大字号
  python merge_videos.py video.mp4 \\
         --whisper-json transcript.json \\
         --sub-effect bounce \\
         --sub-word-size 60

  # 合并多段 + 转场 + 逐字字幕
  python merge_videos.py clip1.mp4 clip2.mp4 clip3.mp4 \\
         -t dissolve --td 0.8 \\
         --whisper-json transcript.json \\
         --sub-effect karaoke

  # 完整示例: 合并+转场+逐字字幕+文字水印+BGM
  python merge_videos.py part*.mp4 -t fadeblack --td 1.0 \\
         --whisper-json transcript.json \\
         --sub-effect highlight --sub-color gold \\
         --text "精彩回顾" --font SimHei.ttf \\
         --bgm bg.mp3 -o final.mp4

  # 查看所有字幕特效
  python merge_videos.py --list-effects

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
                    help="转场特效 / random / none (默认: fade)")
    tg.add_argument("--td", type=float, default=0.5,
                    dest="transition_duration", help="转场时长/秒 (默认: 0.5)")
    tg.add_argument("--list-transitions", action="store_true",
                    help="列出所有可用转场特效")

    # ── ★ Whisper JSON 逐字字幕 ──
    wg = parser.add_argument_group("🎤  逐字字幕 (Whisper JSON)")
    wg.add_argument("--whisper-json", default=None,
                    help="Whisper JSON 转录文件 (含 word 时间戳)")
    wg.add_argument("--sub-effect", default="karaoke",
                    choices=list(SUBTITLE_EFFECTS.keys()),
                    help="字幕特效 (默认: karaoke)")
    wg.add_argument("--sub-color", default="gold",
                    help="高亮颜色: gold/yellow/cyan/red/pink/orange "
                         "或 ASS 颜色码 (默认: gold)")
    wg.add_argument("--sub-word-size", type=int, default=52,
                    help="逐字字幕字号 (默认: 52)")
    wg.add_argument("--no-filter-transition", action="store_true",
                    help="不过滤文本中的\"转场\"标记")
    wg.add_argument("--max-chars-line", type=int, default=18,
                    help="每行最大字符数 (默认: 18)")
    wg.add_argument("--list-effects", action="store_true",
                    help="列出所有可用字幕特效")

    # ── 传统字幕 ──
    sg = parser.add_argument_group("📝  传统字幕 (SRT/ASS)")
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
                    help="文字出现时间/秒")
    xg.add_argument("--show-to", type=float, default=None,
                    help="文字消失时间/秒")

    # ── 字体 ──
    fg = parser.add_argument_group("🔤  字体设置")
    fg.add_argument("--font", default=None,
                    help="字体文件路径 (.ttf/.ttc)")
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
    if args.list_effects:
        list_effects()
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
        # 传统字幕
        subtitle=args.subtitle,
        sub_font_size=args.sub_font_size,
        # ★ Whisper JSON 逐字字幕
        whisper_json=args.whisper_json,
        sub_effect=args.sub_effect,
        sub_highlight_color=args.sub_color,
        sub_word_size=args.sub_word_size,
        filter_transition=not args.no_filter_transition,
        max_chars_line=args.max_chars_line,
        # 文字叠加
        text=args.text,
        font=args.font,
        font_size=args.font_size,
        font_color=args.font_color,
        text_position=args.text_pos,
        show_from=args.show_from,
        show_to=args.show_to,
        # 视频格式
        target_width=args.width,
        target_height=args.height,
        target_fps=args.fps,
        # 背景音乐
        bgm=args.bgm,
        bgm_volume=args.bgm_volume,
    )