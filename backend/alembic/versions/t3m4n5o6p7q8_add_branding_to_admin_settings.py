"""add branding columns to admin_settings

Revision ID: t3m4n5o6p7q8
Revises: s2l3m4n5o6p7
Create Date: 2026-05-28

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "t3m4n5o6p7q8"
down_revision: Union[str, None] = "72d431ed2df7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("admin_settings", sa.Column("brand_name", sa.String(length=120), nullable=True))
    op.add_column("admin_settings", sa.Column("brand_logo_base64", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("admin_settings", "brand_logo_base64")
    op.drop_column("admin_settings", "brand_name")
