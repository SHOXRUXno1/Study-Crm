from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

# ── Enumerations (kept as Literals for OpenAPI clarity) ──────────────────────
AttendanceStatus = Literal["present", "absent", "late", "excused"]
AbsenceReasonCode = Literal["illness", "family", "other", "none"]
MarkedByRole = Literal["admin", "teacher"]


# ── A single mark as it travels in/out of the API ────────────────────────────
class AttendanceMarkRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    lesson_id: int
    student_id: int

    status: AttendanceStatus
    late_minutes: Optional[int] = None
    reason_code: Optional[AbsenceReasonCode] = None
    reason_text: Optional[str] = None

    marked_by_role: MarkedByRole
    marked_by_id: Optional[int] = None
    marked_by_name: Optional[str] = None

    created_at: datetime
    updated_at: datetime


class AttendanceMarkInput(BaseModel):
    """Single row inside ``AttendanceBulkUpsert.marks``."""

    student_id: int
    status: AttendanceStatus
    late_minutes: Optional[int] = Field(None, ge=0, le=240)
    reason_code: Optional[AbsenceReasonCode] = None
    reason_text: Optional[str] = Field(None, max_length=500)

    @model_validator(mode="after")
    def _check_consistency(self) -> "AttendanceMarkInput":
        if self.status == "late":
            if self.late_minutes is None:
                self.late_minutes = 0
        else:
            self.late_minutes = None
        if self.status not in ("absent", "excused"):
            self.reason_code = None
            self.reason_text = None
        return self


class AttendanceBulkUpsert(BaseModel):
    """Body for ``PUT /lessons/{id}/attendance``."""

    marks: list[AttendanceMarkInput] = Field(default_factory=list)


# ── Lesson + roster + marks (the journal cell view) ──────────────────────────
class AttendanceRosterStudent(BaseModel):
    student_id: int
    full_name: str
    payment_status: str
    mark: Optional[AttendanceMarkRead] = None


class LessonAttendanceRead(BaseModel):
    """Roster + marks for a specific lesson — payload for the lesson-detail
    journal modal in the schedule page."""

    lesson_id: int
    group_id: int
    group_code: str
    course_name: Optional[str] = None
    teacher_id: Optional[int] = None
    teacher_name: Optional[str] = None
    lesson_date: date
    start_time: time
    end_time: time
    status: str
    topic: Optional[str] = None
    notes: Optional[str] = None
    students: list[AttendanceRosterStudent]


# ── Group-level aggregate for the journal grid ───────────────────────────────
class JournalLesson(BaseModel):
    """Lightweight lesson descriptor used inside the journal grid."""

    id: int
    lesson_date: date
    start_time: time
    end_time: time
    status: str
    topic: Optional[str] = None


class JournalStudent(BaseModel):
    id: int
    full_name: str
    payment_status: str


class JournalMark(BaseModel):
    status: AttendanceStatus
    late_minutes: Optional[int] = None
    reason_code: Optional[AbsenceReasonCode] = None
    reason_text: Optional[str] = None


class JournalStudentStats(BaseModel):
    student_id: int
    present: int
    late: int
    absent: int
    excused: int
    total: int
    rate_pct: int  # 0..100


class GroupJournal(BaseModel):
    """Response shape for ``GET /groups/{id}/journal?from=&to=``.

    Lessons + students + sparse marks dictionary — perfect for the spreadsheet
    UI without the client needing extra requests.
    """

    group_id: int
    group_code: str
    course_name: Optional[str] = None
    teacher_id: Optional[int] = None
    teacher_name: Optional[str] = None
    days: str

    lessons: list[JournalLesson]
    students: list[JournalStudent]
    # marks[student_id][lesson_id] = JournalMark
    marks: dict[int, dict[int, JournalMark]] = Field(default_factory=dict)

    stats: list[JournalStudentStats] = Field(default_factory=list)
    overall_rate_pct: int = 0


# ── Per-student attendance log (Student profile / parent reports) ────────────
class StudentAttendanceEntry(BaseModel):
    lesson_id: int
    group_id: int
    group_code: str
    lesson_date: date
    start_time: time
    end_time: time
    lesson_status: str
    topic: Optional[str] = None

    status: AttendanceStatus
    late_minutes: Optional[int] = None
    reason_code: Optional[AbsenceReasonCode] = None
    reason_text: Optional[str] = None
