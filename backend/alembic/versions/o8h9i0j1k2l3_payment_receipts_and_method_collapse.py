"""create payment receipts and collapse payment methods

Revision ID: o8h9i0j1k2l3
Revises: n7g8h9i0j1k2
Create Date: 2026-05-09 18:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "o8h9i0j1k2l3"
down_revision: Union[str, None] = "n7g8h9i0j1k2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payment_receipts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("payment_id", sa.Integer(), nullable=False),
        sa.Column("original_name", sa.Text(), nullable=False),
        sa.Column("stored_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("stored_name", name="uq_payment_receipts_stored_name"),
    )
    op.create_index(
        "ix_payment_receipts_payment_id", "payment_receipts", ["payment_id"], unique=False
    )

    op.execute("UPDATE payments SET method='transfer' WHERE method='card'")

    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_method")
    op.create_check_constraint(
        "ck_payments_method",
        "payments",
        "method IN ('cash', 'transfer')",
    )


def downgrade() -> None:
    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_method")
    op.create_check_constraint(
        "ck_payments_method",
        "payments",
        "method IN ('cash', 'card', 'transfer')",
    )
    op.drop_index("ix_payment_receipts_payment_id", table_name="payment_receipts")
    op.drop_table("payment_receipts")
