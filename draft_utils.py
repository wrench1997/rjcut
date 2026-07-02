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

    system_prompt = """你是一位专业的短视频口播文案创作专家。
请根据产品信息和模板结构，创作符合指定风格的口播文案。

要求：
1. 文案要口语化、自然流畅
2. 符合指定的风格调性
3. 突出产品卖点和优势
4. 控制每段文案长度，适合短视频节奏"""

    user_prompt = f"""请为以下产品创作口播文案：

【产品信息】
- 产品名称：{product_name}
- 核心卖点：{selling_points}
- 目标人群：{target_audience}
- 文案风格：{tone_descriptions.get(tone, tone)}

【模板结构】
{template_structure}

请按照模板结构中的 human 段落位置，生成对应的口播文案。保持其他非 human 段落不变。
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

            # 解析返回结果
            ai_text = result["choices"][0]["message"]["content"]

            # 将 AI 生成的文案填充到模板结构中
            generated_segments = parse_ai_script_to_segments(ai_text, template_structure)

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


def parse_ai_script_to_segments(ai_text: str, template_structure: List[Dict]) -> List[Dict]:
    """
    将 AI 生成的文案解析并填充到模板结构中

    简单实现：按行分割，依次填充到 human 段落
    实际项目中可以根据 AI 返回的结构化数据更精确匹配
    """
    import re

    generated_segments = []
    ai_lines = [line.strip() for line in ai_text.split('\n') if line.strip()]
    ai_index = 0

    for segment in template_structure:
        if segment.get("flag") == "human":
            # 从 AI 文案中取一行作为该段落的文案
            if ai_index < len(ai_lines):
                text = ai_lines[ai_index]
                ai_index += 1
            else:
                text = segment.get("text", "")

            generated_segments.append({
                **segment,
                "text": text,
                "note": (segment.get("note") or "") + "（AI 生成）",
            })
        else:
            # 非 human 段落保持原样
            generated_segments.append(segment)

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

            # 解析 AI 返回的 JSON
            import json
            ai_content = result["choices"][0]["message"]["content"]
            ai_response = json.loads(ai_content)

            recommendations = ai_response.get("recommendations", [])

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

            # 解析 AI 返回的 JSON
            import json
            ai_content = result["choices"][0]["message"]["content"]
            ai_response = json.loads(ai_content)

            suggestions = ai_response.get("suggestions", [])

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

请以 JSON 格式返回，包含以下字段：
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
        "max_tokens": 2000,
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

            # 解析 AI 返回的 JSON
            import json
            message = result["choices"][0]["message"]
            ai_content = message.get("content")
            
            # 如果 content 为空，尝试从 reasoning 字段获取（兼容模式）
            if not ai_content:
                ai_content = message.get("reasoning", "")
                print(f"[DEBUG] content 为空，使用 reasoning 字段")
            
            print(f"[DEBUG] AI 返回内容：{ai_content[:500] if ai_content else 'None'}")
            
            if not ai_content:
                raise ValueError("AI 返回内容为空")
            
            ai_response = json.loads(ai_content)

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
