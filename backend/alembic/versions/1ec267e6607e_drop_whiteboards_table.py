"""drop_whiteboards_table

Revision ID: 1ec267e6607e
Revises: 101c49dc652f
Create Date: 2026-05-13 13:54:13.175501

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '1ec267e6607e'
down_revision: Union[str, None] = '101c49dc652f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("whiteboards")


def downgrade() -> None:
    op.create_table(
        "whiteboards",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_subject", sa.String(length=80), nullable=False),
        sa.Column("owner_role", sa.String(length=20), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_subject", "owner_role", name="uq_whiteboards_owner"),
    )
