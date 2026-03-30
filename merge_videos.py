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

import os
import sys
import argparse
import shutil
import tempfile
import random
from typing import List, Optional

# 导入自定义模块
from video_utils import (
    check_ffmpeg, get_duration, get_video_info, normalize_clip,
    concat_simple, burn_subtitle, overlay_text, mix_bgm
)
from transitions import (
    XFADE_TRANSITIONS, POPULAR_TRANSITIONS, merge_with_xfade, list_transitions
)
from subtitle_effects import (
    SUBTITLE_EFFECTS, COLOR_PRESETS, burn_whisper_subtitle, list_effects
)


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

    if not check_ffmpeg():
        sys.exit(1)

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
                margin_l=actual_margin_l,  # 使用计算后的左边距
                margin_r=actual_margin_r,  # 使用计算后的右边距
                offset_x=offset_x,
                offset_y=offset_y,
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


if __name__ == "__main__":
    main()