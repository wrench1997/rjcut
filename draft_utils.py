from typing import Dict, List, Any
from datetime import datetime
import os
import httpx

# Gateway 地址（从环境变量读取，默认本地 Docker 网络）
GATEWAY_BASE_URL = os.getenv("GATEWAY_BASE_URL", "http://gateway:8888")


def build_editable_script_from_result(result: dict):
    timeline = (result or {}).get("draft", {}).get("timeline") or {}
    transcription = (result or {}).get("draft", {}).get("transcription") or {}
    timeline_segments = timeline.get("segments") or []
    transcription_segments = transcription.get("segments") or []

    editable_segments = []

    for i, seg in enumerate(timeline_segments, 1):
        text = ""
        if i - 1 < len(transcription_segments):
            text = transcription_segments[i - 1].get("text", "").strip()

        editable_segments.append({
            "id": seg.get("id", i),
            "text": text,
            "type": seg.get("type", "human"),
            "scene_file": seg.get("scene_file"),
            "start": seg.get("start"),
            "end": seg.get("end"),
            "duration": seg.get("duration"),
        })

    return {"segments": editable_segments}


def apply_corrections_to_editable_script(editable_script: dict, corrections: list):
    if not editable_script or not corrections:
        return editable_script

    corr_pairs = []
    for item in corrections:
        if isinstance(item, dict):
            src = item.get("src")
            dst = item.get("dst")
        else:
            src = getattr(item, "src", None)
            dst = getattr(item, "dst", None)
        if src and dst:
            corr_pairs.append((src, dst))

    for seg in editable_script.get("segments", []):
        text = seg.get("text", "") or ""
        for src, dst in corr_pairs:
            text = text.replace(src, dst)
        seg["text"] = text

    return editable_script


def editable_script_to_script_json(editable_script: dict):
    return {
        "segments": [
            {
                "flag": seg.get("type", "human"),
                "text": seg.get("text", ""),
                "scene_file": seg.get("scene_file"),
            }
            for seg in (editable_script or {}).get("segments", [])
        ]
    }


def simple_ai_correct_text(text: str, mode: str = "rewrite", prompt: str = None):
    replacements = {
        "蓝牙耳际": "蓝牙耳机",
        "冲电": "充电",
        "兰牙": "蓝牙",
        "帯货": "带货",
    }

    corrected = text
    changes = []
    for src, dst in replacements.items():
        if src in corrected:
            corrected = corrected.replace(src, dst)
            changes.append({
                "src": src,
                "dst": dst,
                "reason": "rule_based_ai_correction"
            })

    return corrected, changes


