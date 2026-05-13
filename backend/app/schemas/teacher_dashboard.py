"""Pydantic schemas for the Teacher Cabinet summary endpoint.

A single ``GET /api/v1/teacher/summary`` call returns everything the teacher's
home page needs:

* KPI block with week/month dynamics (lessons done vs. planned, attendance
  rate this week vs. previous, pending journals).
* Action items: pending journals (past lessons without topic / attendance)
  and a count of concerning students.
* Schedule: current/next lesson, today's full timeline, the next 7 days.
* Weekly attendance trend (last 4 ISO weeks).
* My groups with health metrics (attendance %, fill %, debtors count, next
  lesson date, color-coded health).
* Top concerning students (≥3 absences or ≥3 lates over the last 30 days).

Where types overlap with other modules they are reused:

* ``DebtorRead`` is intentionally *not* used here — teachers must not see
  finance details, just the count per group.
"""

from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel


# ── Reused row type for any "lesson-like" item in the response ────────────
class TeacherLessonRow(BaseModel):
    id: int
    group_id: int
    group_code: str
    course_name: Optional[str] = None
    room_name: Optional[str] = None
    teacher_name: Optional[str] = None

    lesson_date: date
    start_time: str           # "HH:MM"
    end_time: str             # "HH:MM"

    student_count: int
    max_students: int
    topic: Optional[str] = None
    has_attendance: bool = False

    # Same canonical lifecycle as the rest of the app, plus auto-promoted
    # ``active`` when now() falls inside the slot (today only).
    status: Literal[
        "scheduled", "active", "completed", "cancelled", "rescheduled"
    ]


class TeacherKpis(BaseModel):
    my_groups_total: int
    my_groups_active: int
    my_students_total: int

    lessons_today: int           # non-cancelled / non-rescheduled count
    lessons_week_done: int       # status='completed' Mon..today
    lessons_week_planned: int    # completed + scheduled (Mon..Sun current week)
    lessons_month_done: int      # last 30 days

    attendance_rate_week_pct: int    # last 7 days, my groups
    attendance_rate_month_pct: int   # last 30 days
    attendance_delta_pct: int        # this week minus prev week (signed)

    pending_journals_count: int      # past 14 days, missing topic OR no marks


class PendingJournal(BaseModel):
    lesson_id: int
    group_id: int
    group_code: str
    course_name: Optional[str] = None
    lesson_date: date
    start_time: str            # "HH:MM"
    days_ago: int
    missing_topic: bool
    missing_attendance: bool


class ActionItems(BaseModel):
    pending_journals: list[PendingJournal]
    concerning_students_count: int


class WeeklyAttendancePoint(BaseModel):
    week_label: str            # "W1" .. "W4"  (oldest → newest)
    week_start: date
    week_end: date
    rate_pct: int
    total_marks: int


class TeacherGroupRow(BaseModel):
    id: int
    code: str
    course_name: Optional[str] = None
    days: str
    time_slot: str             # "HH:MM \u2013 HH:MM"
    student_count: int
    max_students: int
    fill_pct: int
    attendance_rate_pct: int   # over the last 30 days, this group
    debtors_count: int         # active students in this group with debt > 0
    next_lesson_date: Optional[date] = None
    health: Literal["good", "warn", "bad"]


class ConcernStudent(BaseModel):
    student_id: int
    full_name: str
    group_id: int
    group_code: str
    absent_count: int
    late_count: int
    attendance_rate_pct: int
    last_absent_at: Optional[date] = None


class TeacherSummary(BaseModel):
    today: date
    teacher_id: int
    teacher_name: Optional[str] = None

    kpis: TeacherKpis
    action_items: ActionItems

    current_lesson: Optional[TeacherLessonRow] = None
    next_lesson: Optional[TeacherLessonRow] = None
    today_lessons: list[TeacherLessonRow]
    upcoming_week: list[TeacherLessonRow]

    weekly_attendance: list[WeeklyAttendancePoint]
    my_groups: list[TeacherGroupRow]
    top_concerns: list[ConcernStudent]
