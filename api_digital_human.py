# api_digital_human.py
import uuid
import logging
import os
import time
import urllib.parse
import ipaddress
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from rq import Queue

from database import get_db
from models import Merchant, Task, TaskStatus, ApiKey
from auth import verify_api_key
from quota import check_quota, check_concurrent_limit, reserve_quota
from config import get_settings
from chanjing_api_v2 import create_chanjing_api_v2, ChanjingStatusCode, APIError
from schemas import DhGenerateVideoRequest
from schemas import DhCreateCustomPersonRequest
from models import DhCustomPerson # 引入模型
from oss import get_minio_client, get_settings as get_oss_settings


router = APIRouter(prefix="/v1/dh", tags=["Digital Human"])

# 🔴 单例模式：缓存 API 客户端，避免重复获取 access_token
_chanjing_api_instance = None

def get_chanjing_api():
    """获取蝉镜 API 客户端（使用 V2 增强版，传统模式）- 单例模式"""
    global _chanjing_api_instance
    
    if _chanjing_api_instance is None:
        settings = get_settings()
        base_url = _require_public_url(
            settings.CHANJING_BASE_URL,
            "CHANJING_BASE_URL",
            allow_private=settings.ALLOW_PRIVATE_CHANJING,
        )
        _chanjing_api_instance = create_chanjing_api_v2(
            app_id=settings.CHANJING_APP_ID,
            secret_key=settings.CHANJING_SECRET_KEY,
            config={
                "timeout": 60,
                "max_retries": 3,
                "enable_cache": True,
                "enable_stats": True,
                "auto_auth": False,
                # 🐳 统一使用 Settings 读取地址，确保 .env 和 Docker environment 不会被忽略。
                "base_url": base_url,
            }
        )
        logger = logging.getLogger("chanjing")
        logger.info(f"✅ 蝉镜 API 客户端已初始化（单例），base_url={_chanjing_api_instance.base_url}")
    
    return _chanjing_api_instance

def ok(data=None): return {"code": 0, "message": "ok", "data": data}
def fail(code, msg, status_code=400): return {"code": code, "message": msg}

def _require_public_url(url: str | None, name: str, allow_private: bool = False) -> str:
    """只允许可配置的公网 URL，拒绝空值和明显内网地址。"""
    raw_url = (url or "").strip()
    if not raw_url:
        raise RuntimeError(f"{name} 未配置（请设置可公网访问的 URL）")

    parsed = urllib.parse.urlparse(raw_url if "://" in raw_url else f"//{raw_url}")
    host = (parsed.hostname or "").strip().lower()
    if not host:
        raise RuntimeError(f"{name} 地址格式无效：{raw_url}")

    try:
        host_ip = ipaddress.ip_address(host)
    except ValueError:
        host_ip = None

    if (
        host in {"localhost", "127.0.0.1"}
        or (host_ip is not None and (host_ip.is_private or host_ip.is_loopback))
    ):
        if allow_private:
            return raw_url.rstrip("/")
        raise RuntimeError(f"{name} 当前为内网/回环地址，不允许用于公网访问：{raw_url}")

    return raw_url.rstrip("/")

def _normalize_chanjing_files_path(path: str) -> str | None:
    """把蝉镜内部文件路径转换为文件服务路径：/files/..."""
    if path.startswith("/files/"):
        return path
    if path.startswith("/root/MuseTalk/data/"):
        return f"/files{path[len('/root/MuseTalk'):]}"
    if path.startswith("/app/data/"):
        return f"/files{path[len('/app'):]}"
    if path.startswith("/data/"):
        return f"/files{path}"
    return None


def _first_non_empty(value, fallback=None):
    if isinstance(value, str):
        stripped = value.strip()
        if stripped and stripped.lower() not in {"null", "none", "undefined"}:
            return stripped
    if value:
        return value
    return fallback


def _extract_audio_man_id(payload):
    if payload is None or not isinstance(payload, dict):
        return ''
    return (
        _first_non_empty(payload.get("audio_man_id"), '') or
        _first_non_empty(payload.get("audio_id"), '') or
        _first_non_empty(payload.get("audio_man"), '') or
        _first_non_empty(payload.get("voice_id"), '') or
        _first_non_empty(payload.get("voiceId"), '')
    )


def _to_public_media_url(path: str) -> str:
    """将内部可见路径转换为前端可通过后端 /dh 路由访问的公共 URL。"""
    if not path:
        return ""
    mapped = _normalize_chanjing_files_path(path)
    if mapped:
        return mapped
    if path.startswith(("http://", "https://", "data:")):
        return path
    if len(path) >= 3 and path[1] == ":" and path[2] in ('/', '\\'):
        return path
    return f"/v1/dh/proxy-image?path={urllib.parse.quote(path, safe='')}"


def _upstream_error_response(operation: str, exc: Exception, logger):
    """把上游故障变成可观测的 502，而不是让前端误显示为空列表。"""
    if isinstance(exc, APIError):
        upstream_code = exc.code
        detail = exc.message or str(exc)
        error_type = exc.error_type.value
        endpoint = exc.endpoint
        logger.error(
            "数字人上游失败 operation=%s type=%s code=%s endpoint=%s detail=%r",
            operation,
            error_type,
            upstream_code,
            endpoint,
            detail,
        )
        message = f"{operation}失败：{detail}"
    else:
        upstream_code = None
        logger.exception("数字人上游异常 operation=%s", operation)
        message = f"{operation}失败：{str(exc) or '未知服务器异常'}"

    content = {
        "code": 50200,
        "message": message,
        "data": None,
        "upstream_code": upstream_code,
    }
    return JSONResponse(status_code=502, content=content)


@router.get("/health")
def digital_human_health(_: Merchant = Depends(verify_api_key)):
    """探测数字人上游和 token 链路，供部署探针或人工排障使用。"""
    logger = logging.getLogger("uvicorn.error")
    started_at = time.perf_counter()
    try:
        api = get_chanjing_api()
        result = api.list_common_digital_persons(page=1, size=1, use_cache=False)
        latency_ms = round((time.perf_counter() - started_at) * 1000, 2)
        upstream_code = result.get("code") if isinstance(result, dict) else None
        if upstream_code not in (None, 0):
            logger.error(
                "数字人健康探测失败 code=%s msg=%r latency_ms=%s",
                upstream_code,
                result.get("msg") or result.get("message"),
                latency_ms,
            )
            return JSONResponse(
                status_code=503,
                content={
                    "code": 50301,
                    "message": "数字人上游返回异常",
                    "data": {
                        "status": "degraded",
                        "latency_ms": latency_ms,
                        "upstream_code": upstream_code,
                    },
                },
            )

        persons = (result.get("data") or {}).get("list", []) if isinstance(result, dict) else []
        return ok({
            "status": "ok",
            "upstream": "ok",
            "latency_ms": latency_ms,
            "sample_count": len(persons) if isinstance(persons, list) else 0,
        })
    except APIError as e:
        return _upstream_error_response("数字人健康探测", e, logger)
    except Exception as e:
        return _upstream_error_response("数字人健康探测", e, logger)

