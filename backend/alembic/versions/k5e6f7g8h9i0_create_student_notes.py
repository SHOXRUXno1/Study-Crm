"""create student_notes table

Revision ID: k5e6f7g8h9i0
Revises: j4d5e6f7g8h9
Create Date: 2026-05-04
"""

import sqlalchemy as sa
from alembic import op

revision = "k5e6f7g8h9i0"
down_revision = "j4d5e6f7g8h9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "student_notes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("student_notes")
