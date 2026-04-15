# ================ FILE: D:\workspace\rjcut\alembic/versions/003_add_audio_man_id_to_dh_custom_persons.py ================

"""Add audio_man_id to dh_custom_persons

Revision ID: 003
Revises: 002
Create Date: 2026-04-15 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    # 添加 audio_man_id 字段
    op.add_column('dh_custom_persons', sa.Column('audio_man_id', sa.String(128), nullable=True))


def downgrade():
    # 删除字段
    op.drop_column('dh_custom_persons', 'audio_man_id')
