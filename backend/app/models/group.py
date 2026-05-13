from __future__ import annotations

from datetime import date, time
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, ForeignKey, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.course import Course
    from app.models.room import Room
    from app.models.teacher import Teacher


class Group(Base, TimestampMixin):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)

    course_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("courses.id", ondelete="SET NULL"), nullable=True
    )
    teacher_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True
    )
    room_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True
    )

    # "odd"  → Mon / Wed / Fri
    # "even" → Tue / Thu / Sat
    days: Mapped[str] = mapped_column(String(10), nullable=False, default="odd")

    # Recurring weekly time window for the group's lessons.
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    max_students: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    student_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # price in UZS / month
    price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_months: Mapped[int] = mapped_column(Integer, nullable=False, default=3)

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    # active | completed — auto-derived from end_date by the API layer
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")

    # ── Relationships ──────────────────────────────────────────────────────────
    course: Mapped[Optional["Course"]] = relationship("Course", lazy="selectin")
    teacher: Mapped[Optional["Teacher"]] = relationship("Teacher", lazy="selectin")
    room: Mapped[Optional["Room"]] = relationship("Room", lazy="selectin")

    # ── Computed properties for Pydantic serialisation ─────────────────────────
    @property
    def course_name(self) -> Optional[str]:
        return self.course.name if self.course else None

    @property
    def teacher_name(self) -> Optional[str]:
        if not self.teacher:
            return None
        parts = [self.teacher.last_name, self.teacher.first_name, self.teacher.middle_name]
        return " ".join(p for p in parts if p)

    @property
    def room_name(self) -> Optional[str]:
        return self.room.name if self.room else None

    @property
    def time_slot(self) -> str:
        """Human-readable HH:MM – HH:MM, derived from start_time/end_time.

        Kept for backward compatibility with clients that still display
        `time_slot` (e.g. the Groups list / GroupProfile header).
        """
        return f"{self.start_time:%H:%M} \u2013 {self.end_time:%H:%M}"
