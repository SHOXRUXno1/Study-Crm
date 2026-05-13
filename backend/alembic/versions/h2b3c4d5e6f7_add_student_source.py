"""Add source field to students

Revision ID: h2b3c4d5e6f7
Revises: g1a2b3c4d5e6
Create Date: 2026-05-03
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = "h2b3c4d5e6f7"
down_revision: Union[str, None] = "g1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("students", sa.Column("source", sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column("students", "source")
