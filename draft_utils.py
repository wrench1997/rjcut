from typing import Dict, List, Any
from datetime import datetime
import os
import httpx
import json

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
    custom_prompt: str = "",
) -> Dict[str, Any]:
    """
    通过 Gateway 调用 vLLM AI 生成口播文案

    Args:
        product_name: 产品名称
        selling_points: 产品卖点
        target_audience: 目标人群
        tone: 文案风格 (direct_sale/premium/social_review/explainer/shakespeare/...)
        template_structure: 模板结构（包含 segments 定义）
        model_name: 模型名称（可选，默认使用 Gateway 配置的模型）
        custom_prompt: 创作者自定义的文案提示词（可选，如果提供则优先使用）

    Returns:
        {
            "success": bool,
            "segments": [...],  # AI 生成的文案段落
            "usage": {...},     # Token 使用情况
            "error": str        # 错误信息（如果有）
        }
    """
    # 文案风格描述（供前端参考）
    tone_descriptions = {
        "direct_sale": "🔥 直接促销型 - 热情洋溢，强调优惠和购买冲动，适合直播带货",
        "premium": "💎 高端品质型 - 优雅有格调，强调生活品味，适合奢侈品/高端产品",
        "social_review": "📝 种草推荐型 - 真实分享感受，像朋友推荐，适合小红书/抖音",
        "explainer": "📖 讲解说明型 - 专业详细，解答用户疑问，适合科普/功能型产品",
        "shakespeare": "🎭 文艺诗意型 - 文艺优雅，富有诗意和哲理，适合品牌故事",
        "humorous": "😄 幽默风趣型 - 轻松搞笑，让人会心一笑，适合年轻群体",
        "emotional": "💕 情感共鸣型 - 温暖走心，触动内心柔软处，适合情感营销",
        "story": "📚 故事叙述型 - 用故事串联产品，引人入胜，适合品牌宣传",
        "comparison": "⚖️ 对比评测型 - 前后对比/竞品对比，突出优势，适合功能性产品",
        "urgent": "⏰ 限时抢购型 - 强调时间紧迫/库存有限，制造稀缺感，适合促销活动",
        "expert": "👨‍⚕️ 专家背书型 - 专业权威口吻，增强信任感，适合保健/科技产品",
        "user_voice": "🗣️ 用户心声型 - 模拟真实用户反馈，增强可信度，适合口碑营销",
        "farm_direct": "🦌 鹿场直销型 - 东北鹿场老板口吻，强对比 + 防踩坑 + 科普，适合农产品/滋补品",
    }

    system_prompt = """你是一位专业的短视频口播文案创作专家，擅长创作面向大众消费者的带货文案。

【文案风格要求】
1. 口语化、接地气，像朋友聊天一样自然
2. 面向普通大众消费者，不要用专业术语
3. 突出产品功效和实际好处，让用户听得懂
4. 有感染力和号召力，能激发购买欲望
5. 符合短视频节奏，每句话简短有力
6. hook 开场要抓人眼球，ending 结尾要促单
7. 文案要连贯流畅，段落之间自然衔接，形成完整的解说稿

【输出格式】
请按行输出，每一行对应一个段落的口播词。
注意：模板中的每个段落都需要生成口播文案，包括 scene 段落。
scene 段落的文案必须以"转场"开头，但要优雅自然，用意境烘托氛围，不要直白描述画面（如"转场，深山里的梅花鹿自由生长..."、"转场，每一滴都是自然的馈赠..."等）。
不要输出任何解释、段落标识，只输出纯文案内容。
"""

    # 统计所有段落数量（包括 scene，因为每个段落都需要口播文案来保持连贯）
    text_segment_count = len(template_structure)
    
    # 使用创作者自定义提示词（前端负责构建完整的提示词模板）
    if custom_prompt:
        user_prompt = f"""{custom_prompt}

【模板结构】
{template_structure}

【任务】
模板结构中共有 {text_segment_count} 个段落，每个段落都需要生成口播文案。
请按顺序输出 {text_segment_count} 行文案，每行对应一个段落。

【重要说明】
- 每一行文案对应一个段落
- scene 段落必须以"转场"开头，但要优雅自然，用意境烘托氛围
- 文案要连贯流畅，段落之间自然衔接
"""
    else:
        # 默认风格：使用 tone 参数
        user_prompt = f"""请为以下产品创作文案。

【产品信息】
- 产品名称：{product_name}
- 核心卖点：{selling_points}
- 目标人群：{target_audience}
- 文案风格：{tone_descriptions.get(tone, tone)}

【模板结构】
{template_structure}

【任务】
模板结构中共有 {text_segment_count} 个段落，每个段落都需要生成口播文案。
请按顺序输出 {text_segment_count} 行文案，每行对应一个段落。

【重要说明】
- hook 段落：开场吸引注意力
- scene 段落：必须以"转场"开头，优雅自然地烘托氛围
- human 段落：主体内容，介绍产品
- ending 段落：结尾促单

【文案要求】
- 口语化、接地气
- 文案连贯流畅，段落之间自然衔接
"""

    payload = {
        "model": model_name or os.getenv("MODEL_NAME", "Qwen/Qwen3.5-397B-A17B-FP8"),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 10000,
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
                        # 【移除 "Line X: " 前缀】AI 可能输出 "Line 1: xxx" 格式
                        cleaned_line = re.sub(r'^Line\s*\d+\s*:\s*', '', line_stripped, flags=re.IGNORECASE)
                        cleaned_lines.append(cleaned_line)
    
    ai_index = 0

    for segment in template_structure:
        flag = segment.get("flag")
        
        # 所有段落都需要填充文案（包括 scene，因为 AI 会为每个段落生成口播词）
        if ai_index < len(cleaned_lines):
            text = cleaned_lines[ai_index]
            ai_index += 1
        else:
            text = segment.get("text", "")

        generated_segments.append({
            **segment,
            "text": text,
            "note": segment.get("note") or "",  # 直接使用原有 note，不添加后缀
        })

    return generated_segments


# 预定义的模板库（与前端 DEFAULT_TEMPLATES 保持一致）
TEMPLATE_LIBRARY = [
    {
        "id": "deer_antler_blood_v1",
        "name": "鹿茸血·口播带货",
        "description": "适合鹿茸血、营养液、滋补饮品等口播带货视频",
        "category": "滋补保健",
        "segments": [
            {"flag": "hook", "note": "开场吸引 - 数字人出镜"},
            {"flag": "scene", "note": "割二杠鹿茸 - 鹿场场景"},
            {"flag": "scene", "note": "鹿场背景 - 梅花鹿环境"},
            {"flag": "scene", "note": "鹿吃草背景 - 自然场景"},
            {"flag": "scene", "note": "鹿血倒入杯中 - 倒酒特写"},
            {"flag": "scene", "note": "灌装成瓶的鹿血酒 - 产品展示"},
            {"flag": "scene", "note": "杀鹿放血 - 制作过程"},
            {"flag": "ending", "note": "结尾引导 - 数字人出镜收尾"},
        ],
    },
    {
        "id": "health_product_v1",
        "name": "保健品·口播种草",
        "description": "适合保健品、营养补充剂、健康食品的口播种草视频",
        "category": "滋补保健",
    },
    {
        "id": "direct_sale_v1",
        "name": "直接促销型",
        "description": "适合快速促销、限时优惠类产品",
        "category": "促销",
    },
    {
        "id": "premium_v1",
        "name": "高端品质型",
        "description": "适合高端产品、品质生活类产品",
        "category": "品牌",
    },
]


async def ai_recommend_templates_via_gateway(
    product_keyword: str,
    category: str = "",
    templates: List[Dict] = None,  # 前端传来的模板库
    model_name: str = None,
) -> Dict[str, Any]:
    """
    通过 Gateway 调用 vLLM AI 推荐模板

    Args:
        product_keyword: 产品关键词
        category: 产品类目
        templates: 模板库列表（由前端传入，包含 id, name, description, category）
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
    # 使用前端传入的模板库，如果没有则使用后端默认库
    template_lib = templates if templates and len(templates) > 0 else TEMPLATE_LIBRARY
    
    if not template_lib:
        return {
            "success": False,
            "recommendations": [],
            "error": "模板库为空",
        }
    
    # 构建模板库描述（供 AI 参考）
    template_descriptions = "\n".join([
        f"{i+1}. {t.get('id') or t.get('template_id')} - {t.get('name', '未知')}: {t.get('description', '无描述')}"
        for i, t in enumerate(template_lib)
    ])
    
    # 提取所有有效模板 ID
    valid_template_ids = [t.get('id') or t.get('template_id') for t in template_lib]

    system_prompt = f"""你是一位专业的短视频模板推荐专家。
请根据用户的产品信息，从以下模板库中选择最适合的模板：

模板库：
{template_descriptions}

请严格按照以下 JSON 格式返回（不要包含任何其他内容）：
{{
    "recommendations": [
        {{
            "template_id": "模板 ID（必须是上述模板库中的 ID）",
            "score": 0.85,
            "reason": "推荐理由"
        }}
    ]
}}

注意：
- score 范围 0-1，表示匹配度
- 推荐 2-4 个模板即可
- 根据产品特性智能匹配，不要仅依赖关键词
- template_id 必须是模板库中实际存在的 ID"""

    user_prompt = f"""请为以下产品推荐合适的短视频模板：

【产品信息】
- 产品关键词：{product_keyword}
- 产品类目：{category or "未指定"}

请分析产品特性，从模板库中选择最匹配的 2-4 个模板，并给出推荐理由。"""

    payload = {
        "model": model_name or os.getenv("MODEL_NAME", "Qwen/Qwen3.5-397B-A17B-FP8"),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 15000,
        "stream": False,
        "response_format": {"type": "json_object"},
    }

    try:
        print(f"[AI 推荐] 请求 Gateway: {GATEWAY_BASE_URL}/v1/chat/completions")
        print(f"[AI 推荐] 请求 payload: {payload}")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{GATEWAY_BASE_URL}/v1/chat/completions",
                json=payload
            )
            response.raise_for_status()
            result = response.json()

            print(f"[AI 推荐] Gateway 返回：{result}")
            
            # 解析 AI 返回的 JSON
            choices = result.get("choices", [])
            if not choices:
                raise ValueError(f"Gateway 返回格式异常：缺少 choices 字段，完整响应：{result}")
            
            message = choices[0].get("message", {})
            # 优先使用 content，如果没有则尝试 reasoning（某些模型会返回思考过程）
            ai_content = message.get("content") or message.get("reasoning", "")
            
            if not ai_content:
                raise ValueError(f"AI 返回内容为空，完整 message: {message}")
            
            print(f"[AI 推荐] 原始返回内容：{ai_content[:500]}...")
            
            # 使用 extract_json_object 提取完整 JSON 对象（与 AI 生成模板相同的方法）
            parsed = extract_json_object(ai_content)
            
            if not parsed:
                raise ValueError(f"无法解析 JSON 对象，AI 返回：{ai_content[:300]}")
            
            recommendations = parsed.get("recommendations", [])
            
            if not recommendations:
                raise ValueError(f"JSON 中缺少 recommendations 字段，AI 返回：{ai_content[:300]}")
            
            # 验证推荐结果格式（允许前端模板库中的 ID 和 AI 生成的模板 ID）
            valid_recommendations = []
            current_template_ids = {t.get('id') or t.get('template_id') for t in template_lib}
            for rec in recommendations:
                if isinstance(rec, dict):
                    tid = rec.get("template_id")
                    # 允许前端模板库中的 ID，也允许 AI 生成的模板（以 ai_generated_ 开头）
                    if tid in current_template_ids or (tid and tid.startswith("ai_generated_")):
                        valid_recommendations.append({
                            "template_id": tid,
                            "score": float(rec.get("score", 0.5)),
                            "reason": rec.get("reason", ""),
                        })
            
            if not valid_recommendations:
                raise ValueError(f"AI 返回的模板 ID 无效，期望：{current_template_ids} 或 ai_generated_*，实际：{recommendations}")
            
            # 按匹配度排序
            valid_recommendations.sort(key=lambda x: x["score"], reverse=True)

            return {
                "success": True,
                "recommendations": valid_recommendations[:5],
                "usage": result.get("usage", {}),
            }

    except httpx.HTTPError as e:
        print(f"[AI 推荐] Gateway 调用失败：{e}")
        return {
            "success": False,
            "recommendations": [],
            "error": f"Gateway 调用失败：{str(e)}",
        }
    except Exception as e:
        print(f"[AI 推荐] 异常：{e}")
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

请严格按照以下 JSON 格式返回（不要包含任何其他内容）：
{
    "suggestions": [
        {
            "slot_id": "素材位 ID",
            "slot_title": "素材位标题",
            "order": 素材位序号（整数）,
            "files": [
                {
                    "name": "文件名",
                    "path": "文件路径",
                    "match_reason": "匹配理由"
                }
            ],
            "confidence": 0.85
        }
    ]
}

注意：
- order 字段必须与输入的素材位 ID 对应
- files 数组包含推荐到该素材位的文件（1-3 个）
- confidence 范围 0-1，表示匹配置信度
- match_reason 简要说明为什么推荐该文件到此素材位"""

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
        "temperature": 0.7,  # 调高温度，减少思考时间
        "max_tokens": 5000,  # 减少 max_tokens，加快响应
        "stream": False,
        "response_format": {"type": "json_object"},
        # 关闭思考模式，加快响应速度
        "extra_body": {
            "enable_thinking": False,
            "thinking_enabled": False,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            print(f"[AI 素材分析] 请求 Gateway: {GATEWAY_BASE_URL}/v1/chat/completions")
            print(f"[AI 素材分析] 请求 payload: {json.dumps(payload, ensure_ascii=False)[:500]}...")
            
            response = await client.post(
                f"{GATEWAY_BASE_URL}/v1/chat/completions",
                json=payload
            )
            print(f"[AI 素材分析] Gateway 响应状态码：{response.status_code}")
            response.raise_for_status()
            result = response.json()
            print(f"[AI 素材分析] Gateway 响应数据：{json.dumps(result, ensure_ascii=False)[:1000]}...")

            # 解析 AI 返回的 JSON（使用正则提取，兼容思考过程）
            message = result["choices"][0]["message"]
            # 兼容不同模型的返回字段：content > reasoning > reasoning_content
            ai_content = message.get("content") or message.get("reasoning", "") or message.get("reasoning_content", "")
            
            print(f"[AI 素材分析] AI 返回内容：{ai_content[:500] if ai_content else 'None'}...")
            
            if not ai_content:
                raise ValueError("AI 返回内容为空")
            
            # 使用正则提取 suggestions 字段
            suggestions = extract_json_field(ai_content, "suggestions")
            if not suggestions:
                print(f"[AI 素材分析] 提取 suggestions 失败，完整内容：{ai_content[:2000]}")
                raise ValueError("无法提取 suggestions 字段")

            return {
                "success": True,
                "suggestions": suggestions,
                "usage": result.get("usage", {}),
            }
    except httpx.HTTPError as e:
        print(f"[AI 素材分析] Gateway 调用失败：{e}")
        return {
            "success": False,
            "suggestions": [],
            "error": f"Gateway 调用失败：{str(e)}",
        }
    except Exception as e:
        print(f"[AI 素材分析] AI 分析失败：{e}")
        import traceback
        traceback.print_exc()
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
    file_names: List[str] = None,  # 新增：文件名参考列表
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

    system_prompt = """你是一位专业的短视频带货文案专家。
请根据用户输入的产品类型、风格和素材文件名，生成一个完整的视频模板结构。

【输出格式要求】
- 必须返回纯 JSON 格式，不要包含任何 Markdown 代码块（如 ```json ... ```）
- 如果有思考过程，请放在 JSON **之后**
- **必须先输出完整的 JSON 对象，再输出其他内容**

JSON 必须包含以下字段：
- name: 模板名称（格式：{产品类型}·{风格简称}）
- description: 模板描述（一句话说明适用场景）
- category: 分类（根据产品类型选择：滋补保健/数码科技/时尚穿搭/美食推荐/美妆护肤/通用）
- segments: 段落结构数组，每个段落必须包含：
  - flag: 段落类型（hook/scene/ending）
  - note: 场景说明（描述画面内容）
  - text: 该段落对应的口播文案
- style: 文案风格配置，包含 hook（开场文案模板）和 ending（结尾文案模板），支持{product}变量

【文案连贯性要求 - 非常重要】
1. 所有 segment 的 text 连起来必须是一篇完整、流畅、有逻辑的口播稿
2. 每个 scene 段落的 text 要承上启下，与前一段落自然衔接
3. 使用"转场"、"接下来"、"然后"、"大家看"等转场词连接各段落
4. 文案风格要像主播在现场讲解一样，口语化、有节奏感
5. hook 要抓人眼球，ending 要引导购买，中间 scene 要层层递进建立信任

要求：
1. 必须包含 1 个 hook 开场段落和 1 个 ending 结尾段落
2. 中间包含指定数量的 scene 段落，用于展示产品细节
3. 每个 segment 的 text 字段必须填写，形成完整连贯的口播脚本
4. 开场和结尾文案要符合指定风格，口语化，适合短视频节奏
5. 如果提供了素材文件名，请根据文件名中的关键词设计对应的场景段落和文案"""

    # 构建文件名参考文本
    file_names_text = ""
    if file_names and len(file_names) > 0:
        file_names_text = "\n".join([f"- {name}" for name in file_names])
        file_names_text = f"\n【素材文件名参考】\n{file_names_text}\n\n请分析这些文件名中的关键词（如：鹿场、倒酒、杀鹿等），为每个关键场景设计对应的 segment 段落。"
    
    user_prompt = f"""请生成一个短视频带货模板：

【产品信息】
- 产品名称：{product_name}
- 产品类型：{product_type}
- 核心卖点：{selling_points or "未提供"}
- 目标人群：{target_audience or "未提供"}

【文案风格】{style_descriptions.get(style, style)}
【转场数量】{transition_count} 个 scene 段落{file_names_text}

【文案示例 - 请参考这种连贯风格】
hook: "想买鹿茸血的家人们，这条鹿茸血和鹿血区别的视频你必须看完，否则你可就要上当啦！"
scene1: "鹿茸血是梅花鹿身上的一个器官，每年六月到八月期间，当我们割下鹿茸时，这个流淌出来的血就是鹿茸血。它的营养价值极高，因为鹿茸割下后，它还能再次生长出来。"
scene2: "这是因为鹿茸血的血液非常神奇。而鹿血酒呢，是在杀鹿时从血管中流出来的血，就像我们杀猪杀鸡时流出来的血一样。"
scene3: "虽然它和鹿茸血只相差一个字，但营养价值差异可大得多，所以懂行的人都更青睐鹿茸血。"
ending: "老妹家自家鹿场养了 1000 头梅花鹿，无论是鹿茸血还是鹿血，我们家都有。只要是我们的粉丝来，全部是地板价哦！"

【重要要求】
1. 每个 segment 必须包含 text 字段，填写对应的口播文案
2. 所有 segment 的 text 连起来应该是一篇完整、连贯的口播稿，像主播在现场讲解
3. scene 段落不要留空 text，要根据画面内容写对应的解说词，承上启下
4. 文案要自然流畅，段落之间用自然的语气连接（不要出现"转场"字样）
5. 开场要抓人眼球，结尾要引导购买，中间场景要层层递进建立信任"""

    payload = {
        "model": model_name or os.getenv("MODEL_NAME", "Qwen/Qwen3.5-397B-A17B-FP8"),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 10000,  # 增加 token 限制，确保 JSON 完整输出
        "stream": False,
        "response_format": {"type": "json_object"},
        # 关闭思考模式，因为我们需要 JSON 输出而不是思考过程
        "extra_body": {
            "enable_thinking": False,
            "thinking_enabled": False,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=160.0) as client:
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