async def ai_generate_script_via_gateway(
    product_name: str,
    selling_points: str,
    target_audience: str,
    tone: str,
    template_structure: List[Dict],
    model_name: str = None,
) -> Dict[str, Any]:
    """
    通过 Gateway 调用 vLLM AI 生成口播文案

    Args:
        product_name: 产品名称
        selling_points: 产品卖点
        target_audience: 目标人群
        tone: 文案风格 (direct_sale/premium/social_review/explainer)
        template_structure: 模板结构（包含 segments 定义）
        model_name: 模型名称（可选，默认使用 Gateway 配置的模型）

    Returns:
        {
            "success": bool,
            "segments": [...],  # AI 生成的文案段落
            "usage": {...},     # Token 使用情况
            "error": str        # 错误信息（如果有）
        }
    """
    # 构建 Prompt
    tone_descriptions = {
        "direct_sale": "直接带货风格，热情洋溢，强调优惠和购买冲动",
        "premium": "高端品质风格，优雅有格调，强调生活品味",
        "social_review": "社交种草风格，真实分享感受，像朋友推荐",
        "explainer": "科普讲解风格，专业详细，解答用户疑问",
    }

    system_prompt = """你是一位专业的短视频口播文案创作专家，擅长创作面向大众消费者的带货文案。

【文案风格要求】
1. 口语化、接地气，像朋友聊天一样自然
2. 面向普通大众消费者，不要用专业术语
3. 突出产品功效和实际好处，让用户听得懂
4. 有感染力和号召力，能激发购买欲望
5. 符合短视频节奏，每句话简短有力
6. hook 开场要抓人眼球，ending 结尾要促单

【输出格式】
请按行输出，每一行对应一个需要文案的段落（hook、human、ending），顺序与模板结构一致。
不要输出任何解释、段落标识，只输出纯文案内容。
"""

    # 统计需要生成文案的段落数量
    text_segment_count = sum(1 for s in template_structure if s.get("flag") in ("hook", "human", "ending"))
    
    user_prompt = f"""请为以下产品创作面向大众消费者的口播带货文案：

【产品信息】
- 产品名称：{product_name}
- 核心卖点：{selling_points}
- 目标人群：{target_audience}
- 文案风格：{tone_descriptions.get(tone, tone)}

【模板结构】
{template_structure}

【任务】
模板中共有 {text_segment_count} 个段落需要文案。
请按顺序输出 {text_segment_count} 行文案，每行对应一个段落的口播词。

【文案要求】
- 用老百姓听得懂的大白话
- 突出产品实际功效和好处
- 有感染力，能打动普通人
- 适合直播带货场景
"""

    payload = {
        "model": model_name or os.getenv("MODEL_NAME", "Qwen/Qwen3.5-397B-A17B-FP8"),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 2000,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{GATEWAY_BASE_URL}/v1/chat/completions",
                json=payload
            )
            response.raise_for_status()
            result = response.json()

            # 解析返回结果（兼容 content 和 reasoning 字段）
            message = result["choices"][0]["message"]
            ai_text = message.get("content") or message.get("reasoning", "")
            
            if not ai_text:
                raise ValueError("AI 返回内容为空")

            print(f"[DEBUG] AI 返回的原始文本:\n{ai_text}")
            
            # 将 AI 生成的文案填充到模板结构中
            generated_segments = parse_ai_script_to_segments(ai_text, template_structure)
            print(f"[DEBUG] 解析后的 segments:\n{generated_segments}")

            return {
                "success": True,
                "segments": generated_segments,
                "usage": result.get("usage", {}),
                "raw_text": ai_text,
            }
    except httpx.HTTPError as e:
        return {
            "success": False,
            "segments": [],
            "error": f"Gateway 调用失败：{str(e)}",
        }
    except Exception as e:
        return {
            "success": False,
            "segments": [],
            "error": f"AI 生成失败：{str(e)}",
        }


