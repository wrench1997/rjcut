#!/usr/bin/env python3
"""
字幕特效生成模块
"""

import os
import tempfile
from typing import List, Dict, Optional

# ASS 颜色 (格式: &HAABBGGRR)
COLOR_PRESETS = {
    "gold":       "&H0000DDFF",  # 金黄
    "yellow":     "&H0000FFFF",  # 纯黄
    "ad-yellow":  "&H0000F7FF",  # 更柔和更亮的广告黄
    "cyan":       "&H00FFFF00",
    "red":        "&H000000FF",
    "green":      "&H0000FF00",
    "pink":       "&H009F00FF",
    "orange":     "&H000099FF",
    "white":      "&H00FFFFFF",
}

SUBTITLE_EFFECTS = {
    "karaoke":    "卡拉OK填充 — 逐字从白变金，填充动画",
    "highlight":  "逐字高亮 — 当前字放大变色，其余变暗",
    "typewriter": "打字机 — 字逐个出现，逐步构建句子",
    "bounce":     "弹跳出现 — 当前字弹跳放大后回弹",
    "ad":         "带货广告风 — 全句常驻 + 当前字高亮 + 重点词强调",
}
def _hex_to_ass_color(hex_color: str) -> str:
    """
    将前端 hex 颜色 (#RRGGBB 或 #RRGGBBAA) 转换为 ASS 颜色格式 (&HAABBGGRR)
    """
    if not hex_color:
        return "&H00000000"
    
    hex_color = hex_color.lstrip('#')
    
    if len(hex_color) == 6:
        r = hex_color[0:2]
        g = hex_color[2:4]
        b = hex_color[4:6]
        a = "00"
    elif len(hex_color) == 8:
        r = hex_color[0:2]
        g = hex_color[2:4]
        b = hex_color[4:6]
        a = hex_color[6:8]
    else:
        return "&H00000000"
    
    return f"&H{a}{b}{g}{r}"


def _rgba_to_ass_color(rgba_color: str) -> str:
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
            return _hex_to_ass_color(rgba_color)
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


def generate_word_ass(
    segments: List[dict],
    output_path: str,
    effect: str = "karaoke",
    font_name: str = "SimHei",
    font_size: int = 52,
    res_x: int = 1080,   # 竖屏默认宽度
    res_y: int = 1920,   # 竖屏默认高度
    margin_v: int = 50,
    margin_l: int = 10,
    margin_r: int = 10,
    x_offset: int = 0,  # 水平偏移像素（前端 x_offset 转换）
    y_offset: int = 0,  # 垂直位置已通过 margin_v 精确计算，此处设为 0
    alignment: int = 2,
    highlight_color: str = "&H0000DDFF",
    base_color: str = "&H00FFFFFF",
    outline_color: str = "&H00000000",
    back_color: str = "&H80000000",
    outline: int = 3,
    shadow: int = 2,
    ad_keywords: Optional[List[str]] = None,
    max_chars_per_line: int = 12,
    # === 新增：智能粗体控制 ===
    bold: bool = True,
    auto_disable_bold_for_light_fonts: bool = True,
    # === 新增：精确坐标控制 ===
    position_x: Optional[int] = None,  # 精确 X 坐标（像素），优先级高于 alignment
    position_y: Optional[int] = None,  # 精确 Y 坐标（像素），优先级高于 margin_v
    use_relative_pos: bool = False,    # 是否使用相对坐标 (0-1 之间的小数)
    # === 新增：与前端统一参数 ===
    stroke_color: Optional[str] = None,  # 描边颜色（ASS 格式），优先级高于 outline_color
    stroke_width: Optional[int] = None,  # 描边宽度，优先级高于 outline
    background_color: Optional[str] = None,  # 背景颜色（ASS 格式），优先级高于 back_color
    background_padding: Optional[int] = None,  # 背景内边距（通过 margin 实现）
    background_radius: Optional[int] = None,  # 背景圆角（ASS 不支持，仅用于前端预览）
) -> str:
    """
    根据逐字时间戳生成 ASS 字幕文件。
    返回: 生成的 ASS 文件路径
    """
    from video_utils import format_ass_time  # noqa

    ad_keywords = ad_keywords or []

    # ── 智能粗体：如果 font_name 看起来是 Light/ExtraLight，就不要强制粗体 ──
    if auto_disable_bold_for_light_fonts:
        fn = (font_name or "").lower()
        if ("light" in fn) or ("extralight" in fn):
            bold = False

    bold_flag = -1 if bold else 0  # ASS: -1 开启粗体, 0 关闭
