"""Consolidate student name fields into full_name, drop address

Revision ID: g1a2b3c4d5e6
Revises: b3c4d5e6f7a8
Create Date: 2026-05-03
"""
from typing import Union

from alembic import op
import sqlalchemy as sa

revision: str = "g1a2b3c4d5e6"
down_revision: Union[str, None] = "b3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add full_name column (temporarily nullable for backfill)
    op.add_column("students", sa.Column("full_name", sa.String(255), nullable=True))

    # 2. Populate full_name from existing fields
    op.execute(
        """
        UPDATE students
        SET full_name = TRIM(
            COALESCE(last_name, '') || ' ' ||
            COALESCE(first_name, '') || ' ' ||
            COALESCE(middle_name, '')
        )
        """
    )

    # 3. Make full_name NOT NULL and indexed
    op.alter_column("students", "full_name", nullable=False)
    op.create_index("ix_students_full_name", "students", ["full_name"])

    # 4. Drop old columns
    op.drop_index("ix_students_last_name", table_name="students")
    op.drop_column("students", "first_name")
    op.drop_column("students", "last_name")
    op.drop_column("students", "middle_name")
    op.drop_column("students", "address")


def downgrade() -> None:
    op.add_column("students", sa.Column("address", sa.String(255), nullable=True))
    op.add_column("students", sa.Column("middle_name", sa.String(80), nullable=True))
    op.add_column("students", sa.Column("last_name", sa.String(80), nullable=True))
    op.add_column("students", sa.Column("first_name", sa.String(80), nullable=True))

    # Best-effort: put full_name into last_name
    op.execute("UPDATE students SET last_name = full_name, first_name = ''")
    op.alter_column("students", "first_name", nullable=False)
    op.alter_column("students", "last_name", nullable=False)
    op.create_index("ix_students_last_name", "students", ["last_name"])

    op.drop_index("ix_students_full_name", table_name="students")
    op.drop_column("students", "full_name")
