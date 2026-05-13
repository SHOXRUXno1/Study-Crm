"""Pydantic schemas for the Dashboard summary endpoint.

A single ``GET /dashboard/summary`` call returns everything the home page
needs: KPIs (this month + prev-period deltas + collection rate), today's
quick stats, today's lesson list, action items (what the admin should do
right now), top debtors, revenue and student-growth charts (last 12 months),
course distribution by active student count, and a recent-activity feed
that includes payments, new students, lesson cancellations / reschedules
and newly created groups.

Where types overlap with other modules, we reuse them:

* ``DebtorRead`` from :mod:`app.schemas.finance`
* ``RevenuePoint`` from :mod:`app.schemas.analytics`
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel

from app.schemas.analytics import RevenuePoint
from app.schemas.finance import DebtorRead


class DashboardKpis(BaseModel):
    students_total: int           # COUNT(students) WHERE is_active
    students_prev_total: int      # students existing 30 days ago (for the delta)
    groups_active: int            # COUNT(groups) WHERE status='active'
    groups_prev_active: int       # active groups 30 days ago
    revenue_month: int            # SUM(payments) for this calendar month so far
    revenue_prev_month: int       # SUM(payments) for the previous calendar month
    attendance_rate_pct: int      # (present + late) / total over month-to-date
    attendance_rate_prev_pct: int  # rolling window: today-60d..today-30d
    collection_rate_pct: int      # paid_MTD / billed_MTD across active students


class TodayStats(BaseModel):
    lessons_count: int            # non-cancelled lessons today
    lessons_completed: int        # status='completed' (or auto-promoted)
    lessons_active: int           # status='active' (in-progress right now)
    expected_students: int        # SUM of group.student_count over today's groups
    debtors_count: int
    today_payments_total: int
    today_payments_count: int


class TodayLessonRow(BaseModel):
    id: int
    group_id: int
    start_time: str               # "HH:MM"
    end_time: str
    course_name: Optional[str] = None
    group_code: str
    teacher_name: Optional[str] = None
    room_name: Optional[str] = None
    student_count: int
    status: Literal[
        "scheduled", "active", "completed", "cancelled", "rescheduled"
    ]


ActionItemKind = Literal[
    "pending_journal",
    "schedule_conflict",
    "new_student_no_group",
    "group_ending_soon",
    "low_attendance_group",
    "teacher_no_active_groups",
]
ActionItemSeverity = Literal["info", "warning", "critical"]


class ActionItem(BaseModel):
    """A single operational alert surfaced on the admin home page.

    Each row is a clickable shortcut into the place where the admin can
    actually resolve the problem (e.g. ``/journal`` for missing entries).
    """

    kind: ActionItemKind
    severity: ActionItemSeverity
    title: str                    # already localised on the server
    detail: Optional[str] = None
    link: str                     # e.g. "/journal" or "/students/123"
    count: int = 1                # aggregate count if the row summarises many


class CourseDistributionRow(BaseModel):
    course_id: Optional[int] = None
    course_name: str              # falls back to a localised "—" sentinel
    students_count: int


class StudentGrowthPoint(BaseModel):
    month: str                    # "YYYY-MM"
    new_students: int             # students whose created_at falls in this month
    total_students: int           # cumulative active total at end of month


ActivityKind = Literal[
    "payment",
    "student_added",
    "lesson_cancelled",
    "lesson_rescheduled",
    "group_created",
]


class ActivityItem(BaseModel):
    type: ActivityKind
    title: str
    detail: Optional[str] = None
    happened_at: datetime
    link: Optional[str] = None    # navigation target, when applicable


class DashboardSummary(BaseModel):
    today: date

    kpis: DashboardKpis
    today_stats: TodayStats

    today_lessons: list[TodayLessonRow]
    action_items: list[ActionItem]

    top_debtors: list[DebtorRead]
    debt_total: int

    revenue_by_month: list[RevenuePoint]
    students_growth: list[StudentGrowthPoint]
    course_distribution: list[CourseDistributionRow]

    recent_activity: list[ActivityItem]
