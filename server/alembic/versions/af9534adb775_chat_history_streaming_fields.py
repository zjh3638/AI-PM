"""chat_history streaming fields

Revision ID: af9534adb775
Revises: 2ce4fb552f82
Create Date: 2026-06-22 17:05:14.866423
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision: str = 'af9534adb775'
down_revision: Union[str, None] = '2ce4fb552f82'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chat_history", sa.Column("tool_calls", sa.JSON(), nullable=True))
    op.add_column("chat_history", sa.Column("tool_call_id", sa.String(64), nullable=True))
    op.add_column("chat_history", sa.Column("conversation_id", sa.String(36), nullable=True))
    op.create_index("ix_chat_history_conversation_id", "chat_history", ["conversation_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_history_conversation_id", "chat_history")
    op.drop_column("chat_history", "conversation_id")
    op.drop_column("chat_history", "tool_call_id")
    op.drop_column("chat_history", "tool_calls")
