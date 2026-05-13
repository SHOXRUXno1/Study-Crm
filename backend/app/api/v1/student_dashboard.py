"""Student Cabinet API — student-only.

Self-scoped wrappers that hand the cabinet UI everything it needs:

* ``GET /me/student/profile``       — extended self profile + billing snapshot.
* ``GET /me/student/attendance``    — own attendance over a date range.
* ``GET /me/student/ledger``        — own billing + payment list.
* ``GET /me/student/schedule``      — own group's lessons over a date range.
* ``GET /me/student/summary``       — single round-trip for the home page.

Every endpoint accepts only ``role == "student"`` and resolves the student id
strictly from ``user.id``. There is no path that accepts a student id.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_student
from app.models.attendance import Attendance
from app.models.group import Group
from app.models.lesson import Lesson
from app.models.student import Student
from app.schemas.attendance import StudentAttendanceEntry
from app.schemas.auth import AuthUser
from app.schemas.finance import PaymentRead, PaymentReceiptRead, StudentBilling, StudentLedger
from app.schemas.lesson import LessonRead
from app.schemas.student import StudentSelfProfile
from app.services.finance_service import compute_student_ledger


router = APIRouter(prefix="/me/student", tags=["student-cabinet"])


# ── Helpers ──────────────────────────────────────────────────────────────────


def _self_billing(student: Student, snap) -> StudentBilling:
    g = student.group
    return StudentBilling(
        id=student.id,
        full_name=student.full_name,
        phone=student.phone,
        parent_phone=student.parent_phone,
        group_id=student.group_id,
        group_code=g.code if g else None,
        course_name=(g.course.name if g and g.course else None),
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
        status=snap.status,
        finance_note=None,  # never expose admin's internal note to the student
    )


def _self_payment(p, student: Student, group: Optional[Group]) -> PaymentRead:
    receipt_items = [
        PaymentReceiptRead(
            id=r.id,
            original_name=r.original_name,
            mime_type=r.mime_type,
            size_bytes=int(r.size_bytes),
            url=f"/api/v1/finance/payments/{p.id}/receipts/{r.id}",
            created_at=r.created_at,
        )
        for r in sorted(p.receipts, key=lambda x: x.id)
    ]
    return PaymentRead(
        id=p.id,
        student_id=p.student_id,
        amount=int(p.amount),
        method=p.method,
        paid_at=p.paid_at,
        note=p.note,
        student_name=student.full_name,
        group_code=group.code if group else None,
        course_name=(group.course.name if group and group.course else None),
        receipts=receipt_items,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def _serialise_lesson(lesson: Lesson) -> LessonRead:
    g = lesson.group
    teacher_name = None
    if lesson.teacher:
        parts = [lesson.teacher.last_name, lesson.teacher.first_name, lesson.teacher.middle_name]
        teacher_name = " ".join(p for p in parts if p) or None
    return LessonRead(
        id=lesson.id,
        group_id=lesson.group_id,
        group_code=g.code if g else "",
        course_id=g.course_id if g else None,
        course_name=(g.course.name if g and g.course else None),
        teacher_id=lesson.teacher_id,
        teacher_name=teacher_name,
        room_id=lesson.room_id,
        room_name=(lesson.room.name if lesson.room else None),
        lesson_date=lesson.lesson_date,
        start_time=lesson.start_time,
        end_time=lesson.end_time,
        status=lesson.status,
        note=lesson.note,
        topic=lesson.topic,
        notes=lesson.notes,
        rescheduled_from_id=lesson.rescheduled_from_id,
        days=g.days if g else "",
        max_students=g.max_students if g else 0,
        student_count=g.student_count if g else 0,
        duration_months=g.duration_months if g else 0,
        created_at=lesson.created_at,
        updated_at=lesson.updated_at,
    )


async def _load_self(db: AsyncSession, student_id: int) -> Student:
    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    return student


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/profile", response_model=StudentSelfProfile)
async def my_profile(
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_student),
):
    student = await _load_self(db, user.id)
    return StudentSelfProfile(
        id=student.id,
        full_name=student.full_name,
        phone=student.phone,
        parent_phone=student.parent_phone,
        gender=student.gender,
        birth_date=student.birth_date,
        source=student.source,
        group_id=student.group_id,
        group_code=student.group_code,
        course_name=student.course_name,
        payment_status=student.payment_status,
        is_active=student.is_active,
        created_at=student.created_at,
    )


@router.get("/ledger", response_model=StudentLedger)
async def my_ledger(
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_student),
):
    student = await _load_self(db, user.id)
    led = await compute_student_ledger(
        db, student=student, period_from=from_, period_to=to
    )
    billing = _self_billing(led.student, led.snapshot)
    payments = [_self_payment(p, led.student, led.group) for p in led.payments]
    return StudentLedger(billing=billing, payments=payments)


@router.get("/attendance", response_model=list[StudentAttendanceEntry])
async def my_attendance(
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_student),
):
    today = date.today()
    if to is None:
        to = today
    if from_ is None:
        from_ = to - timedelta(days=180)
    if to < from_:
        raise HTTPException(status_code=400, detail="`to` must be on or after `from`")

    stmt = (
        select(Attendance, Lesson)
        .join(Lesson, Attendance.lesson_id == Lesson.id)
        .options(selectinload(Lesson.group))
        .where(Attendance.student_id == user.id)
        .where(Lesson.lesson_date >= from_)
        .where(Lesson.lesson_date <= to)
        .order_by(Lesson.lesson_date.desc(), Lesson.start_time.desc())
    )
    rows = (await db.execute(stmt)).all()

    return [
        StudentAttendanceEntry(
            lesson_id=l.id,
            group_id=l.group_id,
            group_code=l.group.code if l.group else "",
            lesson_date=l.lesson_date,
            start_time=l.start_time,
            end_time=l.end_time,
            lesson_status=l.status,
            topic=l.topic,
            status=a.status,  # type: ignore[arg-type]
            late_minutes=a.late_minutes,
            reason_code=a.reason_code,  # type: ignore[arg-type]
            reason_text=a.reason_text,
        )
        for (a, l) in rows
    ]


@router.get("/schedule", response_model=list[LessonRead])
async def my_schedule(
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_student),
):
    today = date.today()
    if from_ is None:
        from_ = today
    if to is None:
        to = from_ + timedelta(days=14)
    if to < from_:
        raise HTTPException(status_code=400, detail="`to` must be on or after `from`")

    student = await _load_self(db, user.id)
    if student.group_id is None:
        return []

    stmt = (
        select(Lesson)
        .options(
            selectinload(Lesson.group).selectinload(Group.course),
            selectinload(Lesson.teacher),
            selectinload(Lesson.room),
        )
        .where(Lesson.group_id == student.group_id)
        .where(Lesson.lesson_date >= from_)
        .where(Lesson.lesson_date <= to)
        .order_by(Lesson.lesson_date.asc(), Lesson.start_time.asc())
    )
    items = list((await db.execute(stmt)).scalars().all())
    return [_serialise_lesson(l) for l in items]
