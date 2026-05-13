"""add owner (subject, role) to sessions

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-26 01:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Все существующие сессии — админские (фича была admin-only до сегодня).
    op.add_column(
        'sessions',
        sa.Column('subject', sa.String(length=80), nullable=False, server_default='admin'),
    )
    op.add_column(
        'sessions',
        sa.Column('role', sa.String(length=16), nullable=False, server_default='admin'),
    )
    op.create_index(op.f('ix_sessions_subject'), 'sessions', ['subject'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_sessions_subject'), table_name='sessions')
    op.drop_column('sessions', 'role')
    op.drop_column('sessions', 'subject')