def extract_json_field(text, field_name, allow_partial=False):
    """
    从文本中提取指定 JSON 字段的值（通用辅助函数）
    
    Args:
        text: 文本
        field_name: 字段名
        allow_partial: 如果为 True，当 JSON 被截断时尝试提取部分数据
    """
    import re
    import json
    
    # 首先尝试找到 "field_name": 的位置
    pattern = rf'"{field_name}"\s*:\s*'
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return None
    
    # 从冒号后面开始提取值
    start_pos = match.end()
    
    # 跳过空白字符
    while start_pos < len(text) and text[start_pos] in ' \t\n\r':
        start_pos += 1
    
    if start_pos >= len(text):
        return None
    
    # 根据起始字符确定值的类型
    first_char = text[start_pos]
    
    if first_char == '"':
        # 字符串：找到结束的引号（处理转义）
        end_pos = start_pos + 1
        while end_pos < len(text):
            if text[end_pos] == '\\' and end_pos + 1 < len(text):
                end_pos += 2  # 跳过转义字符
                continue
            if text[end_pos] == '"':
                end_pos += 1
                break
            end_pos += 1
        value = text[start_pos:end_pos]
        return value[1:-1]  # 去掉引号
    
    elif first_char.isdigit() or (first_char == '-' and start_pos + 1 < len(text) and text[start_pos + 1].isdigit()):
        # 数字
        end_pos = start_pos
        while end_pos < len(text) and (text[end_pos].isdigit() or text[end_pos] in '.-eE+'):
            end_pos += 1
        value = text[start_pos:end_pos]
        try:
            if '.' in value:
                return float(value)
            return int(value)
        except:
            return value
    
    elif first_char == '[':
        # 数组：使用括号计数找到匹配的 ]
        end_pos = find_json_bracket_end(text, start_pos, '[', ']', allow_partial=allow_partial)
        if end_pos:
            value = text[start_pos:end_pos]
            # 如果是部分提取，尝试修复 JSON（添加闭合括号）
            if allow_partial and end_pos == len(text) and not value.rstrip().endswith(']'):
                # 尝试智能修复：找到最后一个完整的对象
                value = value.rstrip()
                # 查找最后一个 "flag": 或类似字段，确定最后一个对象的位置
                last_obj_start = value.rfind('{')
                if last_obj_start > 0:
                    # 截断到最后一个完整的对象
                    value = value[:last_obj_start].rstrip(',').rstrip() + ']'
                else:
                    value = value + ']'
            try:
                return json.loads(value)
            except Exception as e:
                # 如果解析失败，尝试更激进的修复
                if allow_partial:
                    # 提取所有完整的 {"flag": ..., "note": ...} 对象
                    import re
                    pattern = r'\{[^{}]*"flag"[^{}]*\}'
                    matches = re.findall(pattern, value, re.DOTALL)
                    if matches:
                        try:
                            return [json.loads(m) for m in matches]
                        except:
                            pass
                return value
        return None
    
    elif first_char == '{':
        # 对象：使用括号计数找到匹配的 }
        end_pos = find_json_bracket_end(text, start_pos, '{', '}', allow_partial=allow_partial)
        if end_pos:
            value = text[start_pos:end_pos]
            # 如果是部分提取，尝试修复 JSON（添加闭合括号）
            if allow_partial and end_pos == len(text) and not value.rstrip().endswith('}'):
                value = value.rstrip() + '}'
            try:
                return json.loads(value)
            except:
                return value
        return None
    
    return None


def extract_json_object(text):
    """从文本中提取第一个完整的 JSON 对象（使用括号计数）"""
    import json
    
    # 找到第一个 { 的位置
    start_pos = text.find('{')
    if start_pos == -1:
        return None
    
    # 使用括号计数找到匹配的 }
    end_pos = find_json_bracket_end(text, start_pos, '{', '}')
    if end_pos:
        value = text[start_pos:end_pos]
        try:
            return json.loads(value)
        except:
            return None
    return None


def find_json_bracket_end(text, start_pos, open_bracket, close_bracket, allow_partial=False):
    """
    使用括号计数找到匹配的闭合括号位置
    
    Args:
        text: 文本
        start_pos: 开始位置
        open_bracket: 开括号字符
        close_bracket: 闭括号字符
        allow_partial: 如果为 True，当括号不匹配时返回文本末尾（用于处理截断的 JSON）
    
    Returns:
        匹配的闭合括号位置，如果 allow_partial=True 且括号不匹配则返回 len(text)
    """
    count = 0
    in_string = False
    escape_next = False
    
    for i in range(start_pos, len(text)):
        char = text[i]
        
        if escape_next:
            escape_next = False
            continue
        
        if char == '\\':
            escape_next = True
            continue
        
        if char == '"' and not escape_next:
            in_string = not in_string
            continue
        
        if not in_string:
            if char == open_bracket:
                count += 1
            elif char == close_bracket:
                count -= 1
                if count == 0:
                    return i + 1
    
    # 如果允许部分提取且还有未闭合的括号，返回文本末尾
    if allow_partial and count > 0:
        return len(text)
    
    return None


