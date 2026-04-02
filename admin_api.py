from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from models import Merchant, MerchantStatus, ApiKey, BillingRecord, BillingType, Task
from schemas import CreateMerchantRequest, AdjustQuotaRequest, CreateApiKeyRequest
from auth import verify_admin_key, generate_api_key
from models import utc_now

router = APIRouter(prefix="/admin", tags=["admin"])


def ok(data=None):
    return {"code": 0, "message": "ok", "data": data, "trace_id": None}


def fail(code: int, message: str, status_code: int = 400):
    return JSONResponse(
        status_code=status_code,
        content={"code": code, "message": message, "trace_id": None},
    )


@router.post("/merchants")
def create_merchant(
    req: CreateMerchantRequest,
    _: bool = Depends(verify_admin_key),
    db: Session = Depends(get_db),
):
    merchant = Merchant(
        name=req.name,
        email=req.email,
        quota_total=req.quota_total,
        cost_per_task=req.cost_per_task,
        rate_limit_per_minute=req.rate_limit_per_minute,
        max_concurrent_tasks=req.max_concurrent_tasks,
    )
    db.add(merchant)
    db.flush()

    raw_key, key_hash, prefix = generate_api_key()
    api_key = ApiKey(
        merchant_id=merchant.id,
        key_hash=key_hash,
        key_prefix=prefix,
        name="default",
    )
    db.add(api_key)
    db.commit()

    return ok({
        "merchant_id": merchant.id,
        "name": merchant.name,
        "api_key": raw_key,
        "api_key_prefix": prefix,
    })


@router.get("/merchants")
def list_merchants(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: bool = Depends(verify_admin_key),
    db: Session = Depends(get_db),
):
    total = db.query(Merchant).count()
    items = (
        db.query(Merchant)
        .order_by(Merchant.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return ok({
        "items": [
            {
                "merchant_id": m.id,
                "name": m.name,
                "email": m.email,
                "status": m.status.value,
                "quota_total": m.quota_total,
                "quota_used": m.quota_used,
                "quota_reserved": m.quota_reserved,
                "quota_available": m.quota_available,
                "cost_per_task": m.cost_per_task,
                "max_concurrent_tasks": m.max_concurrent_tasks,
                "created_at": m.created_at.isoformat(),
            }
            for m in items
        ],
        "count": len(items),
        "total": total,
    })


@router.post("/merchants/{merchant_id}/quota")
def adjust_quota(
    merchant_id: str,
    req: AdjustQuotaRequest,
    _: bool = Depends(verify_admin_key),
    db: Session = Depends(get_db),
):
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        return fail(40400, "merchant not found", 404)

    merchant.quota_total += req.amount
    if merchant.quota_total < 0:
        merchant.quota_total = 0

    record = BillingRecord(
        merchant_id=merchant.id,
        task_id=None,
        billing_type=BillingType.admin_adjust,
        amount=req.amount,
        balance_after=merchant.quota_available,
        description=req.description,
    )
    db.add(merchant)
    db.add(record)
    db.commit()

    return ok({
        "merchant_id": merchant.id,
        "quota_total": merchant.quota_total,
        "quota_used": merchant.quota_used,
        "quota_reserved": merchant.quota_reserved,
        "quota_available": merchant.quota_available,
    })


@router.post("/merchants/{merchant_id}/api-keys")
def create_api_key_for_merchant(
    merchant_id: str,
    req: CreateApiKeyRequest,
    _: bool = Depends(verify_admin_key),
    db: Session = Depends(get_db),
):
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        return fail(40400, "merchant not found", 404)

    raw_key, key_hash, prefix = generate_api_key()
    api_key = ApiKey(
        merchant_id=merchant.id,
        key_hash=key_hash,
        key_prefix=prefix,
        name=req.name,
    )
    db.add(api_key)
    db.commit()

    return ok({
        "key_id": api_key.id,
        "api_key": raw_key,
        "key_prefix": prefix,
        "name": api_key.name,
    })


@router.get("/merchants/{merchant_id}/api-keys")
def list_api_keys(
    merchant_id: str,
    _: bool = Depends(verify_admin_key),
    db: Session = Depends(get_db),
):
    keys = db.query(ApiKey).filter(ApiKey.merchant_id == merchant_id).all()
    return ok({
        "items": [
            {
                "key_id": k.id,
                "key_prefix": k.key_prefix,
                "name": k.name,
                "is_active": k.is_active,
                "created_at": k.created_at.isoformat() if k.created_at else None,
                "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
            }
            for k in keys
        ]
    })


@router.post("/merchants/{merchant_id}/api-keys/{key_id}/revoke")
def revoke_api_key(
    merchant_id: str,
    key_id: str,
    _: bool = Depends(verify_admin_key),
    db: Session = Depends(get_db),
):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.merchant_id == merchant_id).first()
    if not key:
        return fail(40400, "api key not found", 404)

    key.is_active = False
    db.commit()
    return ok({"key_id": key.id, "is_active": False})


@router.get("/merchants/{merchant_id}/billing")
def list_billing(
    merchant_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: bool = Depends(verify_admin_key),
    db: Session = Depends(get_db),
):
    total = db.query(BillingRecord).filter(BillingRecord.merchant_id == merchant_id).count()
    rows = (
        db.query(BillingRecord)
        .filter(BillingRecord.merchant_id == merchant_id)
        .order_by(BillingRecord.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return ok({
        "items": [
            {
                "id": r.id,
                "task_id": r.task_id,
                "billing_type": r.billing_type.value,
                "amount": r.amount,
                "balance_after": r.balance_after,
                "description": r.description,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ],
        "count": len(rows),
        "total": total,
    })


@router.get("/tasks")
def admin_list_tasks(
    merchant_id: str = Query(None),
    status: str = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: bool = Depends(verify_admin_key),
    db: Session = Depends(get_db),
):
    query = db.query(Task)
    if merchant_id:
        query = query.filter(Task.merchant_id == merchant_id)
    if status:
        query = query.filter(Task.status == status)

    total = query.count()
    tasks = query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()

    return ok({
        "items": [
            {
                "task_id": t.id,
                "merchant_id": t.merchant_id,
                "task_type": t.task_type,
                "status": t.status.value,
                "progress": t.progress,
                "stage": t.stage,
                "cost": t.cost,
                "charge_status": t.charge_status,
                "error": t.error,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "started_at": t.started_at.isoformat() if t.started_at else None,
                "finished_at": t.finished_at.isoformat() if t.finished_at else None,
            }
            for t in tasks
        ],
        "count": len(tasks),
        "total": total,
    })