# ----- 1. 获取基础资源接口 (透传蝉镜API) -----

@router.get("/persons/common")
def list_common_persons(merchant: Merchant = Depends(verify_api_key)):
    """获取公共数字人列表（包含所有可选形象类型）"""
    import logging
    import json
    from fastapi import Request
    from urllib.parse import urlencode
    
    logger = logging.getLogger("uvicorn.error")
    try:
        api = get_chanjing_api()
        res = api.list_common_digital_persons(page=1, size=100, use_cache=True)
        
        # 🔍 详细打印蝉镜 API 返回数据
        logger.info(f"🔍 蝉镜 API 原始返回：{json.dumps(res, ensure_ascii=False)[:500]}")
        
        # 检查蝉镜 API 返回状态码（兼容 code 为 None 的情况）
        api_code = res.get('code')
        api_msg = res.get('msg', 'ok')
        logger.info(f"🔍 蝉镜 API 响应：code={api_code}, msg={api_msg}")
        
        if api_code is not None and api_code != 0:
            error_msg = res.get('msg', '获取数字人列表失败')
            logger.error(f"蝉镜 API 返回错误：{error_msg} (code: {api_code})")
            return JSONResponse(
                status_code=502,
                content={
                    "code": 50201,
                    "message": f"蝉镜 API 错误：{error_msg}",
                    "data": None,
                    "upstream_code": api_code,
                },
            )
        elif api_code is None:
            logger.warning(f"蝉镜 API 返回 code=None，但继续处理（可能是旧版 API）")
    except APIError as e:
        return _upstream_error_response("获取公共数字人", e, logger)
    except Exception as e:
        return _upstream_error_response("获取公共数字人", e, logger)
    
    persons = res.get("data", {}).get("list", [])
    logger.info(f"🔍 提取到公共数字人数量：{len(persons)}")
    if persons:
        logger.info(f"🔍 第一个数字人示例：{json.dumps(persons[0], ensure_ascii=False)[:300]}")
    
    # 获取商户的 API Key（用于生成代理 URL）
    api_key_raw = None
    try:
        db = next(get_db())
        user_api_key = db.query(ApiKey).filter(ApiKey.merchant_id == merchant.id, ApiKey.is_active == True).first()
        if user_api_key:
            # 从原始 key_hash 反向查找不太可能，这里使用商户信息中的 key
            # 实际上我们需要从 request header 获取原始 API Key
            pass
    except:
        pass
    
    # 返回完整的数字人信息，包含所有可选的 figures
    result_list = []
    for person in persons:
        person_id = person.get("id", "")
        person_name = person.get("name", "")
        audio_man_id = _extract_audio_man_id(person)
        figures = person.get("figures", [])
        
        # 提取所有可选的 figure_type 列表
        available_figure_types = [fig.get("type", "") for fig in figures if fig.get("type")]
        
        # 🎭 从 figures 中获取第一个有 cover 的 figure
        original_cover_url = ""
        preview_video_url = ""
        figure_type = "whole_body"
        
        # 🔍 调试日志
        logger = logging.getLogger("uvicorn.error")
        if figures:
            logger.info(f"数字人：{person_name}, figures count={len(figures)}")
            logger.info(f"  figures[0]: {figures[0] if len(figures) > 0 else 'empty'}")
        
        if figures and len(figures) > 0:
            # 找第一个有 cover 的 figure
            for fig in figures:
                if fig.get("cover"):
                    original_cover_url = fig.get("cover", "")
                    preview_video_url = fig.get("preview_video_url", "")
                    figure_type = fig.get("type", "whole_body")
                    break
            # 如果都没有 cover，使用第一个 figure
            if not original_cover_url and figures[0]:
                original_cover_url = figures[0].get("cover", "")
                preview_video_url = figures[0].get("preview_video_url", "")
                figure_type = figures[0].get("type", "whole_body")
        
        # 如果 figures 为空，尝试从 person 直接获取封面（兼容旧数据）
        if not original_cover_url:
            original_cover_url = person.get("cover_url", "")
            preview_video_url = person.get("preview_video_url", "")
        
        # 🔗 蝉镜返回的 cover 可能是本地路径或 HTTP URL，需要转换为代理 URL
        # 让前端能通过 /v1/dh/proxy-image 接口访问，避免跨域问题
        # 支持 Linux 路径（/root/, /data/, /app/）和 Windows 路径（D:/, D:\）
        if original_cover_url:
            is_local_path = (
                original_cover_url.startswith('/root/') or 
                original_cover_url.startswith('/data/') or 
                original_cover_url.startswith('/app/') or
                original_cover_url.startswith('http://') or
                original_cover_url.startswith('https://') or
                # Windows 路径：盘符 + 冒号 + 斜杠（如 D:/ 或 D:\）
                (len(original_cover_url) >= 3 and original_cover_url[1] == ':' and original_cover_url[2] in ('/', '\\'))
            )
            if is_local_path:
                # 转换为代理 URL，让前端能通过 /v1/dh/proxy-image 接口访问
                cover_url = _to_public_media_url(original_cover_url)
                logger.info(f"封面 URL 转换为媒体 URL: {cover_url}")
            else:
                cover_url = original_cover_url
        else:
            cover_url = ""
        
        result_list.append({
            "id": person_id,
            "name": person_name,
            "person_id": person_id,
            "figure_type": figure_type,
            "available_figure_types": available_figure_types,
            "cover_url": cover_url,
            "preview_video_url": preview_video_url,
            "audio_man_id": audio_man_id,
            "gender": person.get("gender", ""),
            "figures": figures,
        })
    
    return ok(result_list)

