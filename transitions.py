#!/usr/bin/env python3
"""
转场特效定义和处理
"""

import os
import random
from typing import List
from video_utils import get_duration


# 所有可用的 xfade 转场特效
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

# 常用转场特效及说明
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


def merge_with_xfade(clip_paths: List[str], output_path: str,
                     transitions: List[str], td: float = 0.5):
    """使用 xfade 转场特效合并视频"""
    import subprocess
    
    n = len(clip_paths)
    if n == 1:
        import shutil
        shutil.copy2(clip_paths[0], output_path)
        return

    durations = [get_duration(p) for p in clip_paths]
    min_dur = min(durations)
    safe_td = min(td, min_dur / 2 - 0.05)
    if safe_td < 0.05:
        print("  ⚠️  片段过短，已退回无转场拼接")
        from video_utils import concat_simple
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


def list_transitions():
    """显示所有可用的转场特效"""
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