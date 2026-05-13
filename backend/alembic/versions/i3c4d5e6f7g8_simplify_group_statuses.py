"""simplify group statuses to active/completed

Revision ID: i3c4d5e6f7g8
Revises: h2b3c4d5e6f7
Create Date: 2026-05-04
"""

from alembic import op

revision = "i3c4d5e6f7g8"
down_revision = "h2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE groups SET status = 'active' WHERE status IN ('upcoming', 'paused')")


def downgrade() -> None:
    pass
