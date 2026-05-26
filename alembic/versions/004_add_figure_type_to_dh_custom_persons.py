# ================ FILE: D:\workspace\rjcut\alembic/versions/004_add_figure_type_to_dh_custom_persons.py ================

"""Add figure_type to dh_custom_persons

Revision ID: 004
Revises: 003
Create Date: 2026-04-15 01:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    # 添加 figure_type 字段
    op.add_column('dh_custom_persons', sa.Column('figure_type', sa.String(64), nullable=True))


def downgrade():
    # 删除字段
    op.drop_column('dh_custom_persons', 'figure_type')