def parse_ai_script_to_segments(ai_text: str, template_structure: List[Dict]) -> List[Dict]:
    """
    将 AI 生成的文案解析并填充到模板结构中

    支持填充 hook、human、ending 段落的 text 字段
    transition 段落保持原样（仅作为转场提示）
    """
    import re

    generated_segments = []
    
    # 清理 AI 返回内容：跳过思考过程、推理内容
    lines = ai_text.split('\n')
    cleaned_lines = []
    skip_mode = True  # 初始跳过模式，直到找到第一个有效文案
    
    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            continue
        
        # 检测是否进入正式文案（遇到非思考类的内容）
        lower_line = line_stripped.lower()
        
        # 【强化过滤】无论 skip_mode 状态，始终过滤明显的思考过程标记
        # 1. 跳过 "Thinking Process:" 这类标题
        if lower_line in ['thinking process:', 'thinking:', 'process:']:
            continue
        # 2. 跳过编号 + 粗体 markdown（如 "1.  **Analyze the Request:**"）
        if re.match(r'^\d+\.\s+\*\*', line_stripped):
            continue
        # 3. 跳过包含思考关键词的行（即使有中文）
        if any(keyword in lower_line for keyword in [
            'thinking process', 'analyze the request', 'step', 'requirement',
            'understand', 'clarification', 'interpretation', 'decision',
            'refining', 're-evaluating', 'final polish', 'wait,', 'actually,'
        ]):
            continue
        
        if skip_mode:
            # 跳过思考过程标记（包含这些关键词的直接跳过）
            if any(keyword in lower_line for keyword in [
                'thinking', 'analyze', 'step', '首先', '让我', '我们来',
                '根据', '分析', '理解', '需求', 'requirement', 'task',
                'process', '理解', '我将', '我会', 'let', 'break',
                'draft', 'review', 'check', 'final', 'understand',
                'product:', '目标人群', '风格', 'hook:', 'human:', 'ending:', 'transition:'
            ]):
                continue
            # 跳过编号列表（如 1. 2. 3.）
            if re.match(r'^\d+\.\s*[\*\[\-]', line_stripped):
                continue
            # 跳过 markdown 标题（** 或 # 开头）
            if line_stripped.startswith('**') or line_stripped.startswith('#'):
                continue
            # 跳过纯符号行
            if re.match(r'^[\*\-\#\d\.\s:]+$', line_stripped):
                continue
            # 跳过列表项（* 或 - 开头）
            if line_stripped.startswith('*') or line_stripped.startswith('-'):
                continue
            # 找到第一个有效文案行（至少包含 5 个中文字符，确保是完整句子）
            has_chinese = len(re.findall(r'[\u4e00-\u9fff]', line_stripped)) >= 5
            if has_chinese:
                skip_mode = False
        
        # 添加到有效文案列表
        if not skip_mode and line_stripped:
            # 再次检查是否是有效文案（不是思考内容、不是列表项）
            if not any(keyword in lower_line for keyword in ['thinking', 'analyze', 'step', 'requirement', 'hook', 'human', 'ending']):
                if not line_stripped.startswith('*') and not line_stripped.startswith('-'):
                    if not re.match(r'^\d+\.', line_stripped):
                        cleaned_lines.append(line_stripped)
    
    ai_index = 0

    for segment in template_structure:
        flag = segment.get("flag")
        
        # 需要填充文案的段落类型：hook、human、ending
        if flag in ("hook", "human", "ending"):
            # 从 AI 文案中取一行作为该段落的文案
            if ai_index < len(cleaned_lines):
                text = cleaned_lines[ai_index]
                ai_index += 1
            else:
                text = segment.get("text", "")

            generated_segments.append({
                **segment,
                "text": text,
                "note": (segment.get("note") or "") + "（AI 生成）",
            })
        else:
            # transition、scene 等段落保持原样（作为转场提示）
            generated_segments.append({
                **segment,
                "text": "",  # 转场段落不需要文案
                "note": (segment.get("note") or "") + "（AI 生成 - 转场提示）",
            })

    return generated_segments


