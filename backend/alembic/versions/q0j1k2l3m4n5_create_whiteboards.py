"""create whiteboards table

Revision ID: q0j1k2l3m4n5
Revises: p9i0j1k2l3m4
Create Date: 2026-05-12
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "q0j1k2l3m4n5"
down_revision = "p9i0j1k2l3m4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "whiteboards",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("owner_subject", sa.String(length=255), nullable=False),
        sa.Column("owner_role", sa.String(length=20), nullable=False),
        sa.Column(
            "data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "owner_subject", "owner_role", name="uq_whiteboards_owner"
        ),
    )


def downgrade() -> None:
    op.drop_table("whiteboards")
