"""backfill students.payment_status: 'pending' -> 'paid'

The ``pending`` status semantically meant "billing has not started yet"
(group has no price OR no months have been accrued). In every such case
``total_paid (0) >= total_due (0)``, i.e. there is no actual debt — so the
correct collapsed value is ``paid``.

After this migration the application contract is strict:
``payment_status`` is always one of ``paid`` | ``debt``.

Revision ID: l6f7g8h9i0j1
Revises: k5e6f7g8h9i0
Create Date: 2026-05-05
"""

from alembic import op


revision = "l6f7g8h9i0j1"
down_revision = "k5e6f7g8h9i0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE students SET payment_status = 'paid' WHERE payment_status = 'pending'"
    )


def downgrade() -> None:
    # Irreversible by design: 'pending' is no longer a valid value in the
    # app's domain. Rolling back is a no-op.
    pass
