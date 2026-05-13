"""add payments table + students.finance_note

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-04-27 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # students.finance_note — free-form note for the debtors workflow.
    op.add_column("students", sa.Column("finance_note", sa.Text(), nullable=True))

    # payments — one row per accepted payment.
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(length=16), nullable=False),
        sa.Column("paid_at", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payments_id"), "payments", ["id"], unique=False)
    op.create_index(op.f("ix_payments_student_id"), "payments", ["student_id"], unique=False)
    op.create_index(
        "ix_payments_student_paid_at",
        "payments",
        ["student_id", "paid_at"],
        unique=False,
    )
    op.create_index("ix_payments_paid_at", "payments", ["paid_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_payments_paid_at", table_name="payments")
    op.drop_index("ix_payments_student_paid_at", table_name="payments")
    op.drop_index(op.f("ix_payments_student_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_id"), table_name="payments")
    op.drop_table("payments")

    op.drop_column("students", "finance_note")
