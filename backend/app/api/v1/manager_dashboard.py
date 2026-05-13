"""Manager Dashboard API — available to admin and manager roles.

Returns minimal KPIs without any financial/revenue data.
"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin_or_manager
from app.models.group import Group
from app.models.lesson import Lesson
from app.models.student import Student
from app.models.teacher import Teacher
from app.schemas.auth import AuthUser
from app.services.finance_service import compute_billing_many

router = APIRouter(prefix="/manager", tags=["manager"])


class ManagerDebtorRow(BaseModel):
    id: int
    full_name: str | None
    phone: str | None
    debt_amount: int
    overdue_days: int
    group_code: str | None
    course_name: str | None


class RecentStudentRow(BaseModel):
    id: int
    full_name: str | None
    phone: str | None
    group_code: str | None
    course_name: str | None
    created_at: str


class ManagerSummary(BaseModel):
    total_students: int
    active_students: int
    total_groups: int
    active_groups: int
    total_teachers: int
    top_debtors: list[ManagerDebtorRow]
    recent_students: list[RecentStudentRow]
    upcoming_lessons_today: int
    upcoming_lessons_tomorrow: int


@router.get("/summary", response_model=ManagerSummary)
async def get_manager_summary(
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin_or_manager),
):
    today = date.today()
    tomorrow = today + timedelta(days=1)

    # Student counts
    total_students_res = await db.execute(select(func.count()).select_from(Student))
    total_students = total_students_res.scalar_one()

    active_students_res = await db.execute(
        select(func.count()).select_from(Student).where(Student.is_active == True)
    )
    active_students = active_students_res.scalar_one()

    # Group counts
    total_groups_res = await db.execute(select(func.count()).select_from(Group))
    total_groups = total_groups_res.scalar_one()

    active_groups_res = await db.execute(
        select(func.count()).select_from(Group).where(Group.status == "active")
    )
    active_groups = active_groups_res.scalar_one()

    # Teacher count
    total_teachers_res = await db.execute(
        select(func.count()).select_from(Teacher).where(Teacher.is_active == True)
    )
    total_teachers = total_teachers_res.scalar_one()

    # Top debtors
    debtors_res = await db.execute(
        select(Student).where(Student.is_active == True)
    )
    debtors_students = list(debtors_res.scalars().all())

    # Build groups_by_id for billing
    group_ids = {s.group_id for s in debtors_students if s.group_id}
    groups_res = await db.execute(select(Group).where(Group.id.in_(group_ids))) if group_ids else None
    groups_by_id: dict[int, Group] = {}
    if groups_res:
        for g in groups_res.scalars().all():
            groups_by_id[g.id] = g

    billing_map = await compute_billing_many(db, students=debtors_students, groups_by_id=groups_by_id)
    debtor_pairs = [
        (s, billing_map[s.id])
        for s in debtors_students
        if billing_map.get(s.id) and billing_map[s.id].debt_amount > 0
    ]
    debtor_pairs.sort(key=lambda x: x[1].debt_amount, reverse=True)
    top_debtors = [
        ManagerDebtorRow(
            id=s.id,
            full_name=s.full_name,
            phone=s.phone,
            debt_amount=b.debt_amount,
            overdue_days=b.overdue_days,
            group_code=s.group_code,
            course_name=s.course_name,
        )
        for s, b in debtor_pairs[:5]
    ]

    # Recent students
    recent_res = await db.execute(
        select(Student).order_by(Student.created_at.desc()).limit(5)
    )
    recent_students_rows = [
        RecentStudentRow(
            id=s.id,
            full_name=s.full_name,
            phone=s.phone,
            group_code=s.group_code,
            course_name=s.course_name,
            created_at=s.created_at.isoformat() if s.created_at else "",
        )
        for s in recent_res.scalars().all()
    ]

    # Upcoming lessons
    today_lessons_res = await db.execute(
        select(func.count()).select_from(Lesson).where(
            Lesson.lesson_date == today,
            Lesson.status != "cancelled",
        )
    )
    upcoming_today = today_lessons_res.scalar_one()

    tomorrow_lessons_res = await db.execute(
        select(func.count()).select_from(Lesson).where(
            Lesson.lesson_date == tomorrow,
            Lesson.status != "cancelled",
        )
    )
    upcoming_tomorrow = tomorrow_lessons_res.scalar_one()

    return ManagerSummary(
        total_students=total_students,
        active_students=active_students,
        total_groups=total_groups,
        active_groups=active_groups,
        total_teachers=total_teachers,
        top_debtors=top_debtors,
        recent_students=recent_students_rows,
        upcoming_lessons_today=upcoming_today,
        upcoming_lessons_tomorrow=upcoming_tomorrow,
    )