async def ai_recommend_templates_via_gateway(
    product_keyword: str,
    category: str = "",
    model_name: str = None,
) -> Dict[str, Any]:
    """
    通过 Gateway 调用 vLLM AI 推荐模板

    Args:
        product_keyword: 产品关键词
        category: 产品类目
        model_name: 模型名称（可选）

    Returns:
        {
            "success": bool,
            "recommendations": [  # 推荐的模板列表
                {
                    "template_id": str,
                    "score": float,
                    "reason": str
                }
            ],
            "usage": {...},
            "error": str
        }
    """
    system_prompt = """你是一位专业的短视频模板推荐专家。
请根据用户的产品信息，推荐最适合的模板，并说明推荐理由。

请以 JSON 格式返回，包含以下字段：
- recommendations: 数组，每个元素包含 template_id（模板 ID）、score（匹配度 0-1）、reason（推荐理由）"""

    user_prompt = f"""请为以下产品推荐合适的短视频模板：

【产品信息】
- 产品关键词：{product_keyword}
- 产品类目：{category or "未指定"}

请推荐 3-5 个最匹配的模板，并说明每个模板为什么适合这个产品。"""

    payload = {
        "model": model_name or os.getenv("MODEL_NAME", "Qwen/Qwen3.5-397B-A17B-FP8"),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 1500,
        "stream": False,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{GATEWAY_BASE_URL}/v1/chat/completions",
                json=payload
            )
            response.raise_for_status()
            result = response.json()

            # 解析 AI 返回的 JSON（使用正则提取，兼容思考过程）
            message = result["choices"][0]["message"]
            ai_content = message.get("content") or message.get("reasoning", "")
            
            if not ai_content:
                raise ValueError("AI 返回内容为空")
            
            # 使用正则提取 recommendations 字段
            recommendations = extract_json_field(ai_content, "recommendations")
            if not recommendations:
                raise ValueError("无法提取 recommendations 字段")

            return {
                "success": True,
                "recommendations": recommendations,
                "usage": result.get("usage", {}),
            }
    except httpx.HTTPError as e:
        return {
            "success": False,
            "recommendations": [],
            "error": f"Gateway 调用失败：{str(e)}",
        }
    except Exception as e:
        return {
            "success": False,
            "recommendations": [],
            "error": f"AI 推荐失败：{str(e)}",
        }


