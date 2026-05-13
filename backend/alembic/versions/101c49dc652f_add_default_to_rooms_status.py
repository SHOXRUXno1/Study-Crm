"""add_default_to_rooms_status

Revision ID: 101c49dc652f
Revises: s2l3m4n5o6p7
Create Date: 2026-05-13 13:20:42.117091

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '101c49dc652f'
down_revision: Union[str, None] = 's2l3m4n5o6p7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "rooms", "status",
        existing_type=sa.String(length=20),
        server_default="active",
        nullable=False,
    )
    # Backfill any existing rows that somehow have NULL status
    op.execute("UPDATE rooms SET status = 'active' WHERE status IS NULL")


def downgrade() -> None:
    op.alter_column(
        "rooms", "status",
        existing_type=sa.String(length=20),
        server_default=None,
        nullable=False,
    )
