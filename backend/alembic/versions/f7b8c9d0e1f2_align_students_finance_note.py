"""align students.finance_note column

Some installations had a legacy ``debtor_note`` column added outside of
Alembic. The previous revision tried to add ``finance_note`` but on those
databases it could fail or simply skip if applied partially. This migration
brings every database to the same shape:

- ensure ``finance_note`` exists,
- copy contents from legacy ``debtor_note`` if present,
- drop the legacy column.

Revision ID: f7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-04-27 19:50:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "f7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Make sure finance_note exists (works in any state).
    op.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS finance_note TEXT")

    # 2. Copy from legacy debtor_note if it's present and finance_note empty.
    #    Wrapped in DO block so it's a no-op when debtor_note is missing.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'students' AND column_name = 'debtor_note'
            ) THEN
                UPDATE students
                   SET finance_note = debtor_note
                 WHERE finance_note IS NULL AND debtor_note IS NOT NULL;
                ALTER TABLE students DROP COLUMN debtor_note;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    # We don't reverse the merge — finance_note is the canonical column.
    op.execute("ALTER TABLE students DROP COLUMN IF EXISTS finance_note")
