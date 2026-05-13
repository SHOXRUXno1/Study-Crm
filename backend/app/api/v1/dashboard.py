"""Dashboard API — admin-only.

Single endpoint that powers the Home (`Главная`) page in one round-trip.

Returns:

* KPIs for the current month (students, groups, revenue + delta vs prev,
  attendance rate + prev rolling window, MTD collection rate).
* Today's quick stats (lesson count split by status, expected students,
  debtors snapshot, payments today).
* Today's lesson list (status auto-promoted to ``active`` when ``now()``
  falls between ``start_time`` and ``end_time``).
* Action items: pending journals, schedule conflicts, students without a
  group, groups ending soon, low-attendance groups, idle teachers.
* Top-5 debtors with trend (reuses ``compute_trends`` from finance).
* 12-month revenue trend.
* 12-month student-growth trend (new + cumulative).
* Course distribution by *active student count* (different from analytics,
  which groups by revenue).
* Recent activity feed: payments, new students, lesson cancellations /
  reschedules and newly created groups, merged and truncated by ``happened_at``.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import case, desc, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.attendance import Attendance
from app.models.course import Course
from app.models.group import Group
from app.models.lesson import Lesson
from app.models.payment import Payment
from app.models.student import Student
from app.models.teacher import Teacher
from app.schemas.analytics import RevenuePoint
from app.schemas.auth import AuthUser
from app.schemas.dashboard import (
    ActionItem,
    ActivityItem,
    CourseDistributionRow,
    DashboardKpis,
    DashboardSummary,
    StudentGrowthPoint,
    TodayLessonRow,
    TodayStats,
)
from app.schemas.finance import DebtorRead
from app.services.conflict_service import count_open_conflicts
from app.services.finance_service import (
    compute_billing_many,
    compute_trends,
)


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ── Helpers ─────────────────────────────────────────────────────────────────
def _first_of_month(d: date) -> date:
    return date(d.year, d.month, 1)


def _add_months(d: date, n: int) -> date:
    total = d.year * 12 + (d.month - 1) + n
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


def _month_iter(start: date, end: date) -> list[str]:
    out: list[str] = []
    cur = _first_of_month(start)
    last = _first_of_month(end)
    while cur <= last:
        out.append(f"{cur.year:04d}-{cur.month:02d}")
        cur = _add_months(cur, 1)
    return out


def _hhmm(t) -> str:
    return f"{t.hour:02d}:{t.minute:02d}"


def _teacher_full_name(teacher) -> Optional[str]:
    if teacher is None:
        return None
    parts = [teacher.last_name, teacher.first_name, teacher.middle_name]
    return " ".join(p for p in parts if p) or None


# ── Attendance helpers ──────────────────────────────────────────────────────
async def _attendance_rate_pct(
    db: AsyncSession, *, date_from: date, date_to: date
) -> int:
    ok_expr = func.sum(
        case((Attendance.status.in_(("present", "late")), 1), else_=0)
    )
    total_expr = func.count(Attendance.id)
    row = (await db.execute(
        select(ok_expr, total_expr)
        .select_from(Attendance)
        .join(Lesson, Attendance.lesson_id == Lesson.id)
        .where(Lesson.lesson_date >= date_from)
        .where(Lesson.lesson_date <= date_to)
        .where(~Lesson.status.in_(("cancelled", "rescheduled")))
    )).one()
    ok = int(row[0] or 0)
    total = int(row[1] or 0)
    return int(round(ok * 100 / total)) if total else 0


# ── KPI / today stats ───────────────────────────────────────────────────────
async def _kpis(db: AsyncSession, today: date) -> DashboardKpis:
    month_start = _first_of_month(today)
    prev_start = _add_months(month_start, -1)
    prev_end = month_start - timedelta(days=1)
    thirty_days_ago = today - timedelta(days=30)
    sixty_days_ago = today - timedelta(days=60)

    students_total = int(
        (await db.execute(
            select(func.count(Student.id)).where(Student.is_active.is_(True))
        )).scalar_one() or 0
    )
    # Active students whose registration is older than 30 days — proxy for
    # "students count 30 days ago" without keeping snapshot history.
    students_prev_total = int(
        (await db.execute(
            select(func.count(Student.id))
            .where(Student.is_active.is_(True))
            .where(Student.created_at < thirty_days_ago)
        )).scalar_one() or 0
    )

    groups_active = int(
        (await db.execute(
            select(func.count(Group.id)).where(Group.status == "active")
        )).scalar_one() or 0
    )
    # Groups that already existed and were within their date window 30d ago.
    groups_prev_active = int(
        (await db.execute(
            select(func.count(Group.id))
            .where(Group.start_date <= thirty_days_ago)
            .where((Group.end_date.is_(None)) | (Group.end_date >= thirty_days_ago))
        )).scalar_one() or 0
    )

    revenue_month = int(
        (await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.paid_at >= month_start)
            .where(Payment.paid_at <= today)
        )).scalar_one() or 0
    )
    revenue_prev_month = int(
        (await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.paid_at >= prev_start)
            .where(Payment.paid_at <= prev_end)
        )).scalar_one() or 0
    )

    attendance_rate_pct = await _attendance_rate_pct(
        db, date_from=month_start, date_to=today
    )
    attendance_rate_prev_pct = await _attendance_rate_pct(
        db, date_from=sixty_days_ago, date_to=thirty_days_ago
    )

    # Collection rate = paid this month / billed this month, where "billed" is
    # the sum of monthly fees across active students (one month of fees).
    students = list((await db.execute(
        select(Student).where(Student.is_active.is_(True))
    )).scalars().all())
    group_ids = {s.group_id for s in students if s.group_id is not None}
    groups_by_id: dict[int, Group] = {}
    if group_ids:
        gq = await db.execute(select(Group).where(Group.id.in_(group_ids)))
        groups_by_id = {g.id: g for g in gq.scalars().all()}
    snaps = await compute_billing_many(
        db, students=students, groups_by_id=groups_by_id
    )
    billed_month = sum(snap.monthly_amount for snap in snaps.values())
    collection_rate_pct = (
        int(round(revenue_month * 100 / billed_month)) if billed_month > 0 else 0
    )

    return DashboardKpis(
        students_total=students_total,
        students_prev_total=students_prev_total,
        groups_active=groups_active,
        groups_prev_active=groups_prev_active,
        revenue_month=revenue_month,
        revenue_prev_month=revenue_prev_month,
        attendance_rate_pct=attendance_rate_pct,
        attendance_rate_prev_pct=attendance_rate_prev_pct,
        collection_rate_pct=collection_rate_pct,
    )


# ── Today's lessons ─────────────────────────────────────────────────────────
async def _today_lessons(
    db: AsyncSession, today: date, now: datetime
) -> tuple[list[TodayLessonRow], int]:
    rows = (await db.execute(
        select(Lesson)
        .where(Lesson.lesson_date == today)
        .order_by(Lesson.start_time.asc())
    )).scalars().all()

    out: list[TodayLessonRow] = []
    seen_groups: set[int] = set()
    expected_students = 0
    cur_time = now.time()

    for lesson in rows:
        # Auto-promote scheduled → active / completed based on wall-clock.
        status = lesson.status
        if status == "scheduled" and lesson.start_time <= cur_time <= lesson.end_time:
            status = "active"
        elif status == "scheduled" and cur_time > lesson.end_time:
            status = "completed"

        group = lesson.group
        teacher = lesson.teacher
        room = lesson.room

        if group and group.id not in seen_groups and lesson.status != "cancelled":
            seen_groups.add(group.id)
            expected_students += int(group.student_count or 0)

        out.append(TodayLessonRow(
            id=lesson.id,
            group_id=lesson.group_id,
            start_time=_hhmm(lesson.start_time),
            end_time=_hhmm(lesson.end_time),
            course_name=group.course.name if group and group.course else None,
            group_code=group.code if group else "",
            teacher_name=_teacher_full_name(teacher),
            room_name=room.name if room else None,
            student_count=int(group.student_count or 0) if group else 0,
            status=status,  # type: ignore[arg-type]
        ))

    return out, expected_students


# ── Today's payments ────────────────────────────────────────────────────────
async def _today_payments(db: AsyncSession, today: date) -> tuple[int, int]:
    row = (await db.execute(
        select(
            func.coalesce(func.sum(Payment.amount), 0),
            func.count(Payment.id),
        ).where(Payment.paid_at == today)
    )).one()
    return int(row[0] or 0), int(row[1] or 0)


# ── Debt snapshot + top debtors ────────────────────────────────────────────
async def _debt_and_top_debtors(
    db: AsyncSession, *, limit: int = 5
) -> tuple[int, int, list[DebtorRead]]:
    students = list((await db.execute(
        select(Student).where(Student.is_active.is_(True))
    )).scalars().all())

    group_ids = {s.group_id for s in students if s.group_id is not None}
    groups: dict[int, Group] = {}
    if group_ids:
        gq = await db.execute(select(Group).where(Group.id.in_(group_ids)))
        groups = {g.id: g for g in gq.scalars().all()}

    snaps = await compute_billing_many(db, students=students, groups_by_id=groups)

    debtors_pairs = [
        (s, snaps[s.id]) for s in students if snaps[s.id].debt_amount > 0
    ]
    debtors_count = len(debtors_pairs)
    debt_total = sum(snap.debt_amount for _, snap in debtors_pairs)

    debtors_pairs.sort(key=lambda x: (-x[1].debt_amount, -x[1].overdue_days))
    sliced = debtors_pairs[:limit]
    trends = await compute_trends(db, student_ids=[s.id for s, _ in sliced])

    top: list[DebtorRead] = []
    for s, snap in sliced:
        g = s.group
        top.append(DebtorRead(
            id=s.id,
            full_name=s.full_name or "",
            phone=s.phone,
            parent_phone=s.parent_phone,
            group_id=s.group_id,
            group_code=g.code if g else None,
            course_name=g.course.name if g and g.course else None,
            monthly_amount=snap.monthly_amount,
            months_due=snap.months_due,
            total_due=snap.total_due,
            total_paid=snap.total_paid,
            debt_amount=snap.debt_amount,
            credit_balance=snap.credit_balance,
            total_course_cost=snap.total_course_cost,
            max_deposit_amount=snap.max_deposit_amount,
            course_end_date=snap.course_end_date,
            months_unpaid=snap.months_unpaid,
            overdue_days=snap.overdue_days,
            last_payment_date=snap.last_payment_date,
            last_payment_amount=snap.last_payment_amount,
            status=snap.status,  # type: ignore[arg-type]
            finance_note=s.finance_note,
            trend=trends.get(s.id, "stable"),  # type: ignore[arg-type]
        ))

    return debtors_count, debt_total, top


# ── Action items ────────────────────────────────────────────────────────────
async def _action_items(db: AsyncSession, *, today: date) -> list[ActionItem]:
    """Operational alerts surfaced on the home page.

    Each entry is a click-through into the place where the admin can act on
    it. Severity drives the visual prominence on the client.
    """

    items: list[ActionItem] = []

    # 1. Pending journals — completed lessons in the last 7 days that lack a
    # topic OR have no attendance row at all.
    week_ago = today - timedelta(days=7)
    yesterday = today - timedelta(days=1)
    no_attn = ~exists(select(Attendance.id).where(Attendance.lesson_id == Lesson.id))
    pending = int(
        (await db.execute(
            select(func.count(Lesson.id))
            .where(Lesson.lesson_date >= week_ago)
            .where(Lesson.lesson_date <= yesterday)
            .where(Lesson.status == "completed")
            .where((Lesson.topic.is_(None)) | (Lesson.topic == "") | no_attn)
        )).scalar_one() or 0
    )
    if pending > 0:
        items.append(ActionItem(
            kind="pending_journal",
            severity="warning" if pending < 5 else "critical",
            title="Незаполненные журналы",
            detail=f"{pending} уроков за 7 дней без темы или отметок",
            link="/journal",
            count=pending,
        ))

    # 2. Schedule conflicts — open conflicting pairs over the next 14 days.
    conflicts = await count_open_conflicts(db, today=today, days_ahead=14)
    if conflicts > 0:
        items.append(ActionItem(
            kind="schedule_conflict",
            severity="critical",
            title="Конфликты в расписании",
            detail=f"{conflicts} пересечений в ближайшие 14 дней",
            link="/schedule",
            count=conflicts,
        ))

    # 3. Active students without a group, registered in the last 30 days.
    no_group = int(
        (await db.execute(
            select(func.count(Student.id))
            .where(Student.is_active.is_(True))
            .where(Student.group_id.is_(None))
            .where(Student.created_at >= today - timedelta(days=30))
        )).scalar_one() or 0
    )
    if no_group > 0:
        items.append(ActionItem(
            kind="new_student_no_group",
            severity="warning",
            title="Новые ученики без группы",
            detail=f"{no_group} учеников за 30 дней без распределения",
            link="/students",
            count=no_group,
        ))

    # 4. Active groups ending in the next 14 days.
    horizon = today + timedelta(days=14)
    ending = int(
        (await db.execute(
            select(func.count(Group.id))
            .where(Group.status == "active")
            .where(Group.end_date.is_not(None))
            .where(Group.end_date >= today)
            .where(Group.end_date <= horizon)
        )).scalar_one() or 0
    )
    if ending > 0:
        items.append(ActionItem(
            kind="group_ending_soon",
            severity="info",
            title="Группы скоро завершаются",
            detail=f"{ending} групп заканчивается в ближайшие 14 дней",
            link="/groups",
            count=ending,
        ))

    # 5. Low-attendance groups (last 30 days, ≥10 marks, < 70%).
    since = today - timedelta(days=30)
    low_rows = (await db.execute(
        select(
            Group.id,
            func.count(Attendance.id).label("total"),
            func.sum(
                case(
                    (Attendance.status.in_(("present", "late")), 1),
                    else_=0,
                )
            ).label("ok"),
        )
        .select_from(Attendance)
        .join(Lesson, Attendance.lesson_id == Lesson.id)
        .join(Group, Lesson.group_id == Group.id)
        .where(Lesson.lesson_date >= since)
        .where(Lesson.lesson_date <= today)
        .where(~Lesson.status.in_(("cancelled", "rescheduled")))
        .where(Group.status == "active")
        .group_by(Group.id)
        .having(func.count(Attendance.id) >= 10)
    )).all()
    low_groups = 0
    for _gid, total, ok in low_rows:
        total_i = int(total or 0)
        ok_i = int(ok or 0)
        if total_i >= 10 and (ok_i * 100 // total_i) < 70:
            low_groups += 1
    if low_groups > 0:
        items.append(ActionItem(
            kind="low_attendance_group",
            severity="warning",
            title="Низкая посещаемость",
            detail=f"{low_groups} групп с посещаемостью < 70% за 30 дней",
            link="/journal",
            count=low_groups,
        ))

    # 6. Active teachers with zero active groups.
    has_active_group = exists(
        select(Group.id)
        .where(Group.teacher_id == Teacher.id)
        .where(Group.status == "active")
    )
    idle_teachers = int(
        (await db.execute(
            select(func.count(Teacher.id))
            .where(Teacher.is_active.is_(True))
            .where(~has_active_group)
        )).scalar_one() or 0
    )
    if idle_teachers > 0:
        items.append(ActionItem(
            kind="teacher_no_active_groups",
            severity="info",
            title="Преподаватели без групп",
            detail=f"{idle_teachers} активных преподавателей без групп",
            link="/teachers",
            count=idle_teachers,
        ))

    severity_rank = {"critical": 0, "warning": 1, "info": 2}
    items.sort(key=lambda x: (severity_rank.get(x.severity, 9), -x.count))
    return items[:6]


# ── Revenue by month (12 months ending today) ──────────────────────────────
async def _revenue_by_month(
    db: AsyncSession, *, today: date
) -> list[RevenuePoint]:
    period_from = _add_months(_first_of_month(today), -11)
    month_expr = func.to_char(Payment.paid_at, "YYYY-MM").label("m")
    rows = (await db.execute(
        select(month_expr, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.paid_at >= period_from)
        .where(Payment.paid_at <= today)
        .group_by(month_expr)
    )).all()
    by_m = {str(m): int(s or 0) for m, s in rows}
    return [
        RevenuePoint(month=m, revenue=by_m.get(m, 0), debt=0)
        for m in _month_iter(period_from, today)
    ]


# ── Student growth (12 months) ─────────────────────────────────────────────
async def _students_growth(
    db: AsyncSession, *, today: date
) -> list[StudentGrowthPoint]:
    period_from = _add_months(_first_of_month(today), -11)

    month_expr = func.to_char(Student.created_at, "YYYY-MM").label("m")
    rows = (await db.execute(
        select(month_expr, func.count(Student.id))
        .where(Student.created_at >= period_from)
        .group_by(month_expr)
    )).all()
    by_m = {str(m): int(c or 0) for m, c in rows}

    offset = int((await db.execute(
        select(func.count(Student.id)).where(Student.created_at < period_from)
    )).scalar_one() or 0)

    out: list[StudentGrowthPoint] = []
    cumulative = offset
    for m in _month_iter(period_from, today):
        new = by_m.get(m, 0)
        cumulative += new
        out.append(StudentGrowthPoint(
            month=m, new_students=new, total_students=cumulative,
        ))
    return out


# ── Course distribution by active student count ───────────────────────────
async def _course_distribution(
    db: AsyncSession,
) -> list[CourseDistributionRow]:
    rows = (await db.execute(
        select(Course.id, Course.name, func.count(Student.id))
        .select_from(Student)
        .join(Group, Student.group_id == Group.id, isouter=True)
        .join(Course, Group.course_id == Course.id, isouter=True)
        .where(Student.is_active.is_(True))
        .group_by(Course.id, Course.name)
        .order_by(desc(func.count(Student.id)))
    )).all()

    return [
        CourseDistributionRow(
            course_id=int(cid) if cid is not None else None,
            course_name=str(name) if name else "—",
            students_count=int(cnt or 0),
        )
        for cid, name, cnt in rows
    ]


# ── Recent activity feed ──────────────────────────────────────────────────
async def _recent_activity(
    db: AsyncSession, *, limit_per_kind: int = 5, total_limit: int = 10
) -> list[ActivityItem]:
    """Heterogeneous activity stream merged from multiple tables.

    Sources:
      - newest payments
      - newest active students
      - lessons cancelled or rescheduled in the last 7 days
      - newest groups
    """

    today = date.today()

    pay_rows = (await db.execute(
        select(Payment).order_by(Payment.created_at.desc()).limit(limit_per_kind)
    )).scalars().all()
    stu_rows = (await db.execute(
        select(Student)
        .where(Student.is_active.is_(True))
        .order_by(Student.created_at.desc())
        .limit(limit_per_kind)
    )).scalars().all()
    week_ago = today - timedelta(days=7)
    cancelled_rows = (await db.execute(
        select(Lesson)
        .where(Lesson.status == "cancelled")
        .where(Lesson.updated_at >= week_ago)
        .order_by(Lesson.updated_at.desc())
        .limit(3)
    )).scalars().all()
    rescheduled_rows = (await db.execute(
        select(Lesson)
        .where(Lesson.status == "rescheduled")
        .where(Lesson.updated_at >= week_ago)
        .order_by(Lesson.updated_at.desc())
        .limit(3)
    )).scalars().all()
    group_rows = (await db.execute(
        select(Group).order_by(Group.created_at.desc()).limit(3)
    )).scalars().all()

    items: list[ActivityItem] = []

    for p in pay_rows:
        s = p.student
        student_name = s.full_name if s else "—"
        g = s.group if s else None
        detail_parts: list[str] = [f"{int(p.amount):,}".replace(",", " ") + " UZS"]
        if g and g.course and g.course.name:
            detail_parts.append(g.course.name)
        elif g and g.code:
            detail_parts.append(g.code)
        items.append(ActivityItem(
            type="payment",
            title=student_name,
            detail=" · ".join(detail_parts),
            happened_at=p.created_at,
            link=f"/students/{s.id}" if s else None,
        ))

    for s in stu_rows:
        g = s.group
        detail_parts: list[str] = []
        if g:
            if g.course and g.course.name:
                detail_parts.append(g.course.name)
            if g.code:
                detail_parts.append(g.code)
        items.append(ActivityItem(
            type="student_added",
            title=s.full_name or "—",
            detail=" · ".join(detail_parts) if detail_parts else None,
            happened_at=s.created_at,
            link=f"/students/{s.id}",
        ))

    for lesson in cancelled_rows:
        g = lesson.group
        detail_parts = [
            lesson.lesson_date.isoformat(),
            _hhmm(lesson.start_time),
        ]
        if g and g.code:
            detail_parts.append(g.code)
        items.append(ActivityItem(
            type="lesson_cancelled",
            title=(g.course.name if g and g.course else None) or (g.code if g else "—"),
            detail=" · ".join(detail_parts),
            happened_at=lesson.updated_at,
            link=f"/groups/{lesson.group_id}" if lesson.group_id else "/schedule",
        ))

    for lesson in rescheduled_rows:
        g = lesson.group
        detail_parts = [
            lesson.lesson_date.isoformat(),
            _hhmm(lesson.start_time),
        ]
        if g and g.code:
            detail_parts.append(g.code)
        items.append(ActivityItem(
            type="lesson_rescheduled",
            title=(g.course.name if g and g.course else None) or (g.code if g else "—"),
            detail=" · ".join(detail_parts),
            happened_at=lesson.updated_at,
            link=f"/groups/{lesson.group_id}" if lesson.group_id else "/schedule",
        ))

    for g in group_rows:
        detail_parts = []
        if g.course and g.course.name:
            detail_parts.append(g.course.name)
        items.append(ActivityItem(
            type="group_created",
            title=g.code or "—",
            detail=" · ".join(detail_parts) if detail_parts else None,
            happened_at=g.created_at,
            link=f"/groups/{g.id}",
        ))

    items.sort(key=lambda it: it.happened_at, reverse=True)
    return items[:total_limit]


# ── Endpoint ────────────────────────────────────────────────────────────────
@router.get("/summary", response_model=DashboardSummary)
async def get_summary(
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    now = datetime.now()
    today = now.date()

    kpis = await _kpis(db, today)
    today_lessons, expected_students = await _today_lessons(db, today, now)
    today_pay_total, today_pay_count = await _today_payments(db, today)
    debtors_count, debt_total, top_debtors = await _debt_and_top_debtors(db)

    revenue_by_month = await _revenue_by_month(db, today=today)
    students_growth = await _students_growth(db, today=today)
    course_distribution = await _course_distribution(db)
    recent_activity = await _recent_activity(db)
    action_items = await _action_items(db, today=today)

    today_stats = TodayStats(
        lessons_count=sum(1 for l in today_lessons if l.status != "cancelled"),
        lessons_completed=sum(1 for l in today_lessons if l.status == "completed"),
        lessons_active=sum(1 for l in today_lessons if l.status == "active"),
        expected_students=expected_students,
        debtors_count=debtors_count,
        today_payments_total=today_pay_total,
        today_payments_count=today_pay_count,
    )

    return DashboardSummary(
        today=today,
        kpis=kpis,
        today_stats=today_stats,
        today_lessons=today_lessons,
        action_items=action_items,
        top_debtors=top_debtors,
        debt_total=debt_total,
        revenue_by_month=revenue_by_month,
        students_growth=students_growth,
        course_distribution=course_distribution,
        recent_activity=recent_activity,
    )
