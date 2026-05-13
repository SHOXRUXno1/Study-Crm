from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

LessonStatus = Literal["scheduled", "cancelled", "completed", "rescheduled"]


# ── Read (flat, with joined group/course/teacher/room fields) ─────────────────
class LessonRead(BaseModel):
    """Plain JSON object for a single lesson + denormalised group context.

    Built explicitly in the `lessons` API handlers so the schedule UI doesn't
    need a second query per row.
    """

    model_config = {"from_attributes": True}

    id: int
    group_id: int
    group_code: str
    course_id: Optional[int] = None
    course_name: Optional[str] = None
    teacher_id: Optional[int] = None
    teacher_name: Optional[str] = None
    room_id: Optional[int] = None
    room_name: Optional[str] = None

    lesson_date: date
    start_time: time
    end_time: time

    status: LessonStatus
    note: Optional[str] = None
    topic: Optional[str] = None
    notes: Optional[str] = None
    rescheduled_from_id: Optional[int] = None

    days: str
    max_students: int
    student_count: int
    duration_months: int

    created_at: datetime
    updated_at: datetime


# ── Update (admin can patch any field) ────────────────────────────────────────
class LessonUpdate(BaseModel):
    teacher_id: Optional[int] = None
    room_id: Optional[int] = None
    lesson_date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    status: Optional[LessonStatus] = None
    note: Optional[str] = Field(None, max_length=500)
    topic: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=2000)

    @model_validator(mode="after")
    def _check_times(self) -> "LessonUpdate":
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be greater than start_time")
        return self


# ── Lesson topic patch (for teachers — restricted set of fields) ─────────────
class LessonJournalUpdate(BaseModel):
    """Fields a teacher can set from the journal UI for their own lesson."""

    topic: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=2000)


# ── Reschedule (creates a new lesson, marks old as rescheduled) ────────────────
class LessonReschedule(BaseModel):
    new_date: date
    new_start_time: time
    new_end_time: time
    note: Optional[str] = Field(None, max_length=500)

    @model_validator(mode="after")
    def _check_times(self) -> "LessonReschedule":
        if self.new_end_time <= self.new_start_time:
            raise ValueError("new_end_time must be greater than new_start_time")
        return self


# ── Cancel ────────────────────────────────────────────────────────────────────
class LessonCancel(BaseModel):
    note: Optional[str] = Field(None, max_length=500)
