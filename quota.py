from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import Merchant, Task, BillingRecord, BillingType, TaskStatus


def check_quota(merchant: Merchant) -> bool:
    return merchant.quota_available >= merchant.cost_per_task


def check_concurrent_limit(db: Session, merchant: Merchant) -> bool:
    active_count = (
        db.query(Task)
        .filter(
            Task.merchant_id == merchant.id,
            Task.status.in_([TaskStatus.queued, TaskStatus.processing]),
        )
        .count()
    )
    return active_count < merchant.max_concurrent_tasks


def reserve_quota(db: Session, merchant: Merchant, task: Task):
    cost = merchant.cost_per_task
    if merchant.quota_available < cost:
        raise HTTPException(status_code=402, detail="insufficient quota")

    merchant.quota_reserved += cost
    task.cost = cost
    task.charge_status = "reserved"

    db.add(BillingRecord(
        merchant_id=merchant.id,
        task_id=task.id,
        billing_type=BillingType.task_submit,
        amount=-cost,
        balance_after=merchant.quota_available,
        description=f"reserve quota for task {task.id}",
    ))
    db.add(merchant)
    db.add(task)
    db.flush()


def confirm_quota(db: Session, task: Task):
    if task.charge_status != "reserved":
        return

    merchant = db.query(Merchant).filter(Merchant.id == task.merchant_id).with_for_update().first()
    if not merchant:
        return

    merchant.quota_reserved = max(0, merchant.quota_reserved - task.cost)
    merchant.quota_used += task.cost
    task.charge_status = "charged"

    db.add(BillingRecord(
        merchant_id=merchant.id,
        task_id=task.id,
        billing_type=BillingType.task_success,
        amount=0,
        balance_after=merchant.quota_available,
        description=f"confirm quota for task {task.id}",
    ))
    db.add(merchant)
    db.add(task)
    db.flush()


def refund_quota(db: Session, task: Task, reason: str = "task failed"):
    if task.charge_status != "reserved":
        return

    merchant = db.query(Merchant).filter(Merchant.id == task.merchant_id).with_for_update().first()
    if not merchant:
        return

    merchant.quota_reserved = max(0, merchant.quota_reserved - task.cost)
    task.charge_status = "refunded"

    db.add(BillingRecord(
        merchant_id=merchant.id,
        task_id=task.id,
        billing_type=BillingType.task_refund,
        amount=task.cost,
        balance_after=merchant.quota_available,
        description=f"refund quota: {reason}",
    ))
    db.add(merchant)
    db.add(task)
    db.flush()