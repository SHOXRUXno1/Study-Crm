"""add unique constraint on (group_id, lesson_date, start_time) for lessons

Concurrent sync passes (or duplicate POST /reschedule calls) could insert two
rows for the same business slot. We add a UNIQUE constraint to make this
impossible at the DB level.

Before adding the constraint, we dedupe any pre-existing duplicates by keeping
the lowest id for each (group_id, lesson_date, start_time) tuple.

Revision ID: a9d3f5b1c2e8
Revises: f8c9d0e1f2a3
Create Date: 2026-04-27 21:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a9d3f5b1c2e8"
down_revision: Union[str, None] = "f8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CONSTRAINT_NAME = "uq_lessons_group_date_start"


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Dedupe duplicates, keeping the smallest id for each tuple. Attendance
    #    rows for the dropped lessons cascade via the existing FK ON DELETE.
    bind.execute(
        sa.text(
            """
            DELETE FROM lessons
            WHERE id IN (
                SELECT id FROM (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               PARTITION BY group_id, lesson_date, start_time
                               ORDER BY id
                           ) AS rn
                    FROM lessons
                ) t
                WHERE t.rn > 1
            )
            """
        )
    )

    # 2. Add the constraint.
    op.create_unique_constraint(
        CONSTRAINT_NAME,
        "lessons",
        ["group_id", "lesson_date", "start_time"],
    )


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT_NAME, "lessons", type_="unique")
