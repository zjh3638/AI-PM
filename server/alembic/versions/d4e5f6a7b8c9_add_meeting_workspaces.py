"""add meeting_workspaces table

Revision ID: d4e5f6a7b8c9
Revises: f4f8b7372aba
Create Date: 2026-07-16 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'f4f8b7372aba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import text

    # Idempotent: skip if table already exists (migration may have already run)
    conn = op.get_bind()
    table_exists = conn.execute(
        text("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'meeting_workspaces')")
    ).scalar()
    if table_exists:
        return

    op.create_table(
        'meeting_workspaces',
        sa.Column('meeting_id', sa.String(length=36), nullable=False),
        sa.Column('workspace_id', sa.String(length=36), nullable=False),
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('meeting_id', 'workspace_id', name='uq_meeting_workspace'),
    )
    op.create_index(op.f('ix_meeting_workspaces_meeting_id'), 'meeting_workspaces', ['meeting_id'], unique=False)
    op.create_index(op.f('ix_meeting_workspaces_workspace_id'), 'meeting_workspaces', ['workspace_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_meeting_workspaces_workspace_id'), table_name='meeting_workspaces')
    op.drop_index(op.f('ix_meeting_workspaces_meeting_id'), table_name='meeting_workspaces')
    op.drop_table('meeting_workspaces')
