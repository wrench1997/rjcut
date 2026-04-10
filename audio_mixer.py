
#!/usr/bin/env python3
"""
音频混音模块 (audio_mixer.py)
=============================
为视频添加背景音乐，支持音量调节、循环播放、淡入淡出等功能。

功能特性:
  - 背景音乐循环播放
  - 独立音量控制 (原始音频 + 背景音乐)
  - 淡入淡出效果
  - 自动时长匹配
  - 支持多种音频格式

用法:
  from audio_mixer import add_background_music
  
  add_background_music(
      input_video="input.mp4",
      output_video="output.mp4",
      bgm_path="bgm.mp3",
      bgm_volume=0.3,
      original_volume=1.0,
      bgm_start_time=0.0,
      bgm_loop=True,
      fade_in_duration=0.5,
      fade_out_duration=0.5,
  )
"""

import os
import subprocess
import tempfile
from typing import Optional


def check_audio_stream(video_path: str) -> bool:
    """
    检查视频是否包含音频流
    
    Returns:
        bool: True=有音频流, False=无音频流
    """
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=codec_type",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path
    ]
    
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip() == "audio"
    except Exception:
        return False


def get_audio_duration(audio_path: str) -> float:
    """
    获取音频文件时长（秒）
    """
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        audio_path
    ]
    
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=10, check=True
        )
        return float(result.stdout.strip())
    except Exception as e:
        raise RuntimeError(f"无法获取音频时长: {e}")


def get_video_duration(video_path: str) -> float:
    """
    获取视频时长（秒）
    """
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path
    ]
    
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=10, check=True
        )
        return float(result.stdout.strip())
    except Exception as e:
        raise RuntimeError(f"无法获取视频时长: {e}")


def add_background_music(
    input_video: str,
    output_video: str,
    bgm_path: str,
    bgm_volume: float = 0.3,
    original_volume: float = 1.0,
    bgm_start_time: float = 0.0,
    bgm_loop: bool = True,
    fade_in_duration: float = 0.5,
    fade_out_duration: float = 0.5,
) -> str:
    """
    为视频添加背景音乐
    
    参数:
        input_video        : 输入视频路径
        output_video       : 输出视频路径
        bgm_path           : 背景音乐文件路径
        bgm_volume         : 背景音乐音量 (0.0-1.0)
        original_volume    : 原始视频音量 (0.0-1.0)
        bgm_start_time     : 背景音乐开始时间（秒）
        bgm_loop           : 是否循环背景音乐
        fade_in_duration   : 淡入时长（秒）
        fade_out_duration  : 淡出时长（秒）
    
    返回:
        str: 输出视频路径
    """
    
    print(f"\n{'='*60}")
    print(f"  🎵 添加背景音乐")
    print(f"{'='*60}")
    print(f"  输入视频:     {os.path.basename(input_video)}")
    print(f"  背景音乐:     {os.path.basename(bgm_path)}")
    print(f"  BGM 音量:     {bgm_volume:.0%}")
    print(f"  原始音量:     {original_volume:.0%}")
    print(f"  循环播放:     {'是' if bgm_loop else '否'}")
    print(f"  淡入/淡出:    {fade_in_duration}s / {fade_out_duration}s")
    print(f"{'─'*60}")
    
    # 检查文件是否存在
    if not os.path.isfile(input_video):
        raise FileNotFoundError(f"输入视频不存在: {input_video}")
    if not os.path.isfile(bgm_path):
        raise FileNotFoundError(f"背景音乐不存在: {bgm_path}")
    
    # 获取视频时长
    video_duration = get_video_duration(input_video)
    bgm_duration = get_audio_duration(bgm_path)
    
    print(f"  视频时长:     {video_duration:.2f}s")
    print(f"  BGM 时长:     {bgm_duration:.2f}s")
    
    # 检查原始视频是否有音频流
    has_audio = check_audio_stream(input_video)
    
    if not has_audio:
        print(f"  ⚠️  原始视频无音频流，将仅添加背景音乐")
    
    # 构建音频滤镜
    audio_filters = []
    
    # === 处理背景音乐 ===
    bgm_filter_parts = []
    
    # 1. 如果需要循环，使用 aloop
    if bgm_loop and bgm_duration < video_duration:
        loop_count = int(video_duration / bgm_duration) + 1
        bgm_filter_parts.append(f"aloop=loop={loop_count}:size={int(bgm_duration * 44100)}")
    
    # 2. 截取到视频时长
    bgm_filter_parts.append(f"atrim=start={bgm_start_time}:duration={video_duration}")
    
    # 3. 设置时间戳
    bgm_filter_parts.append("asetpts=PTS-STARTPTS")
    
    # 4. 音量调节
    bgm_filter_parts.append(f"volume={bgm_volume}")
    
    # 5. 淡入淡出
    if fade_in_duration > 0:
        bgm_filter_parts.append(f"afade=t=in:st=0:d={fade_in_duration}")
    
    if fade_out_duration > 0:
        fade_start = max(0, video_duration - fade_out_duration)
        bgm_filter_parts.append(f"afade=t=out:st={fade_start}:d={fade_out_duration}")
    
    bgm_filter = ",".join(bgm_filter_parts)
    
    # === 构建完整的 FFmpeg 命令 ===
    
    if has_audio:
        # 原始视频有音频：混音模式
        filter_complex = (
            f"[1:a]{bgm_filter}[bgm];"
            f"[0:a]volume={original_volume}[orig];"
            f"[orig][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]"
        )
        
        cmd = [
            "ffmpeg", "-nostdin", "-threads", "2", "-y",
            "-hide_banner", "-loglevel", "warning",
            "-i", input_video,
            "-i", bgm_path,
            "-filter_complex", filter_complex,
            "-map", "0:v",
            "-map", "[aout]",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
            "-movflags", "+faststart",
            output_video
        ]
    else:
        # 原始视频无音频：直接添加背景音乐
        cmd = [
            "ffmpeg", "-nostdin", "-threads", "2", "-y",
            "-hide_banner", "-loglevel", "warning",
            "-i", input_video,
            "-i", bgm_path,
            "-filter_complex", f"[1:a]{bgm_filter}[aout]",
            "-map", "0:v",
            "-map", "[aout]",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
            "-shortest",
            "-movflags", "+faststart",
            output_video
        ]
    
    # 执行 FFmpeg
    try:
        print(f"  ⏳ 混音处理中...")
        subprocess.run(
            cmd,
            check=True,
            timeout=600,
            stdin=subprocess.DEVNULL,
            capture_output=True
        )
        print(f"  ✅ 背景音乐添加完成")
        print(f"  📁 输出: {os.path.basename(output_video)}")
        
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode('utf-8', errors='ignore') if e.stderr else ''
        raise RuntimeError(f"FFmpeg 混音失败:\n{stderr}")
    except subprocess.TimeoutExpired:
        raise RuntimeError("FFmpeg 混音超时 (10分钟)")
    
    print(f"{'='*60}\n")
    
    return output_video


