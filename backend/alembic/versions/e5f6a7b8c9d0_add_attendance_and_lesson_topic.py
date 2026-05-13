"""add attendance table + lesson topic/notes

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-26 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── lessons: per-lesson plan & journal metadata ───────────────────────────
    op.add_column("lessons", sa.Column("topic", sa.Text(), nullable=True))
    op.add_column("lessons", sa.Column("notes", sa.Text(), nullable=True))

    # ── attendance: one row per (lesson_id, student_id) ───────────────────────
    op.create_table(
        "attendance",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=8), nullable=False),
        sa.Column("late_minutes", sa.Integer(), nullable=True),
        sa.Column("reason_code", sa.String(length=20), nullable=True),
        sa.Column("reason_text", sa.Text(), nullable=True),
        sa.Column("marked_by_role", sa.String(length=10), nullable=False),
        sa.Column("marked_by_id", sa.Integer(), nullable=True),
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
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["marked_by_id"], ["teachers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "lesson_id", "student_id", name="uq_attendance_lesson_student"
        ),
    )
    op.create_index(op.f("ix_attendance_id"), "attendance", ["id"], unique=False)
    op.create_index(op.f("ix_attendance_lesson_id"), "attendance", ["lesson_id"], unique=False)
    op.create_index(op.f("ix_attendance_student_id"), "attendance", ["student_id"], unique=False)
    op.create_index(
        "ix_attendance_student_lesson",
        "attendance",
        ["student_id", "lesson_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_attendance_student_lesson", table_name="attendance")
    op.drop_index(op.f("ix_attendance_student_id"), table_name="attendance")
    op.drop_index(op.f("ix_attendance_lesson_id"), table_name="attendance")
    op.drop_index(op.f("ix_attendance_id"), table_name="attendance")
    op.drop_table("attendance")

    op.drop_column("lessons", "notes")
    op.drop_column("lessons", "topic")
