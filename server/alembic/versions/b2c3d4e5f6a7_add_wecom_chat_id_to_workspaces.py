"""add wecom_chat_id to workspaces

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-09 14:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 添加企业微信群聊ID字段
    op.add_column('workspaces', sa.Column('wecom_chat_id', sa.String(length=100), nullable=True))


def downgrade() -> None:
    # 回滚时删除字段
    op.drop_column('workspaces', 'wecom_chat_id')
