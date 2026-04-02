# FILE: /root/workspaces/rjcut/alembic/versions/001_initial.py

"""Initial migration

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Merchants
    op.create_table(
        'merchants',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('email', sa.String(256), unique=True, nullable=True),
        sa.Column('status', sa.Enum('active', 'suspended', 'deleted', name='merchant_status_enum'), nullable=False, server_default='active'),
        sa.Column('quota_total', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('quota_used', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('quota_reserved', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('cost_per_task', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('rate_limit_per_minute', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('max_concurrent_tasks', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    # API Keys
    op.create_table(
        'api_keys',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('merchant_id', sa.String(64), sa.ForeignKey('merchants.id'), nullable=False),
        sa.Column('key_hash', sa.String(256), nullable=False, unique=True),
        sa.Column('key_prefix', sa.String(16), nullable=False),
        sa.Column('name', sa.String(256), server_default='default'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('idx_api_keys_key_hash', 'api_keys', ['key_hash'])
    op.create_index('idx_api_keys_merchant_id', 'api_keys', ['merchant_id'])

    # Tasks
    op.create_table(
        'tasks',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('merchant_id', sa.String(64), sa.ForeignKey('merchants.id'), nullable=False),
        sa.Column('trace_id', sa.String(64), nullable=True),
        sa.Column('client_ref_id', sa.String(256), nullable=True),
        sa.Column('task_type', sa.String(64), nullable=False, server_default='agent_compose'),
        sa.Column('status', sa.Enum('queued', 'processing', 'succeeded', 'failed', 'cancelled', 'timeout', name='task_status_enum'), nullable=False, server_default='queued'),
        sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('stage', sa.String(128), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('result', sa.JSON(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('rq_job_id', sa.String(128), nullable=True),
        sa.Column('cost', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('timeout_seconds', sa.Integer(), nullable=False, server_default='3600'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('idx_tasks_merchant_id', 'tasks', ['merchant_id'])
    op.create_index('idx_tasks_status', 'tasks', ['status'])
    op.create_index('idx_tasks_created_at', 'tasks', ['created_at'])
    op.create_index('idx_tasks_rq_job_id', 'tasks', ['rq_job_id'])

    # Billing Records
    op.create_table(
        'billing_records',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('merchant_id', sa.String(64), sa.ForeignKey('merchants.id'), nullable=False),
        sa.Column('task_id', sa.String(64), sa.ForeignKey('tasks.id'), nullable=True),
        sa.Column('billing_type', sa.Enum('task_submit', 'task_success', 'task_refund', 'quota_purchase', 'admin_adjust', name='billing_type_enum'), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('balance_after', sa.BigInteger(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('idx_billing_merchant_id', 'billing_records', ['merchant_id'])
    op.create_index('idx_billing_task_id', 'billing_records', ['task_id'])

    # Upload Records
    op.create_table(
        'upload_records',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('merchant_id', sa.String(64), sa.ForeignKey('merchants.id'), nullable=False),
        sa.Column('original_filename', sa.String(512), nullable=True),
        sa.Column('oss_key', sa.String(1024), nullable=False),
        sa.Column('content_type', sa.String(128), nullable=True),
        sa.Column('size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('upload_type', sa.String(64), server_default='direct'),
        sa.Column('presigned_url', sa.Text(), nullable=True),
        sa.Column('is_confirmed', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('idx_upload_merchant_id', 'upload_records', ['merchant_id'])
    op.create_index('idx_upload_oss_key', 'upload_records', ['oss_key'])


def downgrade():
    op.drop_table('upload_records')
    op.drop_table('billing_records')
    op.drop_table('tasks')
    op.drop_table('api_keys')
    op.drop_table('merchants')

    op.execute("DROP TYPE IF EXISTS merchant_status_enum")
    op.execute("DROP TYPE IF EXISTS task_status_enum")
    op.execute("DROP TYPE IF EXISTS billing_type_enum")