# FILE: /root/workspaces/rjcut/alembic/versions/002_add_file_hash_and_expires.py

"""Add file_hash and expires_at to upload_records

Revision ID: 002
Revises: 001
Create Date: 2026-04-13 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    # 添加 file_hash 字段
    op.add_column('upload_records', sa.Column('file_hash', sa.String(64), nullable=True))
    
    # 添加 expires_at 字段
    op.add_column('upload_records', sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True))
    
    # 创建索引以优化查询
    op.create_index('idx_upload_merchant_hash', 'upload_records', ['merchant_id', 'file_hash'])
    op.create_index('idx_upload_expires_at', 'upload_records', ['expires_at'])


def downgrade():
    # 删除索引
    op.drop_index('idx_upload_expires_at', table_name='upload_records')
    op.drop_index('idx_upload_merchant_hash', table_name='upload_records')
    
    # 删除字段
    op.drop_column('upload_records', 'expires_at')
    op.drop_column('upload_records', 'file_hash')
