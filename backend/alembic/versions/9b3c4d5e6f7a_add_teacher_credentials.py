"""add teacher credentials (username, password_hash)

Revision ID: 9b3c4d5e6f7a
Revises: 0e7001973b59
Create Date: 2026-04-26 00:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9b3c4d5e6f7a'
down_revision: Union[str, None] = '0e7001973b59'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'teachers',
        sa.Column('username', sa.String(length=40), nullable=True),
    )
    op.add_column(
        'teachers',
        sa.Column('password_hash', sa.String(length=255), nullable=True),
    )
    op.create_index(
        op.f('ix_teachers_username'), 'teachers', ['username'], unique=True
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_teachers_username'), table_name='teachers')
    op.drop_column('teachers', 'password_hash')
    op.drop_column('teachers', 'username')