@router.get("/persons/common/{person_id}")
def get_common_person_detail(
    person_id: str,
    _: Merchant = Depends(verify_api_key)
):
    """获取单个公共数字人的详细信息（包含可用动作/形象）"""
    import logging
    logger = logging.getLogger("uvicorn.error")
    api = get_chanjing_api()
    
    # 蝉镜 API 没有直接的公共数字人详情接口，需要从列表中筛选
    # 或者调用 list_common_digital_persons 并找到对应的 person
    res = api.list_common_digital_persons(page=1, size=100, use_cache=True)
    
    if not res or "data" not in res:
        return fail(50000, "failed to fetch person details", status_code=500)
    
    persons = res.get("data", {}).get("list", [])
    
    # 找到匹配的 person_id
    target_person = None
    for person in persons:
        if person.get("id") == person_id:
            target_person = person
            break
    
    if not target_person:
        return fail(40400, "person not found", status_code=404)
    
    figures = target_person.get("figures", [])
    available_figure_types = [fig.get("type", "") for fig in figures if fig.get("type")]
    
    # 获取封面和预览视频
    cover_url = ""
    preview_video_url = ""
    figure_type = "whole_body"
    
    if figures and len(figures) > 0:
        for fig in figures:
            if fig.get("cover"):
                cover_url = fig.get("cover", "")
                preview_video_url = fig.get("preview_video_url", "")
                figure_type = fig.get("type", "whole_body")
                break
        if not cover_url and figures[0]:
            cover_url = figures[0].get("cover", "")
            preview_video_url = figures[0].get("preview_video_url", "")
            figure_type = figures[0].get("type", "whole_body")
    
    if not cover_url:
        cover_url = target_person.get("cover_url", "")
        preview_video_url = target_person.get("preview_video_url", "")
    
    # 🔗 将本地路径转换为代理 URL（支持 Linux 和 Windows 路径）
    if cover_url:
        is_local_path = (
            cover_url.startswith('/root/') or 
            cover_url.startswith('/data/') or 
            cover_url.startswith('/app/') or
            # Windows 路径：盘符 + 冒号 + 斜杠
            (len(cover_url) >= 3 and cover_url[1] == ':' and cover_url[2] in ('/', '\\'))
        )
        if is_local_path:
            cover_url = _to_public_media_url(cover_url)
            logger.info(f"详情页本地封面路径转换为代理 URL: {cover_url}")
    
    result = {
        "id": person_id,
        "name": target_person.get("name", ""),
        "person_id": person_id,
        "figure_type": figure_type,
        "available_figure_types": available_figure_types,
        "cover_url": cover_url,
        "preview_video_url": preview_video_url,
        "audio_man_id": _extract_audio_man_id(target_person),
        "gender": target_person.get("gender", ""),
        "figures": figures,
    }
    
    return ok(result)




# @router.get("/persons/custom")
# def list_custom_persons(_: Merchant = Depends(verify_api_key)):
#     api = get_chanjing_api()
#     res = api.list_customised_persons()
#     return ok(res.get("data", {}).get("list", []))



