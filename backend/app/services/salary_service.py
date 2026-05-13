from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group import Group
from app.models.lesson import Lesson
from app.models.payment import Payment
from app.models.student import Student
from app.models.teacher import Teacher


def _full_name(teacher: Teacher) -> str:
    parts = [teacher.last_name, teacher.first_name, teacher.middle_name]
    return " ".join(p for p in parts if p)


def _percent_amount(revenue: int, percent: Decimal) -> int:
    if revenue == 0 or percent == 0:
        return 0
    raw = (Decimal(revenue) * percent) / Decimal(100)
    return int(raw.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


async def _teacher_group_ids(db: AsyncSession, teacher_id: int) -> list[int]:
    rows = await db.execute(select(Group.id).where(Group.teacher_id == teacher_id))
    return [row[0] for row in rows.all()]


async def _revenue_for_groups(
    db: AsyncSession, group_ids: Iterable[int], period_from: date, period_to: date
) -> int:
    ids = list(group_ids)
    if not ids:
        return 0

    stmt = (
        select(func.coalesce(func.sum(Payment.amount), 0))
        .join(Student, Student.id == Payment.student_id)
        .where(
            and_(
                Student.group_id.in_(ids),
                Payment.paid_at >= period_from,
                Payment.paid_at <= period_to,
            )
        )
    )
    return int((await db.execute(stmt)).scalar_one() or 0)


async def _completed_lessons_count(
    db: AsyncSession, teacher_id: int, period_from: date, period_to: date
) -> int:
    stmt = select(func.count(Lesson.id)).where(
        and_(
            Lesson.teacher_id == teacher_id,
            Lesson.status == "completed",
            Lesson.lesson_date >= period_from,
            Lesson.lesson_date <= period_to,
        )
    )
    return int((await db.execute(stmt)).scalar_one() or 0)


async def _active_students_count(db: AsyncSession, group_ids: Iterable[int]) -> int:
    ids = list(group_ids)
    if not ids:
        return 0

    stmt = select(func.count(Student.id)).where(
        and_(Student.group_id.in_(ids), Student.is_active.is_(True))
    )
    return int((await db.execute(stmt)).scalar_one() or 0)


async def compute_teacher_salary(
    db: AsyncSession, teacher: Teacher, period_from: date, period_to: date
) -> dict:
    group_ids = await _teacher_group_ids(db, teacher.id)
    revenue = await _revenue_for_groups(db, group_ids, period_from, period_to)
    lessons_count = await _completed_lessons_count(db, teacher.id, period_from, period_to)
    students_count = await _active_students_count(db, group_ids)

    rate_monthly = int(teacher.salary_monthly or 0)
    rate_percent = teacher.salary_percent or Decimal("0")
    rate_per_lesson = int(teacher.salary_per_lesson or 0)
    rate_per_student = int(teacher.salary_per_student or 0)

    monthly_amount = rate_monthly
    percent_amount = _percent_amount(revenue, rate_percent)
    lessons_amount = rate_per_lesson * lessons_count
    students_amount = rate_per_student * students_count
    total = monthly_amount + percent_amount + lessons_amount + students_amount

    return {
        "teacher_id": teacher.id,
        "teacher_name": _full_name(teacher),
        "period_from": period_from,
        "period_to": period_to,
        "revenue": revenue,
        "lessons_count": lessons_count,
        "students_count": students_count,
        "rate_monthly": rate_monthly,
        "rate_percent": rate_percent,
        "rate_per_lesson": rate_per_lesson,
        "rate_per_student": rate_per_student,
        "monthly_amount": monthly_amount,
        "percent_amount": percent_amount,
        "lessons_amount": lessons_amount,
        "students_amount": students_amount,
        "total": total,
    }


async def compute_all_salaries(
    db: AsyncSession, period_from: date, period_to: date
) -> dict:
    rows = await db.execute(
        select(Teacher)
        .where(Teacher.is_active.is_(True))
        .order_by(Teacher.last_name.asc(), Teacher.first_name.asc(), Teacher.id.asc())
    )
    teachers = list(rows.scalars().all())

    items: list[dict] = []
    payroll = 0
    for teacher in teachers:
        item = await compute_teacher_salary(db, teacher, period_from, period_to)
        items.append(item)
        payroll += int(item["total"])

    return {"items": items, "total_payroll": payroll}