async def ai_analyze_videos_via_gateway(
    video_files: List[Dict],
    template_slots: List[Dict],
    model_name: str = None,
) -> Dict[str, Any]:
    """
    通过 Gateway 调用 vLLM AI 分析视频素材，推荐到素材位

    Args:
        video_files: 视频文件列表，每个包含 {name, path, duration}
        template_slots: 模板素材位定义列表
        model_name: 模型名称（可选）

    Returns:
        {
            "success": bool,
            "suggestions": [  # 每个素材位的推荐
                {
                    "slot_id": str,
                    "slot_title": str,
                    "files": [...],  # 推荐的文件列表
                    "confidence": float
                }
            ],
            "usage": {...},
            "error": str
        }
    """
    system_prompt = """你是一位专业的视频素材分析专家。
请根据视频文件名和模板素材位定义，分析每个视频最适合放在哪个素材位。

请以 JSON 格式返回，包含以下字段：
- suggestions: 数组，每个元素包含 slot_id（素材位 ID）、slot_title（素材位标题）、files（推荐的文件数组，包含 name 和 match_reason）、confidence（匹配置信度 0-1）"""

    video_info = "\n".join([f"- {f['name']} (时长：{f.get('duration', '未知')}秒)" for f in video_files])
    slot_info = "\n".join([f"- {s['id']}: {s['title']} - {s.get('prompt', '无描述')}" for s in template_slots])

    user_prompt = f"""请分析以下视频素材，推荐它们最适合的模板素材位：

【视频素材列表】
{video_info}

【模板素材位定义】
{slot_info}

请为每个素材位推荐最匹配的视频文件，并说明匹配理由。"""

    payload = {
        "model": model_name or os.getenv("MODEL_NAME", "Qwen/Qwen3.5-397B-A17B-FP8"),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 2000,
        "stream": False,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{GATEWAY_BASE_URL}/v1/chat/completions",
                json=payload
            )
            response.raise_for_status()
            result = response.json()

            # 解析 AI 返回的 JSON（使用正则提取，兼容思考过程）
            message = result["choices"][0]["message"]
            ai_content = message.get("content") or message.get("reasoning", "")
            
            if not ai_content:
                raise ValueError("AI 返回内容为空")
            
            # 使用正则提取 suggestions 字段
            suggestions = extract_json_field(ai_content, "suggestions")
            if not suggestions:
                raise ValueError("无法提取 suggestions 字段")

            return {
                "success": True,
                "suggestions": suggestions,
                "usage": result.get("usage", {}),
            }
    except httpx.HTTPError as e:
        return {
            "success": False,
            "suggestions": [],
            "error": f"Gateway 调用失败：{str(e)}",
        }
    except Exception as e:
        return {
            "success": False,
            "suggestions": [],
            "error": f"AI 分析失败：{str(e)}",
        }


