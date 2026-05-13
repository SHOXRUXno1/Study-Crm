"""normalize payments table to canonical schema

Older databases had a payments table with these legacy columns:
``payment_date``, ``comment``, ``group_id``, ``created_by_role``,
``created_by_id``. The current model only keeps ``paid_at``, ``note``, and
infers the group from the student's group_id. This migration brings the
table to the canonical shape — idempotently and on a per-column basis.

Revision ID: f8c9d0e1f2a3
Revises: f7b8c9d0e1f2
Create Date: 2026-04-27 19:55:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "f8c9d0e1f2a3"
down_revision: Union[str, None] = "f7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            -- payment_date → paid_at
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_name='payments' AND column_name='payment_date'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_name='payments' AND column_name='paid_at'
            ) THEN
                ALTER TABLE payments RENAME COLUMN payment_date TO paid_at;
            END IF;

            -- comment → note
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_name='payments' AND column_name='comment'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_name='payments' AND column_name='note'
            ) THEN
                ALTER TABLE payments RENAME COLUMN comment TO note;
            END IF;

            -- Drop legacy columns we don't model anymore.
            IF EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='payments' AND column_name='group_id') THEN
                ALTER TABLE payments DROP COLUMN group_id;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='payments' AND column_name='created_by_role') THEN
                ALTER TABLE payments DROP COLUMN created_by_role;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='payments' AND column_name='created_by_id') THEN
                ALTER TABLE payments DROP COLUMN created_by_id;
            END IF;
        END $$;
        """
    )

    # Make sure paid_at and note exist (they will after the renames above on
    # legacy DBs; for fresh DBs the create_table revision already added them).
    op.execute("ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at DATE")
    op.execute("ALTER TABLE payments ADD COLUMN IF NOT EXISTS note TEXT")

    # Convert ``note`` to TEXT if it was created as VARCHAR.
    op.execute("ALTER TABLE payments ALTER COLUMN note TYPE TEXT USING note::text")

    # Indexes the model expects (idempotent).
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_payments_student_paid_at "
        "ON payments (student_id, paid_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_payments_paid_at ON payments (paid_at)"
    )


def downgrade() -> None:
    # No reverse — the legacy columns are not coming back.
    pass