@router.get("/persons/custom")
def list_custom_persons(
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """获取商户自己训练的私有数字人列表（数据隔离）"""
    import logging
    logger = logging.getLogger("uvicorn.error")
    
    persons = (
        db.query(DhCustomPerson)
        .filter(DhCustomPerson.merchant_id == merchant.id)
        .order_by(DhCustomPerson.created_at.desc())
        .all()
    )
    
    # 🔍 打印自定义数字人详细信息
    logger.info(f"===== 自定义数字人列表 (商户：{merchant.id}) =====")
    logger.info(f"查询到 {len(persons)} 个自定义数字人")
    
    # 获取 MinIO 配置用于生成封面图 URL
    oss_settings = get_oss_settings()
    minio_client = get_minio_client()
    bucket = oss_settings.MINIO_BUCKET
    
    result_list = []
    for i, p in enumerate(persons):
        audio_man_id = _first_non_empty(p.audio_man_id, '')
        cover_url = p.cover_url
        logger.info(f"\n--- 数字人 [{i+1}/{len(persons)}] ---")
        logger.info(f"  ID: {p.chanjing_person_id}")
        logger.info(f"  名字：{p.name}")
        logger.info(f"  状态：{p.status}")
        logger.info(f"  原始 cover_url: {p.cover_url}")
        logger.info(f"  figure_type: {p.figure_type}")
        logger.info(f"  audio_man_id: {p.audio_man_id}")
        
        # 🎬 如果数据库中没有封面，尝试从蝉镜 API 动态获取
        detail_fetched = False
        if not cover_url:
            logger.info(f"  *** 数据库无封面，尝试从蝉镜 API 获取详情...")
            try:
                api = get_chanjing_api()
                # 🐌 使用缓存降低并发，但封面获取场景可以不用缓存（因为只在没有封面时调用）
                detail_resp = api.get_customised_person_status(p.chanjing_person_id, use_cache=False)
                logger.info(f"  *** 蝉镜 API 返回：code={detail_resp.get('code')}, data={detail_resp.get('data', {})}")
                if ChanjingStatusCode.is_success(detail_resp.get('code')):
                    detail_fetched = True
                    detail_data = detail_resp.get('data', {})
                    if not audio_man_id:
                        audio_man_id = _extract_audio_man_id(detail_data)
                        if audio_man_id:
                            try:
                                p.audio_man_id = audio_man_id
                                db.add(p)
                                db.commit()
                                logger.info(f"  ✅ 已同步数字人原生音色：{audio_man_id}")
                            except Exception as update_err:
                                logger.warning(f"  ⚠️ 音色信息回填失败：{update_err}")
                                db.rollback()
                    cover_url = detail_data.get('pic_url', '') or detail_data.get('preview_url', '') or detail_data.get('cover_url', '')
                    logger.info(f"  *** cover_url 提取结果：{cover_url[:80] if cover_url else 'None'}...")
                    if cover_url:
                        logger.info(f"  *** ✅ 从蝉镜 API 获取到封面！")
                        # 异步更新数据库（不阻塞响应）
                        try:
                            p.cover_url = cover_url
                            p.figure_type = detail_data.get('type', '') or p.figure_type
                            db.add(p)
                            db.commit()
                        except Exception as update_err:
                            logger.warning(f"  *** ⚠️ 更新数据库失败：{update_err}")
                            db.rollback()
                    else:
                        logger.error(f"  *** ❌ 蝉镜 API 也无封面字段，data keys={list(detail_data.keys())}")
            except Exception as e:
                logger.error(f"  *** ❌ 调用蝉镜 API 失败：{e}")

        if not audio_man_id and not detail_fetched:
            try:
                api = get_chanjing_api()
                detail_resp = api.get_customised_person_status(p.chanjing_person_id, use_cache=True)
                logger.info(f"  🎤 补充请求详情：code={detail_resp.get('code')}, data={detail_resp.get('data', {})}")
                if ChanjingStatusCode.is_success(detail_resp.get('code')):
                    detail_data = detail_resp.get('data', {})
                    audio_man_id = _extract_audio_man_id(detail_data)
                    if audio_man_id:
                        try:
                            p.audio_man_id = audio_man_id
                            db.add(p)
                            db.commit()
                            logger.info(f"  ✅ 已同步数字人原生音色（补齐）：{audio_man_id}")
                        except Exception as update_err:
                            logger.warning(f"  ⚠️ 音色信息回填失败：{update_err}")
                            db.rollback()
            except Exception as e:
                logger.warning(f"  ⚠️ 补齐数字人音色失败：{e}")
        
        if cover_url:
            # 🔗 检查是否是本地路径或 HTTP URL（蝉镜 API 返回的）
            # 支持 Linux 路径（/root/, /data/, /app/）和 Windows 路径（D:/, D:\）
            source_url = cover_url
            is_local_path = (
                source_url.startswith('/root/') or 
                source_url.startswith('/data/') or 
                source_url.startswith('/app/') or
                source_url.startswith('http://') or
                source_url.startswith('https://') or
                (len(source_url) >= 3 and source_url[1] == ':' and source_url[2] in ('/', '\\'))
            )

            if is_local_path:
                # 转换为代理 URL
                cover_url = _to_public_media_url(source_url)
                logger.info(f"  🔄 封面 URL 转换为媒体 URL: {cover_url}")
            else:
                # 🎬 为私有 MinIO 文件生成预签名 URL（有效期 7 天）
                try:
                    from minio.error import S3Error
                    cover_url = minio_client.presigned_get_object(
                        bucket_name=bucket,
                        object_name=source_url,
                        expires=timedelta(days=7)
                    )
                    logger.info(f"  ✅ 生成预签名 URL: {cover_url[:100]}...")
                except S3Error as e:
                    logger.warning(f"  ❌ 生成封面图预签名 URL 失败：{source_url}, 错误：{e}")
                    # 如果生成失败，尝试使用公开 URL
                    minio_external = oss_settings.MINIO_EXTERNAL_ENDPOINT.rstrip("/")
                    cover_url = f"{minio_external}/{bucket}/{source_url}"
                    logger.info(f"  🔄 使用公开 URL: {cover_url}")
        else:
            logger.warning(f"  ⚠️ 无封面图 (cover_url 为空)")
        
        result_list.append({
            "id": p.chanjing_person_id,
            "name": p.name,
            "status": p.status,
            "cover_url": cover_url,
            "figure_type": p.figure_type,  # 形象类型
            "audio_man_id": audio_man_id,  # 声音 ID
            "created_at": p.created_at.isoformat() if p.created_at else None
        })
    
    logger.info(f"\n===== 返回 {len(result_list)} 个自定义数字人 =====")
    
    return ok(result_list)


@router.get("/persons/custom/{person_id}")
def get_custom_person_detail(
    person_id: str,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """从蝉镜 API 拉取单个自定义数字人的详细信息"""
    import logging
    logger = logging.getLogger("uvicorn.error")
    api = get_chanjing_api()
    
    # 先从蝉镜 API 获取最新状态（使用缓存降低并发）
    status_resp = api.get_customised_person_status(person_id, use_cache=True)
    
    if not ChanjingStatusCode.is_success(status_resp.get('code')):
        return fail(ChanjingStatusCode.get_msg(status_resp.get('code')), status_code=400)
    
    data = status_resp.get('data', {})
    
    # 更新本地数据库记录（如果存在）
    local_person = (
        db.query(DhCustomPerson)
        .filter(
            DhCustomPerson.merchant_id == merchant.id,
            DhCustomPerson.chanjing_person_id == person_id
        )
        .first()
    )
    
    # 在更新本地数据库记录时，添加 audio_man_id 的同步
    if local_person:
        chanjing_status = data.get('status', 0)
        # 根据 chanjing_api.py 定义：1=制作中，2=成功，4=失败
        local_status = 30 if chanjing_status in (1, 2) else (40 if chanjing_status in (4, 40, -1) else 10)        
        local_person.status = local_status
        # 🎬 不要覆盖本地封面！本地存储的是从源视频第一帧提取的封面，比蝉镜的默认头像更有意义
        # local_person.cover_url = data.get('cover_url')
        local_person.audio_man_id = _extract_audio_man_id(data)  # 🆕 同步声音 ID
        local_person.updated_at = datetime.now(timezone.utc)
        db.add(local_person)
        db.commit()
        
    # 🎬 蝉镜 API 返回的是 pic_url / preview_url，不是 cover_url
    cover_url = data.get('pic_url') or data.get('preview_url') or data.get('cover_url')
    
    # 🔗 将本地路径或 HTTP URL 转换为代理 URL（支持 Linux 和 Windows 路径）
    if cover_url:
        is_local_path = (
            cover_url.startswith('/root/') or 
            cover_url.startswith('/data/') or 
            cover_url.startswith('/app/') or
            cover_url.startswith('http://') or
            cover_url.startswith('https://') or
            # Windows 路径：盘符 + 冒号 + 斜杠
            (len(cover_url) >= 3 and cover_url[1] == ':' and cover_url[2] in ('/', '\\'))
        )
        if is_local_path:
            cover_url = _to_public_media_url(cover_url)
            logger.info(f"详情页封面 URL转换为媒体 URL: {cover_url}")
    
    # 返回详细信息
    result = {
        "id": person_id,
        "name": data.get('name', ''),
        "status": data.get('status', 0),
        "status_text": _get_person_status_text(data.get('status', 0)),
        "progress": data.get('progress', 0),
        "audio_man_id": _extract_audio_man_id(data),
        "cover_url": cover_url,
        "video_url": data.get('video_url'),  # 训练完成的示例视频
        "figure_type": data.get('type', ''),
        "created_at": local_person.created_at.isoformat() if local_person and local_person.created_at else None
    }
    
    return ok(result)




@router.post("/persons/custom/sync")
def sync_custom_persons(
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """从蝉镜平台同步所有自定义数字人信息到本地数据库"""
    import logging
    logger = logging.getLogger("uvicorn.error")
    api = get_chanjing_api()
    
    # 从蝉镜 API 获取所有自定义数字人（使用缓存降低并发）
    page = 1
    page_size = 50
    all_persons = []
    
    while True:
        try:
            resp = api.list_customised_persons(page=page, page_size=page_size, source=0, use_cache=True)
        except APIError as e:
            return _upstream_error_response("同步自定义数字人", e, logger)
        except Exception as e:
            return _upstream_error_response("同步自定义数字人", e, logger)
        if not ChanjingStatusCode.is_success(resp.get('code')):
            break
        
        data_list = resp.get('data', {}).get('list', [])
        if not data_list:
            break
        
        all_persons.extend(data_list)
        
        # 如果返回数量少于页大小，说明已经是最后一页
        if len(data_list) < page_size:
            break
        page += 1
    
    synced_count = 0
    for person_data in all_persons:
        person_id = person_data.get('id')
        name = person_data.get('name', '')
        chanjing_status = person_data.get('status', 0)
        
        # 🎬 从 figures 数组中提取封面图（蝉镜 API 的实际数据结构）
        cover_url = ""
        figure_type = ""
        figures = person_data.get('figures', [])
        if figures and len(figures) > 0:
            for fig in figures:
                if fig.get('cover'):
                    cover_url = fig.get('cover', '')
                    figure_type = fig.get('type', '')
                    break
            # 如果都没有 cover，使用第一个 figure
            if not cover_url and figures[0]:
                cover_url = figures[0].get('cover', '')
                figure_type = figures[0].get('type', '')
        
        # 🎬 如果 figures 为空或没有 cover，需要调用单个数字人详情接口获取封面
        # 蝉镜的列表接口不返回封面图，只有详情接口才返回 pic_url / preview_url
        preview_video_url = ""
        if not cover_url:
            logger.info(f"  ⚠️ 列表接口无封面，尝试从详情接口获取：{person_id}")
            try:
                # 🐌 使用缓存降低并发
                detail_resp = api.get_customised_person_status(person_id, use_cache=True)
                logger.info(f"  🔍 详情接口返回完整 data: {detail_resp.get('data', {})}")
                if ChanjingStatusCode.is_success(detail_resp.get('code')):
                    detail_data = detail_resp.get('data', {})
                    # 蝉镜 API 返回的是 pic_url 和 preview_url，不是 cover_url
                    cover_url = detail_data.get('pic_url', '') or detail_data.get('preview_url', '') or detail_data.get('cover_url', '')
                    preview_video_url = detail_data.get('preview_url', '')  # 保存预览视频 URL
                    figure_type = detail_data.get('type', '') or detail_data.get('figure_type', '')
                    if cover_url:
                        logger.info(f"  ✅ 从详情接口获取到封面：{cover_url[:80]}...")
                    else:
                        logger.warning(f"  ❌ 详情接口也无封面图字段，data keys={list(detail_data.keys())}")
            except Exception as e:
                logger.warning(f"  ❌ 获取详情失败：{e}")
        
        # 🎬 降级方案：如果只有预览视频没有封面图，下载视频并提取第一帧
        if not cover_url and preview_video_url:
            logger.info(f"  🎥 无封面图，但有预览视频，尝试提取第一帧：{preview_video_url[:80]}...")
            try:
                import tempfile
                import subprocess
                from oss import upload_file_to_oss
                
                # 下载预览视频
                with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp_video:
                    tmp_video_path = tmp_video.name
                    import requests
                    video_resp = requests.get(preview_video_url, timeout=30)
                    if video_resp.status_code == 200:
                        tmp_video.write(video_resp.content)
                        tmp_video.flush()
                        
                        # 提取第一帧
                        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_img:
                            tmp_img_path = tmp_img.name
                        
                        subprocess.run(
                            ["ffmpeg", "-nostdin", "-y", "-ss", "00:00:00.000", "-i", tmp_video_path, "-vframes", "1", "-q:v", "2", tmp_img_path],
                            check=True,
                            capture_output=True,
                            timeout=30
                        )
                        
                        # 上传到 MinIO
                        object_key = f"dh_custom_persons/{person_id}_cover.jpg"
                        cover_url = upload_file_to_oss(tmp_img_path, object_key)
                        logger.info(f"  ✅ 从预览视频提取封面成功：{cover_url[:80]}...")
                        
                        # 清理临时文件
                        import os
                        os.unlink(tmp_video_path)
                        os.unlink(tmp_img_path)
                    else:
                        logger.warning(f"  ❌ 下载预览视频失败：{video_resp.status_code}")
            except Exception as e:
                logger.warning(f"  ❌ 从预览视频提取封面失败：{e}")
        
        # 兼容旧数据：如果仍然没有封面，尝试直接从 person_data 获取
        if not cover_url:
            cover_url = person_data.get('cover_url', '')
            figure_type = person_data.get('figure_type', '')
        
        # 🔗 将本地路径或 HTTP URL 转换为代理 URL（不保存到数据库，只在返回时转换）
        # 支持 Linux 路径（/root/, /data/, /app/）和 Windows 路径（D:/, D:\）
        display_cover_url = cover_url
        if cover_url:
            is_local_path = (
                cover_url.startswith('/root/') or 
                cover_url.startswith('/data/') or 
                cover_url.startswith('/app/') or
                cover_url.startswith('http://') or
                cover_url.startswith('https://') or
                # Windows 路径：盘符 + 冒号 + 斜杠
                (len(cover_url) >= 3 and cover_url[1] == ':' and cover_url[2] in ('/', '\\'))
            )
        if is_local_path:
            display_cover_url = _to_public_media_url(cover_url)
            logger.info(f"  🔄 同步时封面 URL 转换为代理 URL: {display_cover_url}")
        
        audio_man_id = _extract_audio_man_id(person_data)  # 🆕 获取声音 ID
        if not audio_man_id:
            # 兼容列表无音色时，尝试从详情补齐
            try:
                detail_resp = api.get_customised_person_status(person_id, use_cache=True)
                if ChanjingStatusCode.is_success(detail_resp.get('code')):
                    audio_man_id = _extract_audio_man_id(detail_resp.get('data', {}))
            except Exception:
                audio_man_id = ''
        
        # 映射蝉镜状态到本地状态 (根据 chanjing_api.py：1=制作中，2=成功，4=失败)
        local_status = 30 if chanjing_status == 2 else (40 if chanjing_status in (4, 40, -1) else 10)
        
        # 检查是否已存在
        existing = (
            db.query(DhCustomPerson)
            .filter(
                DhCustomPerson.merchant_id == merchant.id,
                DhCustomPerson.chanjing_person_id == person_id
            )
            .first()
        )
        
        if existing:
            # 更新现有记录
            existing.status = local_status
            # 🎬 保留本地封面！如果本地已有从源视频第一帧提取的封面，不要覆盖
            if not existing.cover_url:
                existing.cover_url = cover_url  # 保存原始路径
            existing.audio_man_id = audio_man_id  # 🆕 同步声音 ID
            existing.figure_type = figure_type  # 🆕 同步形象类型
            existing.updated_at = datetime.now(timezone.utc)
            db.add(existing)
        else:
            # 创建新记录
            new_person = DhCustomPerson(
                merchant_id=merchant.id,
                chanjing_person_id=person_id,
                name=name,
                status=local_status,
                cover_url=cover_url,  # 保存原始路径
                audio_man_id=audio_man_id,  # 🆕 保存声音 ID
                figure_type=figure_type  # 🆕 保存形象类型
            )
            db.add(new_person)
        
        synced_count += 1
    
    db.commit()
    
    return ok({"synced_count": synced_count, "total": len(all_persons)})


def _get_person_status_text(status: int) -> str:
    """获取数字人状态文本说明"""
    status_map = {
        0: "定制中",
        1: "已完成",
        2: "已完成",  # 实际 API 返回的已完成状态
        10: "训练中",
        30: "成功",
        40: "失败",
        -1: "错误"
    }
    return status_map.get(status, f"未知状态 ({status})")

@router.get("/voices")
def list_voices(_: Merchant = Depends(verify_api_key)):
    import logging
    import json
    logger = logging.getLogger("uvicorn.error")
    try:
        api = get_chanjing_api()
        res = api.list_common_audio_mans(page=1, size=100, use_cache=True)
        
        # 🔍 详细打印蝉镜 API 返回数据
        logger.info(f"🔍 蝉镜 API 原始返回 (voices)：{json.dumps(res, ensure_ascii=False)[:500]}")
        
        # 检查蝉镜 API 返回状态码（兼容 code 为 None 的情况）
        api_code = res.get('code')
        api_msg = res.get('msg', 'ok')
        logger.info(f"🔍 蝉镜 API 响应 (voices)：code={api_code}, msg={api_msg}")
        
        if api_code is not None and api_code != 0:
            error_msg = res.get('msg', '获取声音列表失败')
            logger.error(f"蝉镜 API 返回错误：{error_msg} (code: {api_code})")
            return {"code": 50000, "message": f"蝉镜 API 错误：{error_msg}", "data": None}
        elif api_code is None:
            logger.warning(f"蝉镜 API 返回 code=None，但继续处理（可能是旧版 API）")
        
        voices_list = res.get("data", {}).get("list", [])
        logger.info(f"🔍 提取到声音数量：{len(voices_list)}")
        return ok(voices_list)
    except Exception as e:
        logger.error(f"获取声音列表异常：{e}")
        return {"code": 50000, "message": f"服务器错误：{str(e)}", "data": None}

# ----- 2. 创建异步生成任务 -----

@router.post("/tasks/generate")
def create_dh_generate_task(
    req: DhGenerateVideoRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    # 此逻辑与 api_service.py 极度相似
    trace_id = "trace_" + uuid.uuid4().hex[:16]
    task_id = "task_dh_" + uuid.uuid4().hex[:16]

    if not check_quota(merchant): return fail(40201, "insufficient quota")
    if not check_concurrent_limit(db, merchant): return fail(42901, "limit reached")

    task = Task(
        id=task_id,
        merchant_id=merchant.id,
        trace_id=trace_id,
        client_ref_id=req.client_ref_id,
        task_type="dh_generate",  # 新任务类型
        status=TaskStatus.queued,
        payload=req.model_dump(),
        timeout_seconds=req.timeout_seconds,
        stage="queued",
    )

    db.add(task)
    db.flush()
    reserve_quota(db, merchant, task)  # 预扣费

    from api_service import get_queue
    queue = get_queue()
    job = queue.enqueue(
        "task_runner.run_dh_generate_video_task",
        task_id=task_id,
        payload=req.model_dump(),
        trace_id=trace_id,
        merchant_id=merchant.id,
        job_timeout=req.timeout_seconds + 60,
    )
    task.rq_job_id = job.id
    db.commit()

    return ok({"task_id": task_id, "status": "queued"})



@router.post("/tasks/create-person")
def create_dh_custom_person_task(
    req: DhCreateCustomPersonRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    trace_id = "trace_" + uuid.uuid4().hex[:16]
    task_id = "task_dhc_" + uuid.uuid4().hex[:16]

    if not check_quota(merchant): return fail(40201, "insufficient quota")
    if not check_concurrent_limit(db, merchant): return fail(42901, "limit reached")

    task = Task(
        id=task_id,
        merchant_id=merchant.id,
        trace_id=trace_id,
        client_ref_id=req.client_ref_id,
        task_type="dh_custom_person", 
        status=TaskStatus.queued,
        payload=req.model_dump(),
        timeout_seconds=14400, # 训练时间可能较长，设为 4 小时超时
        stage="queued",
    )

    db.add(task)
    db.flush()
    reserve_quota(db, merchant, task)  # 预扣费

    from api_service import get_queue
    queue = get_queue()
    job = queue.enqueue(
        "task_runner.run_dh_create_person_task",
        task_id=task_id,
        payload=req.model_dump(),
        trace_id=trace_id,
        merchant_id=merchant.id,
        job_timeout=14400 + 60,
    )
    task.rq_job_id = job.id
    db.commit()

    return ok({"task_id": task_id, "status": "queued"})


# ----- 3. 删除接口 -----

@router.post("/tasks/{task_id}/delete")
def delete_dh_video_task(
    task_id: str,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """删除数字人视频任务
    
    调用蝉镜 API 删除视频，同时更新本地数据库状态
    """
    api = get_chanjing_api()
    
    # 先查询本地任务是否存在
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.merchant_id == merchant.id,
        Task.task_type == "dh_generate"
    ).first()
    
    if not task:
        return fail(40400, "task not found", status_code=404)
    
    # 调用蝉镜 API 删除视频
    resp = api.delete_video(task_id)
    
    if not ChanjingStatusCode.is_success(resp.get('code')):
        return fail(
            ChanjingStatusCode.get_msg(resp.get('code')), 
            status_code=400
        )
    
    # 更新本地任务状态为已删除
    task.status = TaskStatus.cancelled
    task.stage = "deleted"
    task.error = "deleted by user"
    db.add(task)
    db.commit()
    
    # 退还配额
    from quota import refund_quota
    refund_quota(db, task, reason="deleted by user")
    
    return ok({"task_id": task_id})


@router.post("/persons/custom/{person_id}/delete")
def delete_custom_person(
    person_id: str,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """删除定制数字人
    
    调用蝉镜 API 删除数字人，同时删除本地数据库记录
    """
    api = get_chanjing_api()
    
    # 先检查本地是否存在该数字人
    local_person = (
        db.query(DhCustomPerson)
        .filter(
            DhCustomPerson.merchant_id == merchant.id,
            DhCustomPerson.chanjing_person_id == person_id
        )
        .first()
    )
    
    if not local_person:
        return fail(40400, "person not found", status_code=404)
    
    # 调用蝉镜 API 删除数字人
    resp = api.delete_customised_person(person_id)
    
    if not ChanjingStatusCode.is_success(resp.get('code')):
        return fail(
            ChanjingStatusCode.get_msg(resp.get('code')), 
            status_code=400
        )
    
    # 删除本地数据库记录
    db.delete(local_person)
    db.commit()
    
    return ok({"person_id": person_id})


@router.post("/voices/{audio_id}/delete")
def delete_custom_audio(
    audio_id: str,
    merchant: Merchant = Depends(verify_api_key)
):
    """删除定制声音
    
    调用蝉镜 API 删除定制声音
    """
    api = get_chanjing_api()
    
    resp = api.delete_customised_audio(audio_id)
    
    if not ChanjingStatusCode.is_success(resp.get('code')):
        return fail(
            ChanjingStatusCode.get_msg(resp.get('code')), 
            status_code=400
        )
    
    return ok({"audio_id": audio_id})


@router.post("/files/{file_id}/delete")
def delete_file(
    file_id: str,
    merchant: Merchant = Depends(verify_api_key)
):
    """删除文件
    
    调用蝉镜 API 删除已上传的文件
    """
    api = get_chanjing_api()
    
    resp = api.delete_file(file_id)
    
    if not ChanjingStatusCode.is_success(resp.get('code')):
        return fail(
            ChanjingStatusCode.get_msg(resp.get('code')), 
            status_code=400
        )
    
    return ok({"file_id": file_id})
# ============================================================
# 图片代理接口 - 解决前端跨域访问图片问题
# ============================================================

@router.get("/proxy-image")
async def proxy_image(
    path: str,
    api_key: str = None,  # 从 URL 参数获取 API Key（用于<img>标签访问，可选）
):
    """图片代理接口
    
    前端通过此接口获取服务器本地图片文件，避免跨域问题。
    后端读取本地文件并返回给前端，也支持代理远程 URL 图片。
    
    参数:
        path: 图片文件路径（需要 URL 编码），如 /root/MuseTalk/data/video/xxx.png
        或者完整的 http/https URL
        api_key: 可选的 API Key，用于简单鉴权（目前未强制要求）
    
    返回:
        图片二进制数据
    """
    import logging
    from pathlib import Path
    from fastapi import HTTPException
    from fastapi.responses import Response
    import mimetypes
    import httpx
    
    logger = logging.getLogger("uvicorn.error")
    
    if not path:
        raise HTTPException(status_code=400, detail="缺少 path 参数")
    
    try:
        # 判断是本地路径、远程 URL 还是文件服务器路径
        if path.startswith('http://') or path.startswith('https://'):
            # 远程 URL：下载并转发
            logger.info(f"代理远程图片：{path}")
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(path)
                if resp.status_code == 404:
                    logger.warning(f"远程图片不存在：{path}")
                    raise HTTPException(status_code=404, detail="远程图片不存在")
                elif resp.status_code != 200:
                    logger.error(f"下载远程图片失败：{path}, status={resp.status_code}")
                    raise HTTPException(status_code=502, detail=f"下载远程图片失败：{resp.status_code}")
                
                # 获取内容类型
                content_type = resp.headers.get('content-type', 'image/png')
                
                # 返回图片
                return Response(
                    content=resp.content,
                    media_type=content_type,
                    headers={
                        "Cache-Control": "public, max-age=3600",  # 缓存 1 小时
                    }
                )
        mapped_file_path = _normalize_chanjing_files_path(path)
        if mapped_file_path:
            # 蝉镜文件服务器路径：通过 HTTP 请求文件服务器
            files_base_url = _require_public_url(
                get_settings().CHANJING_FILES_URL,
                "CHANJING_FILES_URL",
                allow_private=get_settings().ALLOW_PRIVATE_CHANJING,
            )
            file_url = f"{files_base_url}{mapped_file_path}"
            logger.info(f"代理文件服务器图片：{path} -> {file_url}")
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(file_url)
                if resp.status_code == 404:
                    logger.warning(f"文件服务器图片不存在：{file_url}")
                    raise HTTPException(status_code=404, detail="文件服务器图片不存在")
                elif resp.status_code != 200:
                    logger.error(f"从文件服务器下载失败：{file_url}, status={resp.status_code}")
                    raise HTTPException(status_code=502, detail=f"从文件服务器下载失败：{resp.status_code}")
                
                # 获取内容类型
                content_type = resp.headers.get('content-type', 'image/png')
                
                # 返回图片
                return Response(
                    content=resp.content,
                    media_type=content_type,
                    headers={
                        "Cache-Control": "public, max-age=3600",  # 缓存 1 小时
                    }
                )
        else:
            # 本地文件路径：安全检查后读取
            # 同时支持 Linux 和 Windows 路径
            allowed_dirs = [
                "/root/MuseTalk/data/video",
                "/root/MuseTalk/data/audio/human",
                "/data/video",
                "/data/audio",
                "/data/audio/human",
                "/app/data",
                "/app/data/audio",
                # Windows 开发环境
                "D:\\workspace\\rjcut",
                "D:/workspace/rjcut",
            ]
            
            # 处理相对路径：转换为绝对路径
            file_path = Path(path)
            if not file_path.is_absolute():
                # 相对路径，转换为绝对路径（从当前工作目录开始）
                file_path = Path.cwd() / file_path
                logger.info(f"相对路径转换为绝对路径：{file_path}")
            
            # 检查路径是否在允许的目录中（使用绝对路径检查）
            abs_path_str = str(file_path)
            is_allowed = any(abs_path_str.startswith(allowed) for allowed in allowed_dirs)
            if not is_allowed:
                logger.warning(f"拒绝访问路径：{path} (绝对路径：{abs_path_str})")
                raise HTTPException(status_code=403, detail="不允许访问此路径")
            
            # 检查文件是否存在
            if not file_path.exists():
                logger.warning(f"文件不存在：{path} (绝对路径：{abs_path_str})")
                raise HTTPException(status_code=404, detail="文件不存在")
            
            # 读取文件
            logger.info(f"读取本地图片：{path}")
            with open(file_path, 'rb') as f:
                content = f.read()
            
            # 获取内容类型
            content_type, _ = mimetypes.guess_type(path)
            content_type = content_type or 'image/png'
            
            # 返回图片
            return Response(
                content=content,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=3600",  # 缓存 1 小时
                }
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"读取图片异常：{e}")
        raise HTTPException(status_code=500, detail=f"服务器错误：{str(e)}")


# 🖼️ 不需要认证的代理图片接口（供前端<img>标签直接访问）
async def proxy_image_no_auth(
    path: str,
):
    """图片代理接口（无认证版本）
    
    前端通过此接口获取服务器本地图片文件，避免跨域问题。
    此接口不需要 API Key 认证，专门用于<img>标签直接访问。
    
    参数:
        path: 图片文件路径（需要 URL 编码），如 /root/MuseTalk/data/video/xxx.png
        或者完整的 http/https URL
    
    返回:
        图片二进制数据
    """
    import logging
    from pathlib import Path
    from fastapi import HTTPException
    from fastapi.responses import Response
    import mimetypes
    import httpx
    
    logger = logging.getLogger("uvicorn.error")
    
    if not path:
        raise HTTPException(status_code=400, detail="缺少 path 参数")
    
    try:
        # 判断是本地路径、远程 URL 还是文件服务器路径
        if path.startswith('http://') or path.startswith('https://'):
            # 远程 URL：下载并转发
            logger.info(f"代理远程图片：{path}")
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(path)
                if resp.status_code == 404:
                    logger.warning(f"远程图片不存在：{path}")
                    raise HTTPException(status_code=404, detail="远程图片不存在")
                elif resp.status_code != 200:
                    logger.error(f"下载远程图片失败：{path}, status={resp.status_code}")
                    raise HTTPException(status_code=502, detail=f"下载远程图片失败：{resp.status_code}")
                
                # 获取内容类型
                content_type = resp.headers.get('content-type', 'image/png')
                
                # 返回图片
                return Response(
                    content=resp.content,
                    media_type=content_type,
                    headers={
                        "Cache-Control": "public, max-age=3600",  # 缓存 1 小时
                    }
                )
        mapped_file_path = _normalize_chanjing_files_path(path)
        if mapped_file_path:
            # 蝉镜文件服务器路径：通过 HTTP 请求文件服务器
            files_base_url = _require_public_url(
                get_settings().CHANJING_FILES_URL,
                "CHANJING_FILES_URL",
                allow_private=get_settings().ALLOW_PRIVATE_CHANJING,
            )
            file_url = f"{files_base_url}{mapped_file_path}"
            logger.info(f"代理文件服务器图片：{path} -> {file_url}")
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(file_url)
                if resp.status_code == 404:
                    logger.warning(f"文件服务器图片不存在：{file_url}")
                    raise HTTPException(status_code=404, detail="文件服务器图片不存在")
                elif resp.status_code != 200:
                    logger.error(f"从文件服务器下载失败：{file_url}, status={resp.status_code}")
                    raise HTTPException(status_code=502, detail=f"从文件服务器下载失败：{resp.status_code}")
                
                # 获取内容类型
                content_type = resp.headers.get('content-type', 'image/png')
                
                # 返回图片
                return Response(
                    content=resp.content,
                    media_type=content_type,
                    headers={
                        "Cache-Control": "public, max-age=3600",  # 缓存 1 小时
                    }
                )
        else:
            # 本地文件路径：安全检查后读取
            # 同时支持 Linux 和 Windows 路径
            allowed_dirs = [
                "/root/MuseTalk/data/video",
                "/root/MuseTalk/data/audio/human",
                "/data/video",
                "/data/audio",
                "/data/audio/human",
                "/app/data",
                "/app/data/audio",
                # Windows 开发环境
                "D:\\workspace\\rjcut",
                "D:/workspace/rjcut",
            ]
            
            # 处理相对路径：转换为绝对路径
            file_path = Path(path)
            if not file_path.is_absolute():
                # 相对路径，转换为绝对路径（从当前工作目录开始）
                file_path = Path.cwd() / file_path
                logger.info(f"相对路径转换为绝对路径：{file_path}")
            
            # 检查路径是否在允许的目录中（使用绝对路径检查）
            abs_path_str = str(file_path)
            is_allowed = any(abs_path_str.startswith(allowed) for allowed in allowed_dirs)
            if not is_allowed:
                logger.warning(f"拒绝访问路径：{path} (绝对路径：{abs_path_str})")
                raise HTTPException(status_code=403, detail="不允许访问此路径")
            
            # 检查文件是否存在
            if not file_path.exists():
                logger.warning(f"文件不存在：{path} (绝对路径：{abs_path_str})")
                raise HTTPException(status_code=404, detail="文件不存在")
            
            # 读取文件
            logger.info(f"读取本地图片：{path}")
            with open(file_path, 'rb') as f:
                content = f.read()
            
            # 获取内容类型
            content_type, _ = mimetypes.guess_type(path)
            content_type = content_type or 'image/png'
            
            # 返回图片
            return Response(
                content=content,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=3600",  # 缓存 1 小时
                }
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"读取图片异常：{e}")
        raise HTTPException(status_code=500, detail=f"服务器错误：{str(e)}")
# ============================================================
# 字幕识别 API - 为前端提供 Whisper 语音识别能力
# ============================================================

@router.post("/transcribe")
async def transcribe_video(
    video_url: str,
    model_size: str = "medium",
    language: str = "zh",
    device: str = "cuda",
    _: Merchant = Depends(verify_api_key)
):
    """语音识别接口
    
    使用 whisper_timestamped 对视频进行语音识别，返回带时间戳的字幕数据。
    前端可使用此接口获取字幕数据，然后在前端进行视频剪辑和合成。
    
    参数:
        video_url: 视频文件 URL（支持 http/https 或本地路径）
        model_size: Whisper 模型大小 (medium, large-v3 等)
        language: 识别语言 (默认 zh 中文)
        device: 推理设备 (cuda 或 cpu)
    
    返回:
        包含字幕 segments 的 JSON 数据，格式与 whisper_timestamped 一致
    """
    import tempfile
    import os
    import whisper_timestamped as whisper
    import requests
    import gc
    import torch
    from fastapi import HTTPException
    from pathlib import Path
    
    logger = logging.getLogger("uvicorn.error")
    
    try:
        # 1. 准备视频文件
        video_path = None
        
        if video_url.startswith('http://') or video_url.startswith('https://'):
            # 下载远程视频
            logger.info(f"下载视频进行识别：{video_url}")
            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp:
                video_path = tmp.name
                resp = requests.get(video_url, timeout=300, stream=True)
                if resp.status_code != 200:
                    raise HTTPException(status_code=400, detail=f"视频下载失败：{resp.status_code}")
                
                for chunk in resp.iter_content(chunk_size=1024*1024):
                    if chunk:
                        tmp.write(chunk)
        else:
            # 本地路径
            video_path = video_url
            if not os.path.isfile(video_path):
                raise HTTPException(status_code=404, detail=f"视频文件不存在：{video_path}")
        
        # 2. 加载模型并识别
        logger.info(f"开始语音识别：model={model_size}, device={device}, language={language}")
        
        # 强制使用 cuda 防止内存溢出
        if device != "cuda":
            logger.warning(f"已禁止使用 {device} 进行推理，自动切换为 cuda 防止内存溢出！")
            device = "cuda"
        
        model = whisper.load_model(
            model_size, 
            device=device, 
            download_root="./model"
        )
        
        audio = whisper.load_audio(video_path)
        result = whisper.transcribe(
            model, 
            audio,
            language=language,
            detect_disfluencies=False,
            vad=True,
        )
        
        # 3. 清理资源
        del model
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()
        
        # 4. 清理临时文件
        if video_url.startswith('http') and video_path:
            try:
                os.unlink(video_path)
            except:
                pass
        
        # 5. 返回结果
        seg_count = len(result.get("segments", []))
        word_count = sum(len(seg.get("words", [])) for seg in result.get("segments", []))
        
        logger.info(f"识别完成：{seg_count} 个语句段，{word_count} 个字")
        
        return ok({
            "segments": result.get("segments", []),
            "text": result.get("text", ""),
            "language": result.get("language", language),
            "duration": result["segments"][-1].get("end", 0) if result.get("segments") else 0,
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"语音识别异常：{e}")
        raise HTTPException(status_code=500, detail=f"识别失败：{str(e)}")
