"""add chat_history.content_json for multimodal messages

Revision ID: a1b2c3d4e5f6
Revises: 9f0caa3a724c
Create Date: 2026-07-08 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '9f0caa3a724c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # additive nullable column — zero-downtime, no backfill required
    op.add_column('chat_history', sa.Column('content_json', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('chat_history', 'content_json')
