"""seed default course catalog

Revision ID: s2l3m4n5o6p7
Revises: r1k2l3m4n5o6
Create Date: 2026-05-13

Idempotent INSERTs — skips names that already exist (case-insensitive).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "s2l3m4n5o6p7"
down_revision = "r1k2l3m4n5o6"
branch_labels = None
depends_on = None

DEFAULT_COURSES = (
    "English",
    "Grammar",
    "Pre-IELTS",
    "KIDS' English",
    "IELTS",
    "CEFR",
)


def upgrade() -> None:
    conn = op.get_bind()
    for name in DEFAULT_COURSES:
        # Two bound params (same value) — asyncpg rejects a single :name in SELECT + subquery
        conn.execute(
            sa.text(
                """
                INSERT INTO courses (name, description, is_active, created_at, updated_at)
                SELECT :name_insert, NULL, true, NOW(), NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM courses c
                    WHERE lower(trim(c.name)) = lower(trim(:name_check))
                )
                """
            ),
            {"name_insert": name, "name_check": name},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for name in DEFAULT_COURSES:
        conn.execute(
            sa.text(
                "DELETE FROM courses WHERE lower(trim(name)) = lower(trim(:name))"
            ),
            {"name": name},
        )
