"""create student_transfers table

Revision ID: r1k2l3m4n5o6
Revises: q0j1k2l3m4n5
Create Date: 2026-05-12
"""

import sqlalchemy as sa
from alembic import op

revision = "r1k2l3m4n5o6"
down_revision = "q0j1k2l3m4n5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "student_transfers",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "student_id",
            sa.Integer(),
            sa.ForeignKey("students.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "from_group_id",
            sa.Integer(),
            sa.ForeignKey("groups.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "to_group_id",
            sa.Integer(),
            sa.ForeignKey("groups.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("transfer_date", sa.Date(), nullable=False),
        sa.Column("prev_debt", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("debt_action", sa.String(16), nullable=False),
        sa.Column(
            "adjustment_payment_id",
            sa.Integer(),
            sa.ForeignKey("payments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("performed_by_subject", sa.String(64), nullable=False),
        sa.Column("performed_by_role", sa.String(16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("student_transfers")
