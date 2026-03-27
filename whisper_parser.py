#!/usr/bin/env python3
"""
Whisper JSON 解析和预处理
"""

import json
from typing import List, Dict, Any


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