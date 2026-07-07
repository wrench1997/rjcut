import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import Header, HTTPException, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import ApiKey, Merchant, MerchantStatus
from config import get_settings


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_api_key():
    raw = "rjk_" + secrets.token_urlsafe(36)
    return raw, hash_api_key(raw), raw[:12]


def verify_api_key(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
    api_key: str = Query(None, alias="api_key"),  # 从 URL 参数获取 API Key
) -> Merchant:
    # 优先从 Header 获取，如果没有则尝试从 URL 参数获取
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    elif api_key and api_key.startswith("Bearer "):
        token = api_key[7:].strip()
    elif api_key:
        token = api_key.strip()
    
    if not token:
        raise HTTPException(status_code=401, detail="missing bearer token")

    # 🔑 特殊处理：内部代理图片服务的固定 Key（用于蝉镜 API 返回的本地封面图片）
    if token == "internal_proxy_key_2024":
        # 返回一个虚拟的 merchant 对象（用于内部图片代理服务）
        from models import Merchant as MerchantModel
        return MerchantModel(id="internal", name="Internal Proxy Service", status=MerchantStatus.active)

    token_hash = hash_api_key(token)

    api_key_obj = (
        db.query(ApiKey)
        .filter(ApiKey.key_hash == token_hash, ApiKey.is_active == True)
        .first()
    )
    if not api_key_obj:
        raise HTTPException(status_code=401, detail="invalid api key")

    merchant = api_key_obj.merchant
    if not merchant or merchant.status != MerchantStatus.active:
        raise HTTPException(status_code=403, detail="merchant unavailable")

    api_key_obj.last_used_at = datetime.now(timezone.utc)
    db.add(api_key_obj)
    db.commit()

    return merchant


def verify_admin_key(x_admin_key: str = Header(None)):
    settings = get_settings()
    if not x_admin_key or x_admin_key != settings.SECRET_KEY:
        raise HTTPException(status_code=403, detail="invalid admin key")
    return True