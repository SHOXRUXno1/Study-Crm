"""Attendance & journal API.

Endpoints:

* ``GET  /lessons/{id}/attendance``                — roster + marks for the
  lesson detail dialog.
* ``PUT  /lessons/{id}/attendance``                — bulk upsert.
* ``GET  /groups/{id}/journal?from=&to=``          — full grid for the group
  journal page.
* ``GET  /students/{id}/attendance?from=&to=``     — per-student log.

RBAC:
- Admin sees and edits everything.
- Teacher only sees / edits attendance for lessons they're assigned to (the
  lesson's ``teacher_id`` or, as a fallback, the group's ``teacher_id``).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.attendance import Attendance
from app.models.group import Group
from app.models.lesson import Lesson
from app.models.student import Student
from app.models.teacher import Teacher
from app.schemas.attendance import (
    AttendanceBulkUpsert,
    AttendanceMarkRead,
    AttendanceRosterStudent,
    GroupJournal,
    JournalLesson,
    JournalMark,
    JournalStudent,
    JournalStudentStats,
    LessonAttendanceRead,
    StudentAttendanceEntry,
)
from app.schemas.auth import AuthUser
from app.services.attendance_service import (
    filter_marks_to_enrolled,
    maybe_autocomplete_lesson,
    upsert_marks,
)

router = APIRouter(tags=["journal"])


# ── Internal helpers ─────────────────────────────────────────────────────────
def _teacher_full_name(t: Teacher | None) -> Optional[str]:
    if not t:
        return None
    parts = [t.last_name, t.first_name, t.middle_name]
    name = " ".join(p for p in parts if p)
    return name or None


def _can_access_lesson(lesson: Lesson, user: AuthUser) -> bool:
    if user.role == "admin":
        return True
    if user.role != "teacher" or user.id is None:
        return False
    if lesson.teacher_id == user.id:
        return True
    if lesson.group is not None and lesson.group.teacher_id == user.id:
        return True
    return False


async def _load_lesson_with_relations(db: AsyncSession, lesson_id: int) -> Lesson | None:
    stmt = (
        select(Lesson)
        .options(
            selectinload(Lesson.group).selectinload(Group.course),
            selectinload(Lesson.teacher),
        )
        .where(Lesson.id == lesson_id)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def _serialise_mark(a: Attendance) -> AttendanceMarkRead:
    return AttendanceMarkRead(
        id=a.id,
        lesson_id=a.lesson_id,
        student_id=a.student_id,
        status=a.status,  # type: ignore[arg-type]
        late_minutes=a.late_minutes,
        reason_code=a.reason_code,  # type: ignore[arg-type]
        reason_text=a.reason_text,
        marked_by_role=a.marked_by_role,  # type: ignore[arg-type]
        marked_by_id=a.marked_by_id,
        marked_by_name=_teacher_full_name(a.marked_by) if a.marked_by_id else None,
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


# ── GET /lessons/{id}/attendance — roster + marks for one lesson ─────────────
@router.get("/lessons/{lesson_id}/attendance", response_model=LessonAttendanceRead)
async def get_lesson_attendance(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    lesson = await _load_lesson_with_relations(db, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    # Same RBAC rule as PUT — be consistent (403 instead of disguised 404).
    if not _can_access_lesson(lesson, user):
        raise HTTPException(status_code=403, detail="Нет прав на этот урок")

    students_q = await db.execute(
        select(Student)
        .where(Student.group_id == lesson.group_id)
        .where(Student.is_active.is_(True))
        .order_by(Student.full_name.asc())
    )
    students = list(students_q.scalars().all())

    marks_q = await db.execute(
        select(Attendance)
        .options(selectinload(Attendance.marked_by))
        .where(Attendance.lesson_id == lesson_id)
    )
    marks_by_student: dict[int, Attendance] = {
        a.student_id: a for a in marks_q.scalars().all()
    }

    roster = [
        AttendanceRosterStudent(
            student_id=s.id,
            full_name=s.full_name,
            payment_status=s.payment_status,
            mark=_serialise_mark(marks_by_student[s.id])
            if s.id in marks_by_student
            else None,
        )
        for s in students
    ]

    return LessonAttendanceRead(
        lesson_id=lesson.id,
        group_id=lesson.group_id,
        group_code=lesson.group.code if lesson.group else "",
        course_name=lesson.group.course.name if lesson.group and lesson.group.course else None,
        teacher_id=lesson.teacher_id,
        teacher_name=_teacher_full_name(lesson.teacher),
        lesson_date=lesson.lesson_date,
        start_time=lesson.start_time,
        end_time=lesson.end_time,
        status=lesson.status,
        topic=lesson.topic,
        notes=lesson.notes,
        students=roster,
    )


# ── PUT /lessons/{id}/attendance — bulk upsert ───────────────────────────────
@router.put("/lessons/{lesson_id}/attendance", response_model=LessonAttendanceRead)
async def upsert_lesson_attendance(
    lesson_id: int,
    body: AttendanceBulkUpsert,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if user.role == "manager":
        raise HTTPException(status_code=403, detail="read_only")
    lesson = await _load_lesson_with_relations(db, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    if not _can_access_lesson(lesson, user):
        raise HTTPException(status_code=403, detail="Нет прав на этот урок")
    if lesson.status == "rescheduled":
        raise HTTPException(
            status_code=400,
            detail="Этот урок перенесён — отметки фиксируются на новой дате",
        )
    if user.role == "teacher" and lesson.lesson_date < date.today():
        raise HTTPException(
            status_code=403,
            detail="past_lesson",
        )

    enrolled_q = await db.execute(
        select(Student.id)
        .where(Student.group_id == lesson.group_id)
        .where(Student.is_active.is_(True))
    )
    enrolled_ids = {row[0] for row in enrolled_q.all()}

    safe_inputs = filter_marks_to_enrolled(body.marks, enrolled_ids)
    if len(safe_inputs) != len(body.marks):
        # Silently drop foreign students rather than 400 — keeps the bulk
        # upsert resilient to UI/DB drift between requests.
        pass

    await upsert_marks(db, lesson=lesson, inputs=safe_inputs, user=user)
    await maybe_autocomplete_lesson(db, lesson=lesson)
    await db.commit()

    return await get_lesson_attendance(lesson_id, db, user)  # re-read freshly


# ── DELETE /lessons/{id}/attendance/{student_id} — clear single mark ─────────
@router.delete(
    "/lessons/{lesson_id}/attendance/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_lesson_attendance(
    lesson_id: int,
    student_id: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if user.role == "manager":
        raise HTTPException(status_code=403, detail="read_only")
    lesson = await _load_lesson_with_relations(db, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    if not _can_access_lesson(lesson, user):
        raise HTTPException(status_code=403, detail="Нет прав на этот урок")
    if lesson.status == "rescheduled":
        raise HTTPException(
            status_code=400,
            detail="Этот урок перенесён — отметки фиксируются на новой дате",
        )

    await db.execute(
        delete(Attendance)
        .where(Attendance.lesson_id == lesson_id)
        .where(Attendance.student_id == student_id)
    )
    await db.commit()
    return None


# ── GET /groups/{id}/journal?from=&to= — group journal grid ──────────────────
@router.get("/groups/{group_id}/journal", response_model=GroupJournal)
async def get_group_journal(
    group_id: int,
    from_: Optional[date] = Query(None, alias="from", description="YYYY-MM-DD inclusive"),
    to: Optional[date] = Query(None, description="YYYY-MM-DD inclusive"),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    group_q = await db.execute(
        select(Group)
        .options(selectinload(Group.course), selectinload(Group.teacher))
        .where(Group.id == group_id)
    )
    group = group_q.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    if user.role == "teacher" and group.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    # Default range: full group lifecycle, capped to 12 months for safety.
    if from_ is None:
        from_ = group.start_date
    if to is None:
        to = group.end_date
    if to < from_:
        raise HTTPException(status_code=400, detail="`to` must be on or after `from`")
    if to - from_ > timedelta(days=400):
        raise HTTPException(status_code=400, detail="range too wide (max 400 days)")

    lessons_q = await db.execute(
        select(Lesson)
        .where(Lesson.group_id == group_id)
        .where(Lesson.lesson_date >= from_)
        .where(Lesson.lesson_date <= to)
        .order_by(Lesson.lesson_date.asc(), Lesson.start_time.asc())
    )
    lessons = list(lessons_q.scalars().all())

    students_q = await db.execute(
        select(Student)
        .where(Student.group_id == group_id)
        .where(Student.is_active.is_(True))
        .order_by(Student.full_name.asc())
    )
    students = list(students_q.scalars().all())

    lesson_ids = [l.id for l in lessons]
    student_ids = [s.id for s in students]

    marks: dict[int, dict[int, JournalMark]] = {}
    if lesson_ids and student_ids:
        marks_q = await db.execute(
            select(Attendance)
            .where(Attendance.lesson_id.in_(lesson_ids))
            .where(Attendance.student_id.in_(student_ids))
        )
        for a in marks_q.scalars().all():
            marks.setdefault(a.student_id, {})[a.lesson_id] = JournalMark(
                status=a.status,  # type: ignore[arg-type]
                late_minutes=a.late_minutes,
                reason_code=a.reason_code,  # type: ignore[arg-type]
                reason_text=a.reason_text,
            )

    # ── Per-student stats over the loaded slice ──────────────────────────────
    today = date.today()
    countable_lessons = [
        l for l in lessons
        if l.status != "rescheduled" and l.status != "cancelled" and l.lesson_date <= today
    ]

    stats: list[JournalStudentStats] = []
    total_marks = 0
    total_present_or_late = 0
    for s in students:
        present = late = absent = excused = 0
        sm = marks.get(s.id, {})
        for l in countable_lessons:
            m = sm.get(l.id)
            if not m:
                continue
            if m.status == "present":
                present += 1
            elif m.status == "late":
                late += 1
            elif m.status == "absent":
                absent += 1
            elif m.status == "excused":
                excused += 1
        total = present + late + absent + excused
        rate = round(((present + late) / total) * 100) if total > 0 else 0
        stats.append(
            JournalStudentStats(
                student_id=s.id,
                present=present,
                late=late,
                absent=absent,
                excused=excused,
                total=total,
                rate_pct=rate,
            )
        )
        total_marks += total
        total_present_or_late += present + late

    overall = (
        round((total_present_or_late / total_marks) * 100) if total_marks > 0 else 0
    )

    return GroupJournal(
        group_id=group.id,
        group_code=group.code,
        course_name=group.course.name if group.course else None,
        teacher_id=group.teacher_id,
        teacher_name=_teacher_full_name(group.teacher),
        days=group.days,
        lessons=[
            JournalLesson(
                id=l.id,
                lesson_date=l.lesson_date,
                start_time=l.start_time,
                end_time=l.end_time,
                status=l.status,
                topic=l.topic,
            )
            for l in lessons
        ],
        students=[
            JournalStudent(
                id=s.id,
                full_name=s.full_name,
                payment_status=s.payment_status,
            )
            for s in students
        ],
        marks=marks,
        stats=stats,
        overall_rate_pct=overall,
    )


# ── GET /students/{id}/attendance — per-student log ──────────────────────────
@router.get(
    "/students/{student_id}/attendance",
    response_model=list[StudentAttendanceEntry],
)
async def get_student_attendance(
    student_id: int,
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Учащийся не найден")

    # Teacher can only see their own students.
    if user.role == "teacher":
        if student.group_id is None:
            raise HTTPException(status_code=404, detail="Учащийся не найден")
        group = await db.get(Group, student.group_id)
        if not group or group.teacher_id != user.id:
            raise HTTPException(status_code=404, detail="Учащийся не найден")

    # Students can only see their own attendance.
    if user.role == "student" and student.id != user.id:
        raise HTTPException(status_code=404, detail="Учащийся не найден")

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
        .where(Attendance.student_id == student_id)
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
