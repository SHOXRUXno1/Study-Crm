"""Analytics API — admin-only.

Single endpoint that returns everything the Analytics page needs for a chosen
date range:

* KPI block (active students/groups, revenue, debt, debtors, avg check)
* Monthly revenue trend
* Revenue by course
* Payment-method breakdown
* Top groups by attendance rate
* Student demographic breakdowns (gender, source) — always full population

Optional filters: ``gender`` (male/female), ``source`` (instagram/telegram/
recommended). When provided, all monetary aggregations are scoped to students
matching the filter; the demographic breakdowns are always returned over the
full active-student population so they can be used as inputs to filtering.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.attendance import Attendance
from app.models.course import Course
from app.models.group import Group
from app.models.lesson import Lesson
from app.models.payment import Payment
from app.models.student import Student
from app.schemas.analytics import (
    AnalyticsKpis,
    AnalyticsOverview,
    DemographicBreakdown,
    RevenueByCourse,
    RevenuePoint,
    TopGroupAttendance,
)
from app.schemas.auth import AuthUser
from app.schemas.finance import MethodBreakdown
from app.services.finance_service import compute_billing_many


router = APIRouter(prefix="/analytics", tags=["analytics"])


GenderFilter = Literal["male", "female"]
SourceFilter = Literal["instagram", "telegram", "recommended"]


# ── Date helpers ────────────────────────────────────────────────────────────
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


def _student_filter_conds(
    *, gender: Optional[str], source: Optional[str]
) -> list[ColumnElement]:
    conds: list[ColumnElement] = []
    if gender:
        conds.append(Student.gender == gender)
    if source:
        conds.append(Student.source == source)
    return conds


def _has_student_filter(*, gender: Optional[str], source: Optional[str]) -> bool:
    return bool(gender) or bool(source)


# ── Aggregations ────────────────────────────────────────────────────────────
async def _revenue_in_range(
    db: AsyncSession,
    *,
    period_from: date,
    period_to: date,
    gender: Optional[str],
    source: Optional[str],
) -> tuple[int, int]:
    """Return ``(total_amount, payments_count)`` over the period, optionally
    filtered by student demographics."""
    has_filter = _has_student_filter(gender=gender, source=source)

    stmt = (
        select(
            func.coalesce(func.sum(Payment.amount), 0),
            func.count(Payment.id),
        )
        .where(Payment.paid_at >= period_from)
        .where(Payment.paid_at <= period_to)
    )
    if has_filter:
        stmt = stmt.join(Student, Payment.student_id == Student.id).where(
            *_student_filter_conds(gender=gender, source=source)
        )
    total, count = (await db.execute(stmt)).one()
    return int(total or 0), int(count or 0)


async def _revenue_by_month(
    db: AsyncSession,
    *,
    period_from: date,
    period_to: date,
    gender: Optional[str],
    source: Optional[str],
) -> list[RevenuePoint]:
    month_expr = func.to_char(Payment.paid_at, "YYYY-MM").label("m")
    stmt = (
        select(month_expr, func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.paid_at >= period_from)
        .where(Payment.paid_at <= period_to)
        .group_by(month_expr)
    )
    if _has_student_filter(gender=gender, source=source):
        stmt = stmt.join(Student, Payment.student_id == Student.id).where(
            *_student_filter_conds(gender=gender, source=source)
        )
    rows = (await db.execute(stmt)).all()
    by_m = {str(m): int(s or 0) for m, s in rows}
    return [
        RevenuePoint(month=m, revenue=by_m.get(m, 0), debt=0)
        for m in _month_iter(period_from, period_to)
    ]


async def _revenue_by_course(
    db: AsyncSession,
    *,
    period_from: date,
    period_to: date,
    gender: Optional[str],
    source: Optional[str],
) -> list[RevenueByCourse]:
    stmt = (
        select(
            Course.id,
            Course.name,
            func.coalesce(func.sum(Payment.amount), 0),
        )
        .select_from(Payment)
        .join(Student, Payment.student_id == Student.id)
        .join(Group, Student.group_id == Group.id, isouter=True)
        .join(Course, Group.course_id == Course.id, isouter=True)
        .where(Payment.paid_at >= period_from)
        .where(Payment.paid_at <= period_to)
        .where(*_student_filter_conds(gender=gender, source=source))
        .group_by(Course.id, Course.name)
        .order_by(func.coalesce(func.sum(Payment.amount), 0).desc())
    )
    rows = (await db.execute(stmt)).all()
    out: list[RevenueByCourse] = []
    for cid, cname, total in rows:
        out.append(
            RevenueByCourse(
                course_id=int(cid) if cid is not None else None,
                course_name=str(cname) if cname else "—",
                revenue=int(total or 0),
            )
        )
    return out


async def _payment_methods(
    db: AsyncSession,
    *,
    period_from: date,
    period_to: date,
    gender: Optional[str],
    source: Optional[str],
) -> list[MethodBreakdown]:
    stmt = (
        select(
            Payment.method,
            func.count(Payment.id),
            func.coalesce(func.sum(Payment.amount), 0),
        )
        .where(Payment.paid_at >= period_from)
        .where(Payment.paid_at <= period_to)
        .group_by(Payment.method)
    )
    if _has_student_filter(gender=gender, source=source):
        stmt = stmt.join(Student, Payment.student_id == Student.id).where(
            *_student_filter_conds(gender=gender, source=source)
        )
    rows = (await db.execute(stmt)).all()
    return [
        MethodBreakdown(method=str(m), count=int(c or 0), amount=int(a or 0))
        for m, c, a in rows
    ]


async def _top_groups_attendance(
    db: AsyncSession,
    *,
    period_from: date,
    period_to: date,
    gender: Optional[str],
    source: Optional[str],
    limit: int = 5,
) -> list[TopGroupAttendance]:
    ok_expr = func.sum(
        case((Attendance.status.in_(("present", "late")), 1), else_=0)
    )
    total_expr = func.count(Attendance.id)
    rate_expr = func.coalesce(ok_expr * 100.0 / func.nullif(total_expr, 0), 0)

    stmt = (
        select(
            Group.id,
            Group.code,
            Course.name,
            ok_expr.label("ok"),
            total_expr.label("total"),
            rate_expr.label("rate"),
        )
        .select_from(Attendance)
        .join(Lesson, Attendance.lesson_id == Lesson.id)
        .join(Group, Lesson.group_id == Group.id)
        .join(Course, Group.course_id == Course.id, isouter=True)
        .where(Lesson.lesson_date >= period_from)
        .where(Lesson.lesson_date <= period_to)
        .where(~Lesson.status.in_(("cancelled", "rescheduled")))
        .group_by(Group.id, Group.code, Course.name)
        .having(total_expr >= 3)
        .order_by(rate_expr.desc(), total_expr.desc())
        .limit(limit)
    )
    if _has_student_filter(gender=gender, source=source):
        stmt = stmt.join(Student, Attendance.student_id == Student.id).where(
            *_student_filter_conds(gender=gender, source=source)
        )
    rows = (await db.execute(stmt)).all()
    return [
        TopGroupAttendance(
            group_id=int(gid),
            code=str(code),
            course_name=str(cname) if cname else None,
            rate_pct=int(round(float(rate or 0))),
            total_marks=int(total or 0),
        )
        for gid, code, cname, _ok, total, rate in rows
    ]


async def _students_breakdown(
    db: AsyncSession, *, column
) -> list[DemographicBreakdown]:
    """Group active students by ``column`` (Student.gender or Student.source)."""
    rows = (
        await db.execute(
            select(column, func.count(Student.id))
            .where(Student.is_active.is_(True))
            .group_by(column)
        )
    ).all()
    out: list[DemographicBreakdown] = []
    for key, cnt in rows:
        out.append(
            DemographicBreakdown(
                key=str(key) if key else "unknown",
                count=int(cnt or 0),
            )
        )
    out.sort(key=lambda b: b.count, reverse=True)
    return out


async def _debt_snapshot(
    db: AsyncSession, *, gender: Optional[str], source: Optional[str]
) -> tuple[int, int]:
    """Return ``(debtors_count, total_debt)`` for the currently active student
    population (optionally filtered)."""
    stmt = select(Student).where(Student.is_active.is_(True))
    if _has_student_filter(gender=gender, source=source):
        stmt = stmt.where(*_student_filter_conds(gender=gender, source=source))
    students = list((await db.execute(stmt)).scalars().all())
    group_ids = {s.group_id for s in students if s.group_id is not None}
    groups: dict[int, Group] = {}
    if group_ids:
        gq = await db.execute(select(Group).where(Group.id.in_(group_ids)))
        groups = {g.id: g for g in gq.scalars().all()}
    snaps = await compute_billing_many(db, students=students, groups_by_id=groups)

    debtors_count = 0
    total_debt = 0
    for snap in snaps.values():
        if snap.debt_amount > 0:
            debtors_count += 1
            total_debt += snap.debt_amount
    return debtors_count, total_debt


async def _count(db: AsyncSession, stmt) -> int:
    return int((await db.execute(stmt)).scalar_one() or 0)


# ── Endpoint ────────────────────────────────────────────────────────────────
@router.get("/overview", response_model=AnalyticsOverview)
async def get_overview(
    from_: date | None = Query(None, alias="from"),
    to: date | None = Query(None),
    gender: GenderFilter | None = Query(None),
    source: SourceFilter | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    today = date.today()
    if to is None:
        to = today
    if from_ is None:
        from_ = _add_months(_first_of_month(to), -11)
    if to < from_:
        raise HTTPException(status_code=400, detail="`to` must be on or after `from`")

    has_demo_filter = _has_student_filter(gender=gender, source=source)

    # Period revenue + count.
    revenue_period, payments_count = await _revenue_in_range(
        db, period_from=from_, period_to=to, gender=gender, source=source
    )
    revenue_by_month = await _revenue_by_month(
        db, period_from=from_, period_to=to, gender=gender, source=source
    )
    revenue_by_course = await _revenue_by_course(
        db, period_from=from_, period_to=to, gender=gender, source=source
    )
    payment_methods = await _payment_methods(
        db, period_from=from_, period_to=to, gender=gender, source=source
    )
    top_groups = await _top_groups_attendance(
        db, period_from=from_, period_to=to, gender=gender, source=source
    )

    # Previous-period revenue (same length, immediately preceding).
    period_len_days = (to - from_).days + 1
    prev_to = from_ - timedelta(days=1)
    prev_from = prev_to - timedelta(days=period_len_days - 1)
    revenue_prev, _ = await _revenue_in_range(
        db, period_from=prev_from, period_to=prev_to, gender=gender, source=source
    )

    # Active counts.
    active_stmt = select(func.count(Student.id)).where(Student.is_active.is_(True))
    if has_demo_filter:
        active_stmt = active_stmt.where(
            *_student_filter_conds(gender=gender, source=source)
        )
    students_active = await _count(db, active_stmt)

    if has_demo_filter:
        # Distinct active groups containing at least one matching student.
        groups_active = await _count(
            db,
            select(func.count(func.distinct(Student.group_id)))
            .join(Group, Student.group_id == Group.id)
            .where(Student.is_active.is_(True))
            .where(Group.status == "active")
            .where(*_student_filter_conds(gender=gender, source=source)),
        )
    else:
        groups_active = await _count(
            db, select(func.count(Group.id)).where(Group.status == "active")
        )

    # Debt snapshot (always current state).
    debtors_count, debt_total = await _debt_snapshot(db, gender=gender, source=source)

    avg_check = (
        int(round(revenue_period / payments_count)) if payments_count else 0
    )

    kpis = AnalyticsKpis(
        students_active=students_active,
        groups_active=groups_active,
        revenue_period=revenue_period,
        revenue_prev_period=revenue_prev,
        debt_total=debt_total,
        debtors_count=debtors_count,
        payments_count=payments_count,
        avg_check=avg_check,
    )

    # Demographic breakdowns: always over the full active population.
    students_by_gender = await _students_breakdown(db, column=Student.gender)
    students_by_source = await _students_breakdown(db, column=Student.source)

    return AnalyticsOverview(
        period_from=from_,
        period_to=to,
        kpis=kpis,
        revenue_by_month=revenue_by_month,
        revenue_by_course=revenue_by_course,
        payment_methods=payment_methods,
        top_groups_attendance=top_groups,
        students_by_gender=students_by_gender,
        students_by_source=students_by_source,
    )
