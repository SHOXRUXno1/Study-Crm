"""create group_vacations table

Revision ID: j4d5e6f7g8h9
Revises: i3c4d5e6f7g8
Create Date: 2026-05-04
"""

import sqlalchemy as sa
from alembic import op

revision = "j4d5e6f7g8h9"
down_revision = "i3c4d5e6f7g8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "group_vacations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("vacation_date", sa.Date(), nullable=False),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("group_id", "vacation_date", name="uq_group_vacation_date"),
    )


def downgrade() -> None:
    op.drop_table("group_vacations")
