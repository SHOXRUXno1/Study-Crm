from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.lesson import Lesson
    from app.models.student import Student
    from app.models.teacher import Teacher


class Attendance(Base, TimestampMixin):
    """Attendance mark for a single (lesson, student) pair.

    The pair is unique — exactly one mark per student per lesson. Marks for
    cancelled/rescheduled lessons are kept (they describe history). Marks are
    upserted in bulk through ``PUT /api/v1/lessons/{id}/attendance``.

    ``marked_by_role`` is "admin" or "teacher"; for teacher marks
    ``marked_by_id`` references that teacher. For admin marks it stays NULL.
    """

    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint(
            "lesson_id", "student_id", name="uq_attendance_lesson_student"
        ),
        Index("ix_attendance_student_lesson", "student_id", "lesson_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    lesson_id: Mapped[int] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # present | absent | late | excused
    status: Mapped[str] = mapped_column(String(8), nullable=False, default="present")
    # Only meaningful when status == "late"
    late_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # illness | family | other | none — only meaningful for absent / excused
    reason_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    reason_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # admin | teacher
    marked_by_role: Mapped[str] = mapped_column(String(10), nullable=False, default="admin")
    marked_by_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True
    )

    # ── Relationships ────────────────────────────────────────────────────────
    lesson: Mapped["Lesson"] = relationship("Lesson", lazy="selectin")
    student: Mapped["Student"] = relationship("Student", lazy="selectin")
    marked_by: Mapped[Optional["Teacher"]] = relationship(
        "Teacher", lazy="selectin", foreign_keys=[marked_by_id]
    )
