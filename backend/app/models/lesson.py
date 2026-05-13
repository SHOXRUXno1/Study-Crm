from __future__ import annotations

from datetime import date, time
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, ForeignKey, Index, Integer, String, Text, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.group import Group
    from app.models.room import Room
    from app.models.teacher import Teacher


class Lesson(Base, TimestampMixin):
    """Concrete materialised lesson — one row per real (date, group) occurrence.

    Generated from a `Group`'s recurring template (`days` + `start_time`/`end_time`)
    by `app.services.schedule_service.sync_future_lessons`. Historical rows
    (cancelled / completed / rescheduled) are never overwritten by re-sync.
    """

    __tablename__ = "lessons"
    __table_args__ = (
        Index("ix_lessons_date_time", "lesson_date", "start_time"),
        # Concurrent sync passes (or accidental double POSTs) must not be able
        # to create two rows for the same business slot. Cancelled/rescheduled
        # lessons keep the slot occupied by design — re-sync sees the row and
        # skips creating a duplicate.
        UniqueConstraint(
            "group_id", "lesson_date", "start_time",
            name="uq_lessons_group_date_start",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    teacher_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    room_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True, index=True
    )

    lesson_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    # scheduled | cancelled | completed | rescheduled
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="scheduled", index=True
    )
    # Lifecycle note (e.g. why cancelled / rescheduled).
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Pedagogical topic of the session (filled by teacher in the journal).
    topic: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Free-form teacher's journal notes (homework, observations, etc.).
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # If this lesson was created via /reschedule, points back to the original.
    rescheduled_from_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True
    )

    # ── Relationships (eager-loaded for the schedule view) ─────────────────────
    group: Mapped["Group"] = relationship("Group", lazy="selectin")
    teacher: Mapped[Optional["Teacher"]] = relationship("Teacher", lazy="selectin")
    room: Mapped[Optional["Room"]] = relationship("Room", lazy="selectin")