# ── 应用前端统一参数（优先级更高）──
    # stroke_color: 前端 stroke_color (如 "#000000") -> ASS 格式 (&HAABBGGRR)
    if stroke_color:
        outline_color = _hex_to_ass_color(stroke_color)
    # stroke_width: 前端描边宽度
    if stroke_width is not None:
        outline = stroke_width
    # background_color: 前端 background_color (如 "rgba(0,0,0,0.4)") -> ASS 格式
    if background_color:
        back_color = _rgba_to_ass_color(background_color)
    # background_padding: 通过调整 margin 实现背景内边距效果
    if background_padding is not None:
        # 背景内边距会影响字幕的视觉边距，这里简单叠加
        margin_l = margin_l + background_padding
        margin_r = margin_r + background_padding
        margin_v = margin_v + background_padding

    # 🎨 y_offset 处理说明
    # 注意：margin_v 已经由上层（service_runner.py 或 compose_from_draft.py）根据前端 y_offset 百分比精确计算
    # 此处的 y_offset 参数仅用于额外的微调（默认应为 0）
    # 如果 y_offset 不为 0，则在此基础上叠加偏移
    if y_offset != 0:
        if alignment in [7, 8, 9]:  # 顶部对齐 (alignment=8)
            # y_offset 正数向上 = 远离顶部 = margin_v 增加
            margin_v = max(0, margin_v + y_offset)
        elif alignment in [1, 2, 3]:  # 底部对齐 (alignment=2)
            # y_offset 正数向上 = 远离底部 = margin_v 增加
            margin_v = max(0, margin_v + y_offset)

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

    # 计算最终坐标
    if use_relative_pos:
        # 相对坐标模式 (0-1)
        final_x = int(position_x * res_x) if position_x is not None else None
        final_y = int(position_y * res_y) if position_y is not None else None
    else:
        # 绝对像素坐标模式
        final_x = position_x
        final_y = position_y
    
    # 🎨 前端字体大小缩放补偿
    # 前端预览使用 scale = 300/1080 ≈ 0.278 或 640/1920 ≈ 0.333
    # 但 ASS 是相对于视频分辨率的，所以 font_size=72 在 1080p 下就是 72px
    # 问题：前端 CSS 有 letterSpacing: '0.08em' 和 lineHeight，ASS 需要补偿
    # 经验值：ASS 字体需要放大 1.1~1.15 倍才能匹配前端视觉效果
    adjusted_font_size = int(font_size * 1.12)  # 🎨 字体大小补偿系数
    
    # 根据特效类型定义样式
    if effect == "karaoke":
        header += (
            f"Style: Default,{font_name},{adjusted_font_size},"
            f"{highlight_color},{base_color},{outline_color},{back_color},"
            f"{bold_flag},0,0,0,100,100,1,0,1,{outline},{shadow},{alignment},"
            f"{margin_l},{margin_r},{margin_v},1\n"
        )
    elif effect in ("highlight", "bounce", "typewriter"):
        header += (
            f"Style: Default,{font_name},{adjusted_font_size},"
            f"{base_color},{base_color},{outline_color},{back_color},"
            f"{bold_flag},0,0,0,100,100,0,0,1,{max(outline, 4)},{max(shadow, 1)},{alignment},"
            f"{margin_l},{margin_r},{margin_v},1\n"
        )
    elif effect == "ad":
        header += (
            f"Style: Default,{font_name},{adjusted_font_size},"
            f"{base_color},{base_color},&H00000000,&H64000000,"
            f"{bold_flag},0,0,0,100,100,0,0,1,{max(outline, 5)},{max(shadow, 2)},{alignment},"
            f"{margin_l},{margin_r},{margin_v},1\n"
        )
    else:
        # fallback
        header += (
            f"Style: Default,{font_name},{adjusted_font_size},"
            f"{base_color},{base_color},{outline_color},{back_color},"
            f"{bold_flag},0,0,0,100,100,0,0,1,{outline},{shadow},{alignment},"
            f"{margin_l},{margin_r},{margin_v},1\n"
        )

    header += """
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    events: List[str] = []

    for seg in segments:
        words = seg["words"]
        if not words:
            continue

        if effect == "karaoke":
            events.extend(_eff_karaoke(seg, highlight_color, final_x, final_y, res_x, res_y, margin_v))
        elif effect == "highlight":
            events.extend(_eff_highlight(seg, highlight_color, final_x, final_y, res_x, res_y, margin_v))
        elif effect == "typewriter":
            events.extend(_eff_typewriter(seg, highlight_color, final_x, final_y, res_x, res_y, margin_v))
        elif effect == "bounce":
            events.extend(_eff_bounce(seg, highlight_color, final_x, final_y, res_x, res_y, margin_v))
        elif effect == "ad":
            # 🎨 关键：传递 margin_v 到 _eff_ad，否则 Dialogue 行会硬编码为 0
            events.extend(_eff_ad(seg, highlight_color, ad_keywords, max_chars_per_line, final_x, final_y, res_x, res_y, margin_v))
        else:
            events.extend(_eff_karaoke(seg, highlight_color, final_x, final_y, res_x, res_y))

    with open(output_path, "w", encoding="utf-8-sig") as f:
        f.write(header)
        for ev in events:
            f.write(ev + "\n")

    print(f"     📄 ASS 字幕已生成: {output_path}")
    print(f"        共 {len(events)} 条字幕事件, {len(segments)} 段")
    return output_path


def _eff_karaoke(seg: dict, hl_color: str, 
                 pos_x: Optional[int] = None, pos_y: Optional[int] = None,
                 res_x: int = 1920, res_y: int = 1080,
                 margin_v: int = 50) -> List[str]:
    from video_utils import format_ass_time
    words = seg["words"]
    seg_start = seg["start"]
    seg_end = seg["end"]

    parts = []
    prev_end = seg_start

    for w in words:
        dur = w["end"] - prev_end
        dur_cs = max(1, round(dur * 100))
        parts.append(f"{{\\kf{dur_cs}}}{w['text']}")
        prev_end = w["end"]

    text = "{\\fad(150,300)}" + "".join(parts)
    
    # 添加精确坐标
    if pos_x is not None and pos_y is not None:
        text = "{\\pos(" + str(pos_x) + "," + str(pos_y) + ")}" + text

    return [
        f"Dialogue: 0,{format_ass_time(seg_start)},"
        f"{format_ass_time(seg_end + 0.3)},Default,,0,0,{margin_v},,{text}"
    ]


def _eff_highlight(seg: dict, hl_color: str,
                   pos_x: Optional[int] = None, pos_y: Optional[int] = None,
                   res_x: int = 1920, res_y: int = 1080,
                   margin_v: int = 50) -> List[str]:
    from video_utils import format_ass_time
    words = seg["words"]
    full_text = seg["text"]
    events = []

    hl_bgr = hl_color[4:]
    dim_bgr = "999999"

    positions = []
    pos = 0
    for w in words:
        positions.append(pos)
        pos += len(w["text"])

    # 构建坐标前缀
    pos_prefix = ""
    if pos_x is not None and pos_y is not None:
        pos_prefix = "{\\pos(" + str(pos_x) + "," + str(pos_y) + ")}"

    for i, w in enumerate(words):
        p = positions[i]
        wt = w["text"]
        before = full_text[:p]
        after = full_text[p + len(wt):]

        line_parts = []
        if before:
            line_parts.append(f"{{\\c&H{dim_bgr}&\\b0}}{before}")
        line_parts.append(
            f"{{\\c&H{hl_bgr}&\\b1\\fscx115\\fscy115}}{wt}"
        )
        if after:
            line_parts.append(
                f"{{\\c&H{dim_bgr}&\\b0\\fscx100\\fscy100}}{after}"
            )

        line_text = "".join(line_parts)

        if i == 0:
            line_text = "{\\fad(200,0)}" + pos_prefix + line_text
        if i == len(words) - 1:
            line_text = "{\\fad(0,300)}" + line_text

        start_t = w["start"]
        end_t = words[i + 1]["start"] if i < len(words) - 1 else w["end"] + 0.3

        events.append(
            f"Dialogue: 0,{format_ass_time(start_t)},"
            f"{format_ass_time(end_t)},Default,,0,0,{margin_v},,{line_text}"
        )

    return events


def _eff_typewriter(seg: dict, hl_color: str,
                    pos_x: Optional[int] = None, pos_y: Optional[int] = None,
                    res_x: int = 1920, res_y: int = 1080,
                    margin_v: int = 50) -> List[str]:
    from video_utils import format_ass_time
    words = seg["words"]
    seg_end = seg["end"]
    events = []
    hl_bgr = hl_color[4:]

    # 构建坐标前缀
    pos_prefix = ""
    if pos_x is not None and pos_y is not None:
        pos_prefix = "{\\pos(" + str(pos_x) + "," + str(pos_y) + ")}"

    for i, w in enumerate(words):
        prev_text = "".join(ww["text"] for ww in words[:i])
        cur_text = w["text"]

        display_parts = []
        if prev_text:
            display_parts.append(f"{{\\c&HFFFFFF&}}{prev_text}")
        display_parts.append(
            f"{{\\c&H{hl_bgr}&\\b1}}{cur_text}"
        )

        display = "".join(display_parts)

        if i == 0:
            display = "{\\fad(150,0)}" + pos_prefix + display

        start_t = w["start"]
        end_t = words[i + 1]["start"] if i < len(words) - 1 else seg_end + 0.5

        if i == len(words) - 1:
            full = f"{{\\fad(0,400)}}{{\\c&HFFFFFF&}}{seg['text']}"
            events.append(
                f"Dialogue: 0,{format_ass_time(start_t)},"
                f"{format_ass_time(w['end'])},Default,,0,0,{margin_v},,{display}"
            )
            events.append(
                f"Dialogue: 0,{format_ass_time(w['end'])},"
                f"{format_ass_time(seg_end + 0.5)},Default,,0,0,{margin_v},,{full}"
            )
            continue

        events.append(
            f"Dialogue: 0,{format_ass_time(start_t)},"
            f"{format_ass_time(end_t)},Default,,0,0,{margin_v},,{display}"
        )

    return events


def _eff_bounce(seg: dict, hl_color: str,
                pos_x: Optional[int] = None, pos_y: Optional[int] = None,
                res_x: int = 1920, res_y: int = 1080,
                margin_v: int = 50) -> List[str]:
    from video_utils import format_ass_time
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

    # 构建坐标前缀
    pos_prefix = ""
    if pos_x is not None and pos_y is not None:
        pos_prefix = "{\\pos(" + str(pos_x) + "," + str(pos_y) + ")}"

    for i, w in enumerate(words):
        p = positions[i]
        wt = w["text"]
        before = full_text[:p]
        after = full_text[p + len(wt):]

        line_parts = []
        if before:
            line_parts.append(f"{{\\c&H{dim_bgr}&}}{before}")

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
            line_text = "{\\fad(150,0)}" + pos_prefix + line_text
        if i == len(words) - 1:
            line_text = "{\\fad(0,300)}" + line_text

        start_t = w["start"]
        end_t = words[i + 1]["start"] if i < len(words) - 1 else w["end"] + 0.3

        events.append(
            f"Dialogue: 0,{format_ass_time(start_t)},"
            f"{format_ass_time(end_t)},Default,,0,0,{margin_v},,{line_text}"
        )

    return events


def _ass_escape_text(text: str) -> str:
    return text.replace("{", r"\{").replace("}", r"\}")


def _split_words_for_display(words: List[dict], max_chars: int = 12) -> List[List[dict]]:
    if not words:
        return []

    major_breaks = set("。！？；!?;")
    minor_breaks = set("，、：,.，:")
    all_breaks = major_breaks | minor_breaks

    lines: List[List[dict]] = []
    cur_line: List[dict] = []
    cur_len = 0

    for w in words:
        txt = w.get("text", "")
        wlen = len(txt)

        if cur_line and cur_len + wlen > max_chars:
            lines.append(cur_line)
            cur_line = []
            cur_len = 0

        cur_line.append(w)
        cur_len += wlen

        if txt and txt[-1] in major_breaks:
            lines.append(cur_line)
            cur_line = []
            cur_len = 0
        elif txt and txt[-1] in minor_breaks and cur_len >= max_chars - 2:
            lines.append(cur_line)
            cur_line = []
            cur_len = 0

    if cur_line:
        lines.append(cur_line)

    return lines


def _apply_keyword_emphasis(
    text: str,
    keywords: List[str],
    keyword_color: str = "FFB300",
    keyword_scale: int = 106,
) -> str:
    if not text:
        return text

    sorted_keywords = sorted(set(keywords), key=len, reverse=True)

    result = text
    for kw in sorted_keywords:
        if not kw:
            continue
        styled = (
            f"{{\\c&H{keyword_color}&\\b1\\fscx{keyword_scale}\\fscy{keyword_scale}}}"
            f"{_ass_escape_text(kw)}"
            f"{{\\c&HFFFFFF&\\b1\\fscx100\\fscy100}}"
        )
        result = result.replace(kw, styled)

    return result


def _slice_display_text(display_text: str, start: int, length: int):
    before = display_text[:start]
    current = display_text[start:start + length]
    after = display_text[start + length:]
    return before, current, after


def _build_display_text_and_map(words: List[dict], max_chars: int = 12):
    lines = _split_words_for_display(words, max_chars=max_chars)

    display_parts = []
    word_positions = []
    pos = 0

    for li, line in enumerate(lines):
        for w in line:
            word_positions.append(pos)
            txt = w.get("text", "")
            display_parts.append(txt)
            pos += len(txt)

        if li < len(lines) - 1:
            display_parts.append(r"\N")
            pos += 2

    display_text = "".join(display_parts)
    return display_text, word_positions


def _eff_ad(
    seg: dict,
    hl_color: str,
    ad_keywords: Optional[List[str]] = None,
    max_chars_per_line: int = 12,
    pos_x: Optional[int] = None, pos_y: Optional[int] = None,
    res_x: int = 1920, res_y: int = 1080,
    margin_v: int = 50,  # 🎨 关键：传递 margin_v 到 Dialogue 行，否则会被覆盖为 0
) -> List[str]:
    from video_utils import format_ass_time

    ad_keywords = ad_keywords or []
    words = seg["words"]
    events = []

    if not words:
        return events

    hl_bgr = hl_color[4:] if hl_color.startswith("&H") else "00DDFF"
    dim_bgr = "B0B0B0"
    keyword_bgr = "00BFFF"

    display_text, positions = _build_display_text_and_map(
        words, max_chars=max_chars_per_line
    )

    if not display_text:
        return events

    # 构建坐标前缀
    pos_prefix = ""
    if pos_x is not None and pos_y is not None:
        pos_prefix = "{\\pos(" + str(pos_x) + "," + str(pos_y) + ")}"

    for i, w in enumerate(words):
        p = positions[i]
        before, current, after = _slice_display_text(display_text, p, len(w["text"]))

        line_parts = []

        if before:
            before_styled = _apply_keyword_emphasis(
                before,
                ad_keywords,
                keyword_color=keyword_bgr,
                keyword_scale=102,
            )
            line_parts.append(
                f"{{\\c&H{dim_bgr}&\\b1\\fscx100\\fscy100}}{before_styled}"
            )

        current_styled = _apply_keyword_emphasis(
            current,
            ad_keywords,
            keyword_color=keyword_bgr,
            keyword_scale=104,
        )
        line_parts.append(
            f"{{\\c&H{hl_bgr}&\\b1\\fscx122\\fscy122"
            f"\\t(0,100,\\fscx108\\fscy108)}}{current_styled}"
        )

        if after:
            after_styled = _apply_keyword_emphasis(
                after,
                ad_keywords,
                keyword_color=keyword_bgr,
                keyword_scale=112,
            )
            line_parts.append(
                f"{{\\c&H{dim_bgr}&\\b1\\fscx100\\fscy100}}{after_styled}"
            )

        line_text = "".join(line_parts)

        if i == 0:
            line_text = "{\\fad(80,0)}" + pos_prefix + line_text
        if i == len(words) - 1:
            line_text = "{\\fad(0,120)}" + line_text

        start_t = w["start"]
        if i < len(words) - 1:
            end_t = max(w["end"], words[i + 1]["start"] - 0.02)
        else:
            end_t = w["end"] + 0.10

        end_t = max(end_t, start_t + 0.05)

        # 🎨 关键：使用传入的 margin_v，而不是硬编码 0
        # ASS Dialogue 格式：Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
        events.append(
            f"Dialogue: 0,{format_ass_time(start_t)},"
            f"{format_ass_time(end_t)},Default,,0,0,{margin_v},,{line_text}"
        )

    return events




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
    alignment: int = 2,
    margin_v: int = 50,
    margin_l: int = 10,
    margin_r: int = 10,
    x_offset: int = 0,  # 水平偏移像素（前端 x_offset 转换）
    y_offset: int = 0,  # 垂直位置已通过 margin_v 精确计算，此处设为 0
    corrections: Optional[Dict[str, str]] = None,
    corrections_file: Optional[str] = None,
    ad_keywords: Optional[List[str]] = None,
    # === 新增：精确坐标控制 ===
    position_x: Optional[int] = None,   # 精确 X 坐标（像素），如 960 表示水平居中 (1920 分辨率下)
    position_y: Optional[int] = None,   # 精确 Y 坐标（像素），如 900 表示垂直方向 900px
    use_relative_pos: bool = False,     # 是否使用相对坐标 (0-1 之间的小数)
    # === 新增：与前端统一参数 ===
    stroke_color: Optional[str] = None,  # 描边颜色（如 "#000000"）
    stroke_width: Optional[int] = None,  # 描边宽度
    background_color: Optional[str] = None,  # 背景颜色（如 "rgba(0,0,0,0.4)"）
    background_padding: Optional[int] = None,  # 背景内边距
    background_radius: Optional[int] = None,  # 背景圆角（ASS 不支持，仅用于前端预览）
) -> str:
    import subprocess
    import shutil
    import tempfile
    from video_utils import get_video_info, _esc_filter_path, find_cjk_font_by_weight
    from whisper_parser import load_whisper_json, preprocess_segments, load_corrections

    # ── 加载校正表 ──
    if corrections is None and corrections_file:
        corrections = load_corrections(corrections_file)
        if corrections:
            print(f"     🔧 已加载 {len(corrections)} 条错别字校正规则")

    # ── effect -> 默认是否偏粗 ──
    prefer_bold = effect in ("ad", "highlight", "bounce", "typewriter")

    # ── 智能选择字体文件 ──
    if font_file is None:
        font_file = find_cjk_font_by_weight("semibold" if prefer_bold else "regular")
        if font_file:
            print(f"     🔤 自动使用中文字体：{os.path.basename(font_file)}")
        else:
            print("     ⚠️  未找到中文字体，中文可能显示为方块")

    font_name = "Sans"
    font_dir = None
    if font_file:
        font_dir = os.path.dirname(os.path.abspath(font_file))

        base = os.path.basename(font_file).lower()
        if "sourcehanserifcn" in base:
            font_name = "Source Han Serif CN"
        else:
            font_name = os.path.splitext(os.path.basename(font_file))[0]

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
        corrections=corrections,
    )

    if not segments:
        print("     ⚠️  JSON 中没有可用的字幕段落")
        shutil.copy2(input_video, output_video)
        return output_video

    print(f"     📊 解析到 {len(segments)} 段字幕，"
          f"时间范围 {segments[0]['start']:.1f}s ~ {segments[-1]['end']:.1f}s")

    # ── 生成 ASS ──
    tmp_ass = tempfile.NamedTemporaryFile(
        suffix=".ass", delete=False, mode="w", encoding="utf-8"
    )
    tmp_ass.close()

    try:
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
            alignment=alignment,
            margin_v=margin_v,
            margin_l=margin_l,
            margin_r=margin_r,
            x_offset=x_offset,
            y_offset=y_offset,
            ad_keywords=ad_keywords,
            max_chars_per_line=max_chars_per_line,
            bold=prefer_bold,  # 关键：不再无脑强制粗体
            auto_disable_bold_for_light_fonts=True,
            position_x=position_x,
            position_y=position_y,
            use_relative_pos=use_relative_pos,
            # 传递前端统一参数
            stroke_color=stroke_color,
            stroke_width=stroke_width,
            background_color=background_color,
            background_padding=background_padding,
            background_radius=background_radius,
        )

        # ── 烧录 ASS ──
        esc_ass = _esc_filter_path(tmp_ass.name)
        vf = f"ass='{esc_ass}'"
        if font_dir:
            esc_dir = _esc_filter_path(font_dir)
            vf = f"ass='{esc_ass}':fontsdir='{esc_dir}'"

        cmd = [
            "ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "warning",
            "-i", input_video,
            "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "copy",
            "-movflags", "+faststart",
            output_video,
        ]
        subprocess.run(cmd, check=True, stdin=subprocess.DEVNULL)

    finally:
        debug_ass = output_video.rsplit(".", 1)[0] + ".ass"
        try:
            shutil.copy2(tmp_ass.name, debug_ass)
            print(f"     💾 ASS 副本已保存：{debug_ass}")
        except Exception:
            pass
        os.unlink(tmp_ass.name)

    return output_video

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