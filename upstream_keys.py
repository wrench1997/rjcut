"""上游服务 API Key 解析。

上游 GenVideos 网关（H3 文生视频 / DeepSeek 文案）与蝉镜数字人各自需要凭据。
由于尚未做统一管控，这些凭据优先由桌面端（exe）在设置页填写后通过请求头
透传到后端；请求头未提供时，回退到 .env / docker-compose 里的环境变量。

约定请求头：
  - X-H3-Api-Key / X-Genvideos-Api-Key   → H3 文生视频
  - X-Deepseek-Api-Key / X-Genvideos-Api-Key → DeepSeek 文案
  - X-Chanjing-App-Id / X-Chanjing-Secret-Key → 蝉镜数字人

H3 与 DeepSeek 在 GenVideos 网关上共用一把用户 Key（同一账号同时具备两项
权限），因此默认用同一个 X-Genvideos-Api-Key；若日后拆分账号，可分别用
X-H3-Api-Key 与 X-Deepseek-Api-Key 覆盖。
"""
from __future__ import annotations

from typing import Optional, Tuple

from fastapi import Request

from config import get_settings


def _header(request: Optional[Request], *names: str) -> Optional[str]:
    """按优先级从请求头读取第一个非空值。"""
    if request is None:
        return None
    headers = getattr(request, "headers", None)
    if not headers:
        return None
    for name in names:
        value = headers.get(name)
        if value and value.strip():
            return value.strip()
    return None


def get_h3_key(request: Optional[Request] = None) -> str:
    """H3 文生视频上游 Key：请求头优先，环境变量兜底。"""
    settings = get_settings()
    return (
        _header(request, "X-H3-Api-Key", "X-Genvideos-Api-Key")
        or (settings.GENVIDEOS_API_KEY or "")
    )


def get_deepseek_key(request: Optional[Request] = None) -> str:
    """DeepSeek 文案上游 Key：请求头优先，环境变量兜底。"""
    settings = get_settings()
    return (
        _header(request, "X-Deepseek-Api-Key", "X-Genvideos-Api-Key")
        or (settings.GENVIDEOS_API_KEY or "")
    )


def get_chanjing_creds(request: Optional[Request] = None) -> Tuple[str, str]:
    """蝉镜数字人凭据：(app_id, secret_key)，请求头优先，环境变量兜底。"""
    settings = get_settings()
    app_id = _header(request, "X-Chanjing-App-Id") or (settings.CHANJING_APP_ID or "")
    secret = _header(request, "X-Chanjing-Secret-Key") or (settings.CHANJING_SECRET_KEY or "")
    return app_id, secret