def main():
    """
    命令行工具
    """
    import argparse
    
    parser = argparse.ArgumentParser(
        description="🎵 视频背景音乐混音工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 基础用法
  python audio_mixer.py input.mp4 -o output.mp4 --bgm music.mp3
  
  # 自定义音量
  python audio_mixer.py input.mp4 -o output.mp4 --bgm music.mp3 \\
      --bgm-volume 0.2 --original-volume 1.0
  
  # 不循环，从第5秒开始
  python audio_mixer.py input.mp4 -o output.mp4 --bgm music.mp3 \\
      --no-loop --bgm-start 5.0
  
  # 添加淡入淡出
  python audio_mixer.py input.mp4 -o output.mp4 --bgm music.mp3 \\
      --fade-in 2.0 --fade-out 3.0
        """
    )
    
    parser.add_argument("input", help="输入视频文件")
    parser.add_argument("-o", "--output", required=True, help="输出视频文件")
    parser.add_argument("--bgm", required=True, help="背景音乐文件")
    parser.add_argument("--bgm-volume", type=float, default=0.3,
                        help="背景音乐音量 0.0-1.0 (默认: 0.3)")
    parser.add_argument("--original-volume", type=float, default=1.0,
                        help="原始音频音量 0.0-1.0 (默认: 1.0)")
    parser.add_argument("--bgm-start", type=float, default=0.0,
                        help="背景音乐开始时间/秒 (默认: 0.0)")
    parser.add_argument("--no-loop", action="store_true",
                        help="不循环背景音乐")
    parser.add_argument("--fade-in", type=float, default=0.5,
                        help="淡入时长/秒 (默认: 0.5)")
    parser.add_argument("--fade-out", type=float, default=0.5,
                        help="淡出时长/秒 (默认: 0.5)")
    
    args = parser.parse_args()
    
    # 参数验证
    if not 0.0 <= args.bgm_volume <= 1.0:
        parser.error("--bgm-volume 必须在 0.0-1.0 之间")
    if not 0.0 <= args.original_volume <= 1.0:
        parser.error("--original-volume 必须在 0.0-1.0 之间")
    if args.bgm_start < 0:
        parser.error("--bgm-start 不能为负数")
    if args.fade_in < 0 or args.fade_out < 0:
        parser.error("淡入淡出时长不能为负数")
    
    add_background_music(
        input_video=args.input,
        output_video=args.output,
        bgm_path=args.bgm,
        bgm_volume=args.bgm_volume,
        original_volume=args.original_volume,
        bgm_start_time=args.bgm_start,
        bgm_loop=not args.no_loop,
        fade_in_duration=args.fade_in,
        fade_out_duration=args.fade_out,
    )


if __name__ == "__main__":
    main()