"""add position and extra fields to staff tables

Revision ID: u1v2w3x4y5z6
Revises: t3m4n5o6p7q8
Create Date: 2026-05-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "u1v2w3x4y5z6"
down_revision: Union[str, None] = "t3m4n5o6p7q8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # teachers: add position column
    op.add_column(
        "teachers",
        sa.Column(
            "position",
            sa.String(length=40),
            nullable=False,
            server_default="teacher",
        ),
    )

    # managers: add position + personal info columns
    op.add_column(
        "managers",
        sa.Column(
            "position",
            sa.String(length=40),
            nullable=False,
            server_default="manager",
        ),
    )
    op.add_column("managers", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("managers", sa.Column("hire_date",  sa.Date(), nullable=True))
    op.add_column("managers", sa.Column("gender",     sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column("managers", "gender")
    op.drop_column("managers", "hire_date")
    op.drop_column("managers", "birth_date")
    op.drop_column("managers", "position")
    op.drop_column("teachers", "position")
