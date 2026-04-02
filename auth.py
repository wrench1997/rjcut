import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import Header, HTTPException, Depends
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
) -> Merchant:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")

    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="empty token")

    token_hash = hash_api_key(token)

    api_key = (
        db.query(ApiKey)
        .filter(ApiKey.key_hash == token_hash, ApiKey.is_active == True)
        .first()
    )
    if not api_key:
        raise HTTPException(status_code=401, detail="invalid api key")

    merchant = api_key.merchant
    if not merchant or merchant.status != MerchantStatus.active:
        raise HTTPException(status_code=403, detail="merchant unavailable")

    api_key.last_used_at = datetime.now(timezone.utc)
    db.add(api_key)
    db.commit()

    return merchant


def verify_admin_key(x_admin_key: str = Header(None)):
    settings = get_settings()
    if not x_admin_key or x_admin_key != settings.SECRET_KEY:
        raise HTTPException(status_code=403, detail="invalid admin key")
    return True