async def ai_generate_template_via_gateway(
    product_name: str,
    product_type: str,
    style: str,
    transition_count: int,
    selling_points: str = "",
    target_audience: str = "",
    model_name: str = None,
) -> Dict[str, Any]:
    """
    通过 Gateway 调用 vLLM AI 生成模板

    Args:
        product_name: 产品名称
        product_type: 产品类型（如：滋补品、电子产品、服装等）
        style: 风格（direct_sale/premium/social_review/explainer）
        transition_count: 转场数量
        selling_points: 核心卖点（可选）
        target_audience: 目标人群（可选）
        model_name: 模型名称（可选）

    Returns:
        {
            "success": bool,
            "template": {  # AI 生成的模板
                "name": str,
                "description": str,
                "category": str,
                "segments": [...],
                "style": {...}
            },
            "usage": {...},
            "error": str
        }
    """
    style_descriptions = {
        "direct_sale": "直接促销型，热情洋溢，强调优惠和购买冲动，适合快速带货",
        "premium": "高端品质型，优雅有格调，强调生活品味，适合高端产品",
        "social_review": "种草推荐型，真实分享感受，像朋友推荐，适合口碑传播",
        "explainer": "讲解说明型，专业详细，解答用户疑问，适合复杂产品",
    }

    system_prompt = """你是一位专业的短视频模板设计专家。
请根据用户输入的产品类型和风格，生成一个完整的视频模板结构。

【输出格式要求】
- 必须返回纯 JSON 格式，不要包含任何 Markdown 代码块（如 ```json ... ```）
- 如果有思考过程，请放在 JSON **之后**
- **必须先输出完整的 JSON 对象，再输出其他内容**

JSON 必须包含以下字段：
- name: 模板名称（格式：{产品类型}·{风格简称}）
- description: 模板描述（一句话说明适用场景）
- category: 分类（根据产品类型选择：滋补保健/数码科技/时尚穿搭/美食推荐/美妆护肤/通用）
- segments: 段落结构数组，每个段落包含 flag（hook/transition/ending）和 note（说明）
- style: 文案风格配置，包含 hook（开场文案模板）和 ending（结尾文案模板），支持{product}变量

要求：
1. 必须包含 1 个 hook 开场段落和 1 个 ending 结尾段落
2. 中间包含指定数量的 transition 转场段落
3. 开场和结尾文案要符合指定风格，口语化，适合短视频节奏"""

    user_prompt = f"""请生成一个短视频模板：

【产品信息】
- 产品名称：{product_name}
- 产品类型：{product_type}
- 核心卖点：{selling_points or "未提供"}
- 目标人群：{target_audience or "未提供"}

【文案风格】{style_descriptions.get(style, style)}
【转场数量】{transition_count} 个

请根据以上产品信息，生成包含开场、{transition_count}个转场、结尾的完整模板结构。开场和结尾文案要体现产品卖点和目标人群特点。"""

    payload = {
        "model": model_name or os.getenv("MODEL_NAME", "Qwen/Qwen3.5-397B-A17B-FP8"),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 8000,  # 增加 token 限制，确保 JSON 完整输出
        "stream": False,
        "response_format": {"type": "json_object"},
        # 关闭思考模式，因为我们需要 JSON 输出而不是思考过程
        "extra_body": {
            "enable_thinking": False,
            "thinking_enabled": False,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{GATEWAY_BASE_URL}/v1/chat/completions",
                json=payload
            )
            print(f"[DEBUG] Gateway 响应状态码：{response.status_code}")
            print(f"[DEBUG] Gateway 响应内容：{response.text[:500]}")
            response.raise_for_status()
            result = response.json()
            print(f"[DEBUG] Gateway 返回 JSON: {result}")

            # 解析 AI 返回的 JSON（使用 extract_json_object 提取完整 JSON 对象）
            message = result["choices"][0]["message"]
            ai_content = message.get("content") or message.get("reasoning", "")
            
            if not ai_content:
                raise ValueError("AI 返回内容为空")
            
            print(f"[DEBUG] AI 返回内容：{ai_content[:500]}...")
            
            # 使用 extract_json_object 提取完整的 JSON 对象（更可靠）
            ai_response = extract_json_object(ai_content)
            
            if not ai_response:
                print(f"[DEBUG] extract_json_object 失败，回退到 extract_json_field")
                # 回退到字段提取（allow_partial=True 处理截断的 JSON）
                ai_response = {
                    "name": extract_json_field(ai_content, "name", allow_partial=True),
                    "description": extract_json_field(ai_content, "description", allow_partial=True),
                    "category": extract_json_field(ai_content, "category", allow_partial=True),
                    "segments": extract_json_field(ai_content, "segments", allow_partial=True),
                    "style": extract_json_field(ai_content, "style", allow_partial=True),
                }
            
            print(f"[DEBUG] 提取的 AI 响应：{ai_response}")
            
            # 验证必要字段
            if not ai_response or not ai_response.get("segments"):
                print(f"[DEBUG] segments 字段仍为空，尝试直接提取数组...")
                # 最后一次尝试：直接提取 segments 数组
                segments = extract_json_field(ai_content, "segments", allow_partial=True)
                if segments:
                    ai_response["segments"] = segments
                    print(f"[DEBUG] 成功提取 segments: {len(segments)} 个元素")
                
                if not ai_response.get("segments"):
                    raise ValueError("无法提取 segments 字段")

            # 添加唯一 ID
            template = {
                "id": f"ai_generated_{int(datetime.now().timestamp())}",
                "name": ai_response.get("name", f"{product_type}模板"),
                "description": ai_response.get("description", "AI 生成的模板"),
                "category": ai_response.get("category", "通用"),
                "segments": ai_response.get("segments", []),
                "style": ai_response.get("style", {"hook": "", "ending": ""}),
            }

            return {
                "success": True,
                "template": template,
                "usage": result.get("usage", {}),
            }
    except httpx.HTTPError as e:
        print(f"[ERROR] HTTP 错误：{e}")
        return {
            "success": False,
            "template": None,
            "error": f"Gateway 调用失败：{str(e)}",
        }
    except Exception as e:
        print(f"[ERROR] 异常：{e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "template": None,
            "error": f"AI 生成失败：{str(e)}",
        }
