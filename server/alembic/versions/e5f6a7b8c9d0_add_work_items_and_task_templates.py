"""add work_items to tasks and create task_templates table

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-21 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. tasks: 新增工作清单与模板来源字段 ---
    op.add_column('tasks', sa.Column('work_items', sa.JSON(), nullable=True))
    op.add_column('tasks', sa.Column('created_from_template_id', sa.String(length=36), nullable=True))
    op.add_column('tasks', sa.Column('created_from_template_name', sa.String(length=200), nullable=True))

    # --- 2. task_templates: 任务模板表 ---
    op.create_table(
        'task_templates',
        sa.Column('workspace_id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('task_type', sa.String(length=20), nullable=False),
        sa.Column('title_template', sa.String(length=500), nullable=False),
        sa.Column('description_template', sa.Text(), nullable=True),
        sa.Column('priority', sa.String(length=20), nullable=False),
        sa.Column('phase', sa.String(length=30), nullable=False),
        sa.Column('estimation', sa.Float(), nullable=True),
        sa.Column('estimation_unit', sa.String(length=20), nullable=True),
        sa.Column('work_items_template', sa.JSON(), nullable=True),
        sa.Column('category', sa.String(length=50), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('creator_id', sa.String(length=36), nullable=False),
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ),
        sa.ForeignKeyConstraint(['creator_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_task_templates_workspace_id'), 'task_templates', ['workspace_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_task_templates_workspace_id'), table_name='task_templates')
    op.drop_table('task_templates')
    op.drop_column('tasks', 'created_from_template_name')
    op.drop_column('tasks', 'created_from_template_id')
    op.drop_column('tasks', 'work_items')
