import uuid
import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, Integer, BigInteger, Boolean, Text,
    DateTime, ForeignKey, Index, JSON, Enum as SAEnum
)
from sqlalchemy.orm import relationship

from database import Base


def utc_now():
    return datetime.now(timezone.utc)


def gen_uuid():
    return uuid.uuid4().hex


class MerchantStatus(str, enum.Enum):
    active = "active"
    suspended = "suspended"
    deleted = "deleted"


class TaskStatus(str, enum.Enum):
    queued = "queued"
    processing = "processing"
    succeeded = "succeeded"
    failed = "failed"
    cancelled = "cancelled"
    timeout = "timeout"


class BillingType(str, enum.Enum):
    task_submit = "task_submit"
    task_success = "task_success"
    task_refund = "task_refund"
    admin_adjust = "admin_adjust"


class Merchant(Base):
    __tablename__ = "merchants"

    id = Column(String(64), primary_key=True, default=gen_uuid)
    name = Column(String(256), nullable=False)
    email = Column(String(256), unique=True, nullable=True)
    status = Column(
        SAEnum(MerchantStatus, name="merchant_status_enum"),
        default=MerchantStatus.active,
        nullable=False,
    )

    quota_total = Column(BigInteger, default=0, nullable=False)
    quota_used = Column(BigInteger, default=0, nullable=False)
    quota_reserved = Column(BigInteger, default=0, nullable=False)

    cost_per_task = Column(Integer, default=1, nullable=False)
    rate_limit_per_minute = Column(Integer, default=60, nullable=False)
    max_concurrent_tasks = Column(Integer, default=5, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    api_keys = relationship("ApiKey", back_populates="merchant")
    tasks = relationship("Task", back_populates="merchant")

    @property
    def quota_available(self):
        return self.quota_total - self.quota_used - self.quota_reserved


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(String(64), primary_key=True, default=gen_uuid)
    merchant_id = Column(String(64), ForeignKey("merchants.id"), nullable=False)
    key_hash = Column(String(256), nullable=False, unique=True)
    key_prefix = Column(String(16), nullable=False)
    name = Column(String(256), default="default")
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    merchant = relationship("Merchant", back_populates="api_keys")

    __table_args__ = (
        Index("idx_api_keys_key_hash", "key_hash"),
        Index("idx_api_keys_merchant_id", "merchant_id"),
    )


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String(64), primary_key=True)
    merchant_id = Column(String(64), ForeignKey("merchants.id"), nullable=False)
    trace_id = Column(String(64), nullable=True)
    client_ref_id = Column(String(256), nullable=True)
    task_type = Column(String(64), default="agent_compose", nullable=False)

    status = Column(
        SAEnum(TaskStatus, name="task_status_enum"),
        default=TaskStatus.queued,
        nullable=False,
    )
    progress = Column(Integer, default=0, nullable=False)
    stage = Column(String(128), default="queued", nullable=True)

    payload = Column(JSON, nullable=True)
    result = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)

    rq_job_id = Column(String(128), nullable=True)
    cost = Column(Integer, default=0, nullable=False)
    charge_status = Column(String(32), default="none", nullable=False)  # none/reserved/charged/refunded

    timeout_seconds = Column(Integer, default=3600, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    merchant = relationship("Merchant", back_populates="tasks")

    __table_args__ = (
        Index("idx_tasks_merchant_id", "merchant_id"),
        Index("idx_tasks_status", "status"),
        Index("idx_tasks_created_at", "created_at"),
        Index("idx_tasks_rq_job_id", "rq_job_id"),
    )


class BillingRecord(Base):
    __tablename__ = "billing_records"

    id = Column(String(64), primary_key=True, default=gen_uuid)
    merchant_id = Column(String(64), ForeignKey("merchants.id"), nullable=False)
    task_id = Column(String(64), ForeignKey("tasks.id"), nullable=True)

    billing_type = Column(
        SAEnum(BillingType, name="billing_type_enum"),
        nullable=False,
    )
    amount = Column(Integer, nullable=False)
    balance_after = Column(BigInteger, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    __table_args__ = (
        Index("idx_billing_merchant_id", "merchant_id"),
        Index("idx_billing_task_id", "task_id"),
    )


class UploadRecord(Base):
    __tablename__ = "upload_records"

    id = Column(String(64), primary_key=True, default=gen_uuid)
    merchant_id = Column(String(64), ForeignKey("merchants.id"), nullable=False)
    original_filename = Column(String(512), nullable=True)
    oss_key = Column(String(1024), nullable=False)
    content_type = Column(String(128), nullable=True)
    size_bytes = Column(BigInteger, nullable=True)
    upload_type = Column(String(64), default="presigned")
    presigned_url = Column(Text, nullable=True)
    is_confirmed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    __table_args__ = (
        Index("idx_upload_merchant_id", "merchant_id"),
        Index("idx_upload_oss_key", "oss_key"),
    )