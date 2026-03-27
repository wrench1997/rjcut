#!/usr/bin/env python3
"""
处理 whisper_timestamped 转录 JSON 文件
- 移除包含"转场"的片段
- 重新计算时间戳，使其连续
- 输出新的 JSON 文件，可用于生成字幕
"""

import json
import sys
import os
from typing import List, Dict, Any

def process_transcription(input_file: str, output_file: str = None) -> Dict[str, Any]:
    """
    处理转录 JSON 文件
    - 移除包含"转场"的片段
    - 重新计算时间戳
    
    参数:
        input_file: 输入 JSON 文件路径
        output_file: 输出 JSON 文件路径 (可选)
        
    返回:
        处理后的 JSON 数据
    """
    # 读取原始 JSON 文件
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 获取原始片段
    original_segments = data.get('segments', [])
    print(f"原始片段数: {len(original_segments)}")
    
    # 过滤掉包含"转场"的片段
    filtered_segments = []
    removed_segments = []
    
    for segment in original_segments:
        text = segment.get('text', '').strip()
        if '转场' in text:
            removed_segments.append(segment)
        else:
            filtered_segments.append(segment)
    
    print(f"过滤后片段数: {len(filtered_segments)}")
    print(f"移除的片段数: {len(removed_segments)}")
    
    # 重新计算时间戳
    current_time = 0.0
    for segment in filtered_segments:
        # 计算片段时长
        duration = segment['end'] - segment['start']
        
        # 更新时间戳
        segment['start'] = current_time
        segment['end'] = current_time + duration
        current_time += duration
        
        # 更新单词时间戳
        if 'words' in segment:
            word_offset = segment['start']
            for word in segment['words']:
                # 计算相对于原始片段开始的偏移
                relative_start = word['start'] - (segment['start'] - word_offset)
                relative_end = word['end'] - (segment['start'] - word_offset)
                
                # 更新单词时间戳
                word['start'] = relative_start
                word['end'] = relative_end
    
    # 更新总时长
    data['text'] = ' '.join(segment.get('text', '').strip() for segment in filtered_segments)
    
    # 替换原始片段
    data['segments'] = filtered_segments
    
    # 写入新的 JSON 文件
    if output_file:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"已保存到: {output_file}")
    
    return data

def generate_srt(data: Dict[str, Any], output_file: str):
    """
    从处理后的 JSON 数据生成 SRT 字幕文件
    
    参数:
        data: 处理后的 JSON 数据
        output_file: 输出 SRT 文件路径
    """
    segments = data.get('segments', [])
    
    with open(output_file, 'w', encoding='utf-8') as f:
        for i, segment in enumerate(segments, 1):
            start_time = format_timestamp(segment['start'])
            end_time = format_timestamp(segment['end'])
            text = segment.get('text', '').strip()
            
            f.write(f"{i}\n")
            f.write(f"{start_time} --> {end_time}\n")
            f.write(f"{text}\n\n")
    
    print(f"已生成 SRT 字幕文件: {output_file}")

def format_timestamp(seconds: float) -> str:
    """
    将秒数格式化为 SRT 时间戳格式 (HH:MM:SS,mmm)
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    seconds = seconds % 60
    milliseconds = int((seconds - int(seconds)) * 1000)
    
    return f"{hours:02d}:{minutes:02d}:{int(seconds):02d},{milliseconds:03d}"

def main():
    if len(sys.argv) < 2:
        print("用法: python process_transcription.py input.json [output.json]")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    if len(sys.argv) > 2:
        output_file = sys.argv[2]
    else:
        # 自动生成输出文件名
        base, ext = os.path.splitext(input_file)
        output_file = f"{base}_processed{ext}"
    
    processed_data = process_transcription(input_file, output_file)
    srt_file = os.path.splitext(output_file)[0] + ".srt"
    generate_srt(processed_data, srt_file)

if __name__ == "__main__":
    main()