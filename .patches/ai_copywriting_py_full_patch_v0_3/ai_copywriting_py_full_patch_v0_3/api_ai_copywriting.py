"""FastAPI routes for AI copywriting and char-timing timeline."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from auth import verify_api_key
from models import Merchant

from ai_copywriting_timeline import (
    list_prompt_presets,
    validate_user_prompt,
    call_gateway_for_script,
    build_timeline_from_script,
)

router = APIRouter(prefix="/v1/ai-copywriting", tags=["AI Copywriting"])


def ok(data=None):
    return {"code": 0, "message": "ok", "data": data}


def fail(code: int, message: str, status_code: int = 400, data=None):
    return JSONResponse(
        status_code=status_code,
        content={"code": code, "message": message, "data": data},
    )


@router.get("/presets")
def get_presets(_: Merchant = Depends(verify_api_key)):
    """获取广告文案预设提示词。"""
    return ok({"presets": list_prompt_presets()})


@router.post("/validate-prompt")
async def validate_prompt(request: Request, _: Merchant = Depends(verify_api_key)):
    """只校验用户自定义提示词，不调用模型。"""
    try:
        body = await request.json()
    except Exception:
        return fail(40001, "无效的 JSON 请求体")
    text = body.get("user_style_prompt") or body.get("custom_prompt") or body.get("prompt") or ""
    return ok(validate_user_prompt(text))


@router.post("/generate-plan")
async def generate_plan(request: Request, _: Merchant = Depends(verify_api_key)):
    """
    生成结构化文案：
    - script.spoken_text 给数字人朗读，严禁包含“转场”。
    - script.segments / script.transition_plan 给后续 timeline 使用。
    - legacy_segments 兼容旧前端，但不会返回 flag=transition，避免再插入【转场】。
    """
    try:
        body = await request.json()
    except Exception:
        return fail(40001, "无效的 JSON 请求体")

    custom_prompt = body.get("user_style_prompt") or body.get("userStylePrompt") or body.get("custom_prompt") or ""
    check = validate_user_prompt(custom_prompt)
    if not check["ok"]:
        return fail(40010, "用户自定义提示词命中过滤规则", data=check)

    try:
        result = await call_gateway_for_script(body)
    except Exception as exc:
        return fail(50001, f"AI 生成失败：{exc}", status_code=500)

    return ok(result)


@router.post("/build-timeline")
async def build_timeline(request: Request, _: Merchant = Depends(verify_api_key)):
    """根据数字人返回的字级时间轴，把 script.transition_after 转换成毫秒级 timeline.clips。"""
    try:
        body = await request.json()
    except Exception:
        return fail(40001, "无效的 JSON 请求体")

    script = body.get("script") or {}
    char_timings = body.get("char_timings") or body.get("charTimings") or []
    material_library = body.get("material_library") or body.get("materialLibrary") or []

    if not script.get("spoken_text"):
        return fail(40002, "script.spoken_text 不能为空")
    if not char_timings:
        return fail(40003, "char_timings 不能为空")

    timeline = build_timeline_from_script(script, char_timings, material_library)
    return ok({"timeline": timeline})
