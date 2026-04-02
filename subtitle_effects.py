
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

# 字幕特效说明
SUBTITLE_EFFECTS = {
    "karaoke":    "卡拉OK填充 — 逐字从白变金，填充动画",
    "highlight":  "逐字高亮 — 当前字放大变色，其余变暗",
    "typewriter": "打字机 — 字逐个出现，逐步构建句子",
    "bounce":     "弹跳出现 — 当前字弹跳放大后回弹",
    "ad":         "带货广告风 — 全句常驻 + 当前字高亮 + 重点词强调",
}


def generate_word_ass(
    segments: List[dict],
    output_path: str,
    effect: str = "karaoke",
    font_name: str = "SimHei",
    font_size: int = 52,
    res_x: int = 1920,
    res_y: int = 1080,
    margin_v: int = 50,
    margin_l: int = 10,
    margin_r: int = 10,
    offset_x: int = 0,
    offset_y: int = 0,
    alignment: int = 2,
    highlight_color: str = "&H0000DDFF",
    base_color: str = "&H00FFFFFF",
    outline_color: str = "&H00000000",
    back_color: str = "&H80000000",
    outline: int = 3,
    shadow: int = 2,
    ad_keywords: Optional[List[str]] = None,
    max_chars_per_line: int = 12,
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
    from video_utils import format_ass_time

    ad_keywords = ad_keywords or []
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
            f"-1,0,0,0,100,100,1,0,1,{outline},{shadow},{alignment},"
            f"{margin_l},{margin_r},{margin_v},1\n"
        )
    elif effect in ("highlight", "bounce", "typewriter"):
        # 高亮/弹跳/打字机: 白字黑边，override 中控制高亮
        header += (
            f"Style: Default,{font_name},{font_size},"
            f"{base_color},{base_color},{outline_color},{back_color},"
            f"-1,0,0,0,100,100,0,0,1,{max(outline, 4)},{max(shadow, 1)},{alignment},"
            f"{margin_l},{margin_r},{margin_v},1\n"
        )
    elif effect == "ad":
        # 广告风：更粗、更重描边、更适合带货视频
        header += (
            f"Style: Default,{font_name},{font_size},"
            f"{base_color},{base_color},&H00000000,&H64000000,"
            f"-1,0,0,0,100,100,0,0,1,{max(outline, 5)},{max(shadow, 2)},{alignment},"
            f"{margin_l},{margin_r},{margin_v},1\n"
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
        elif effect == "ad":
            events.extend(_eff_ad(seg, highlight_color, ad_keywords, max_chars_per_line))

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
    from video_utils import format_ass_time
    
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
    from video_utils import format_ass_time
    
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
    from video_utils import format_ass_time
    
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


def _ass_escape_text(text: str) -> str:
    """转义 ASS 文本中的特殊字符"""
    return text.replace("{", r"\{").replace("}", r"\}")



def _split_words_for_display(words: List[dict], max_chars: int = 12) -> List[List[dict]]:
    """
    用于显示层的自动换行：
      - 优先按标点断
      - 单行不超过 max_chars
      - 返回二维数组，每个子列表是一行
    """
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

        # 句号类优先换行
        if txt and txt[-1] in major_breaks:
            lines.append(cur_line)
            cur_line = []
            cur_len = 0
        # 逗号类：若当前行已接近满，也换
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
    """
    对重点词做 ASS override 强调：
      - 变色
      - 加粗
      - 轻微放大
    keyword_color 传入 BGR 6位，例如 FFB300
    """
    if not text:
        return text

    # 长词优先，避免短词先替换破坏长词
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
    """
    从 display_text 中按位置切出：
      before / current / after
    """
    before = display_text[:start]
    current = display_text[start:start + length]
    after = display_text[start + length:]
    return before, current, after

def _build_display_text_and_map(words: List[dict], max_chars: int = 12):
    """
    根据 words 构造 display_text（带 \\N），并返回：
      - display_text: 用于 ASS 显示的文本
      - word_positions: 每个 word 在 display_text 中的起始位置
    """
    lines = _split_words_for_display(words, max_chars=max_chars)

    display_parts = []
    word_positions = []
    pos = 0
    word_idx = 0

    for li, line in enumerate(lines):
        for w in line:
            word_positions.append(pos)
            txt = w.get("text", "")
            display_parts.append(txt)
            pos += len(txt)
            word_idx += 1

        if li < len(lines) - 1:
            display_parts.append(r"\N")
            pos += 2  # "\N" 作为两个字符计入显示位置

    display_text = "".join(display_parts)
    return display_text, word_positions

    

def _eff_ad(
    seg: dict,
    hl_color: str,
    ad_keywords: Optional[List[str]] = None,
    max_chars_per_line: int = 12,
) -> List[str]:
    """
    带货广告风（真正分行版）：
      - 在同一个 ASS 事件内使用 \\N 自动换行
      - 当前字高亮放大
      - 重点词自动强调
      - 去掉句末额外 hold，避免重叠
    """
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

    for i, w in enumerate(words):
        wt = _ass_escape_text(w["text"])
        p = positions[i]

        before, current, after = _slice_display_text(display_text, p, len(w["text"]))

        # 注意：display_text 里有 \N，不需要再次 escape
        before_text = before
        current_text = current
        after_text = after

        line_parts = []

        if before_text:
            before_styled = _apply_keyword_emphasis(
                before_text,
                ad_keywords,
                keyword_color=keyword_bgr,
                keyword_scale=102,
            )
            line_parts.append(
                f"{{\\c&H{dim_bgr}&\\b1\\fscx100\\fscy100}}{before_styled}"
            )

        current_styled = _apply_keyword_emphasis(
            current_text,
            ad_keywords,
            keyword_color=keyword_bgr,
            keyword_scale=104,
        )
        line_parts.append(
            f"{{\\c&H{hl_bgr}&\\b1\\fscx122\\fscy122"
            f"\\t(0,100,\\fscx108\\fscy108)}}{current_styled}"
        )

        if after_text:
            after_styled = _apply_keyword_emphasis(
                after_text,
                ad_keywords,
                keyword_color=keyword_bgr,
                keyword_scale=112,
            )
            line_parts.append(
                f"{{\\c&H{dim_bgr}&\\b1\\fscx100\\fscy100}}{after_styled}"
            )

        line_text = "".join(line_parts)

        if i == 0:
            line_text = "{\\fad(80,0)}" + line_text
        if i == len(words) - 1:
            line_text = "{\\fad(0,120)}" + line_text

        start_t = w["start"]
        if i < len(words) - 1:
            end_t = max(w["end"], words[i + 1]["start"] - 0.02)
        else:
            end_t = w["end"] + 0.10

        end_t = max(end_t, start_t + 0.05)

        events.append(
            f"Dialogue: 0,{format_ass_time(start_t)},"
            f"{format_ass_time(end_t)},Default,,0,0,0,,{line_text}"
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
    offset_x: int = 0,
    offset_y: int = 0,
    corrections: Optional[Dict[str, str]] = None,
    corrections_file: Optional[str] = None,
    ad_keywords: Optional[List[str]] = None,
) -> str:
    """
    完整流水线: 读取 Whisper JSON → 生成 ASS → 烧录到视频
    
    新增参数:
      corrections      : 错别字校正表 dict {错误: 正确}
      corrections_file : 校正表文件路径 (corrections.json)
    """
    import subprocess
    import shutil
    import tempfile
    from video_utils import get_video_info, find_chinese_font, _esc_filter_path
    from whisper_parser import load_whisper_json, preprocess_segments, load_corrections

    # ── 加载校正表 ──
    if corrections is None and corrections_file:
        corrections = load_corrections(corrections_file)
        if corrections:
            print(f"     🔧 已加载 {len(corrections)} 条错别字校正规则")
    
    # ── 确定字体 ──
    if font_file is None:
        font_file = find_chinese_font()
        if font_file:
            print(f"     🔤 自动使用中文字体: {os.path.basename(font_file)}")
        else:
            print("     ⚠️  未找到中文字体, 中文可能显示为方块")

    font_name = "Sans"
    font_dir = None
    if font_file:
        font_name = os.path.splitext(os.path.basename(font_file))[0]
        font_dir = os.path.dirname(os.path.abspath(font_file))

    # ── 获取视频分辨率 ──
    info = get_video_info(input_video)
    res_x = info["width"]
    res_y = info["height"]

    # ── 读取 + 预处理 JSON（带校正） ──
    data = load_whisper_json(json_path)
    segments = preprocess_segments(
        data,
        filter_transition=filter_transition,
        max_chars_per_line=max_chars_per_line,
        corrections=corrections,  # 传入校正表
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
            offset_x=offset_x,
            offset_y=offset_y,
            ad_keywords=ad_keywords,
            max_chars_per_line=max_chars_per_line,
        )

        # ── 烧录 ASS ──
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
        debug_ass = output_video.rsplit(".", 1)[0] + ".ass"
        try:
            shutil.copy2(tmp_ass.name, debug_ass)
            print(f"     💾 ASS 副本已保存: {debug_ass}")
        except Exception:
            pass
        os.unlink(tmp_ass.name)

    return output_video


def list_effects():
    """显示所有可用的字幕特效"""
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