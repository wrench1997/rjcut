#!/usr/bin/env python3
"""
Whisper JSON 解析和预处理
"""

import json
import os
from typing import List, Dict, Any, Optional


def load_whisper_json(json_path: str) -> dict:
    """加载 Whisper 输出的 JSON 文件"""
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_corrections(corrections_path: str) -> Dict[str, str]:
    """
    加载错别字校正表。
    
    支持两种格式:
      1. corrections.json: {"corrections": {"雪": "血", ...}}
      2. script.json: 从 segments[].text 自动提取（未来扩展）
    
    返回: {错误文字: 正确文字}
    """
    if not corrections_path or not os.path.isfile(corrections_path):
        return {}
    
    with open(corrections_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 格式1: 直接的校正表
    if "corrections" in data:
        corr = data["corrections"]
        if isinstance(corr, dict):
            return corr
    
    # 格式2: 列表形式 [{"from": "雪", "to": "血"}, ...]
    if "corrections" in data and isinstance(data["corrections"], list):
        return {item["from"]: item["to"] for item in data["corrections"]
                if "from" in item and "to" in item}
    
    return {}


def apply_corrections_to_words(
    words: List[dict],
    corrections: Dict[str, str],
) -> List[dict]:
    """
    对 word 列表应用错别字校正。
    
    策略:
      - 单字替换: 直接替换 word["text"]
      - 多字匹配: 用滑动窗口在连续 words 上匹配，替换对应的 text
      - 时间戳完全不动
    
    返回: 校正后的 words 列表（原地修改副本）
    """
    if not corrections or not words:
        return words
    
    # 先做拷贝，不修改原始数据
    words = [dict(w) for w in words]
    
    # ── 按 key 长度降序排列，优先匹配长词 ──
    sorted_corrections = sorted(corrections.items(), key=lambda x: len(x[0]), reverse=True)
    
    applied_count = 0
    
    for wrong, right in sorted_corrections:
        if len(wrong) == 0:
            continue
        
        # ── 情况 A: 单字替换（wrong 是单个字符） ──
        if len(wrong) == 1:
            for w in words:
                if wrong in w["text"]:
                    old = w["text"]
                    w["text"] = w["text"].replace(wrong, right)
                    if old != w["text"]:
                        applied_count += 1
            continue
        
        # ── 情况 B: 多字匹配（跨 word 边界） ──
        # 构建完整文本和字符→word索引映射
        full_text = ""
        char_to_word = []  # char_to_word[i] = word 索引
        char_to_pos = []   # char_to_pos[i] = 该字符在 word.text 中的位置
        
        for wi, w in enumerate(words):
            for ci, ch in enumerate(w["text"]):
                char_to_word.append(wi)
                char_to_pos.append(ci)
                full_text += ch
        
        # 查找所有出现位置
        search_start = 0
        replacements = []  # [(char_start, char_end, replacement)]
        
        while True:
            idx = full_text.find(wrong, search_start)
            if idx == -1:
                break
            replacements.append((idx, idx + len(wrong), right))
            search_start = idx + len(wrong)
        
        if not replacements:
            continue
        
        # 从后往前替换，避免索引偏移
        for char_start, char_end, replacement in reversed(replacements):
            # 找到涉及的 word 范围
            first_word = char_to_word[char_start]
            last_word = char_to_word[char_end - 1]
            
            if first_word == last_word:
                # 替换发生在单个 word 内
                w = words[first_word]
                pos_start = char_to_pos[char_start]
                pos_end = char_to_pos[char_end - 1] + 1
                w["text"] = w["text"][:pos_start] + replacement + w["text"][pos_end:]
            else:
                # 跨多个 word: 把替换文本放在第一个 word，清空中间的
                # 第一个 word: 保留前缀 + 替换文本
                w_first = words[first_word]
                pos_start = char_to_pos[char_start]
                w_first["text"] = w_first["text"][:pos_start] + replacement
                
                # 中间的 word: 清空文本（保留时间戳，后续过滤）
                for mid_wi in range(first_word + 1, last_word):
                    words[mid_wi]["text"] = ""
                
                # 最后一个 word: 保留后缀
                w_last = words[last_word]
                pos_end = char_to_pos[char_end - 1] + 1
                w_last["text"] = w_last["text"][pos_end:]
            
            applied_count += 1
        
        # 重建映射（因为文本变了）
        full_text = "".join(w["text"] for w in words)
    
    # ── 过滤掉文本变空的 word（跨词替换产生的） ──
    words = [w for w in words if w["text"]]
    
    if applied_count > 0:
        corrected_text = "".join(w["text"] for w in words)
        # 这里不打印，让调用方决定是否输出日志
    
    return words


def preprocess_segments(
    data: dict,
    filter_transition: bool = True,
    max_chars_per_line: int = 18,
    corrections: Optional[Dict[str, str]] = None,
) -> List[dict]:
    """
    预处理 Whisper segments:
      1. 过滤 "转场" 标记词
      2. 应用错别字校正
      3. 拆分超长句子为多行
      4. 跳过空段
      
    参数:
      data              : Whisper JSON 数据
      filter_transition : 是否过滤 "转场" 标记
      max_chars_per_line: 每行最大字符数
      corrections       : 错别字校正表 {错误: 正确}
      
    返回: [{"words": [...], "text": "...", "start": float, "end": float}, ...]
    """
    segments = data.get("segments", [])
    processed = []
    total_corrections = 0

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
                if (w["text"] == "转"
                        and i + 1 < len(words)
                        and words[i + 1]["text"] == "场"):
                    i += 2
                    continue
                if w["text"] == "转场":
                    i += 1
                    continue
                filtered.append(w)
                i += 1
            words = filtered

        if not words:
            continue

        # ── 应用错别字校正 ──
        if corrections:
            old_text = "".join(w["text"] for w in words)
            words = apply_corrections_to_words(words, corrections)
            new_text = "".join(w["text"] for w in words)
            if old_text != new_text:
                total_corrections += 1

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

    if corrections and total_corrections > 0:
        print(f"     🔧 已校正 {total_corrections} 段文字中的错别字")

    return processed


def _split_words_into_lines(
    words: List[dict], max_chars: int
) -> List[List[dict]]:
    """
    更适合广告口播的断句策略：
      1. 优先按中文标点断句
      2. 单句过长时再按最大字数切
      3. 避免一行过短或过碎
    """
    if not words:
        return []

    major_breaks = set("。！？；!?;")
    minor_breaks = set("，、：,.，:")
    all_breaks = major_breaks | minor_breaks

    # 先按强标点/弱标点切成 phrase
    phrases: List[List[dict]] = []
    cur_phrase: List[dict] = []

    for w in words:
        cur_phrase.append(w)
        txt = w.get("text", "")
        if txt and txt[-1] in all_breaks:
            phrases.append(cur_phrase)
            cur_phrase = []

    if cur_phrase:
        phrases.append(cur_phrase)

    # 再将 phrase 合并成合适长度的行
    lines: List[List[dict]] = []
    cur_line: List[dict] = []
    cur_len = 0

    def phrase_len(ws: List[dict]) -> int:
        return sum(len(x.get("text", "")) for x in ws)

    for phrase in phrases:
        p_len = phrase_len(phrase)

        # 如果单个 phrase 本身就超长，则内部强制切分
        if p_len > max_chars:
            if cur_line:
                lines.append(cur_line)
                cur_line = []
                cur_len = 0

            tmp: List[dict] = []
            tmp_len = 0
            for w in phrase:
                wlen = len(w.get("text", ""))
                if tmp and tmp_len + wlen > max_chars:
                    lines.append(tmp)
                    tmp = []
                    tmp_len = 0
                tmp.append(w)
                tmp_len += wlen
            if tmp:
                lines.append(tmp)
            continue

        # phrase 能放进当前行就放，否则换行
        if cur_line and cur_len + p_len > max_chars:
            lines.append(cur_line)
            cur_line = []
            cur_len = 0

        cur_line.extend(phrase)
        cur_len += p_len

        # 如果当前 phrase 以强标点结尾，优先收行
        last_text = phrase[-1].get("text", "") if phrase else ""
        if last_text and last_text[-1] in major_breaks:
            lines.append(cur_line)
            cur_line = []
            cur_len = 0

    if cur_line:
        lines.append(cur_line)

    # 过滤空行
    lines = [ln for ln in lines if ln and "".join(w.get("text", "") for w in ln).strip()]
    return lines