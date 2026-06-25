"""add_ldap_dn_to_departments

Revision ID: e7c6311058d8
Revises: 16c76796466c
Create Date: 2026-06-23 19:57:14.200601
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7c6311058d8'
down_revision: Union[str, None] = '16c76796466c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('departments') as batch_op:
        batch_op.add_column(sa.Column('ldap_dn', sa.String(length=500), nullable=True))
        batch_op.create_unique_constraint('uq_departments_ldap_dn', ['ldap_dn'])


def downgrade() -> None:
    with op.batch_alter_table('departments') as batch_op:
        batch_op.drop_constraint('uq_departments_ldap_dn', type_='unique')
        batch_op.drop_column('ldap_dn')
