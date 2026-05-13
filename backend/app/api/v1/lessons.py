from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.models.group import Group
from app.models.lesson import Lesson
from app.schemas.auth import AuthUser
from app.schemas.lesson import (
    LessonCancel,
    LessonJournalUpdate,
    LessonRead,
    LessonReschedule,
    LessonUpdate,
)

router = APIRouter(tags=["schedule"])


# ── Serialisation helper ──────────────────────────────────────────────────────
def _serialise(lesson: Lesson) -> LessonRead:
    g: Group | None = lesson.group
    teacher_name: str | None = None
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


# ── GET /schedule — main feed for the calendar UI ─────────────────────────────
@router.get("/schedule", response_model=list[LessonRead])
async def get_schedule(
    from_: date = Query(..., alias="from", description="YYYY-MM-DD inclusive"),
    to: date = Query(..., description="YYYY-MM-DD inclusive"),
    teacher_id: int | None = Query(None),
    room_id: int | None = Query(None),
    group_id: int | None = Query(None),
    course_id: int | None = Query(None),
    status_filter: str | None = Query(
        None,
        alias="status",
        description="scheduled | cancelled | completed | rescheduled",
    ),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if to < from_:
        raise HTTPException(
            status_code=400, detail="`to` must be on or after `from`"
        )

    stmt = (
        select(Lesson)
        .options(
            selectinload(Lesson.group).selectinload(Group.course),
            selectinload(Lesson.teacher),
            selectinload(Lesson.room),
        )
        .where(Lesson.lesson_date >= from_)
        .where(Lesson.lesson_date <= to)
        .order_by(Lesson.lesson_date.asc(), Lesson.start_time.asc())
    )

    # Teacher RBAC: only their lessons (matches either lesson.teacher_id or
    # the group's teacher_id, in case a lesson was reassigned).
    if user.role == "teacher":
        stmt = stmt.where(
            or_(
                Lesson.teacher_id == user.id,
                Lesson.group.has(Group.teacher_id == user.id),
            )
        )

    # Student RBAC: only lessons of their group.
    if user.role == "student":
        from app.models.student import Student as _Student

        me = await db.get(_Student, user.id)
        if not me or me.group_id is None:
            return []
        stmt = stmt.where(Lesson.group_id == me.group_id)

    if teacher_id is not None:
        stmt = stmt.where(Lesson.teacher_id == teacher_id)
    if room_id is not None:
        stmt = stmt.where(Lesson.room_id == room_id)
    if group_id is not None:
        stmt = stmt.where(Lesson.group_id == group_id)
    if course_id is not None:
        stmt = stmt.where(Lesson.group.has(Group.course_id == course_id))
    if status_filter is not None:
        stmt = stmt.where(Lesson.status == status_filter)

    items = list((await db.execute(stmt)).scalars().all())
    return [_serialise(l) for l in items]


# ── GET /lessons/{id} ─────────────────────────────────────────────────────────
@router.get("/lessons/{lesson_id}", response_model=LessonRead)
async def get_lesson(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    stmt = (
        select(Lesson)
        .options(
            selectinload(Lesson.group).selectinload(Group.course),
            selectinload(Lesson.teacher),
            selectinload(Lesson.room),
        )
        .where(Lesson.id == lesson_id)
    )
    lesson = (await db.execute(stmt)).scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    if user.role == "teacher":
        gteacher = lesson.group.teacher_id if lesson.group else None
        if lesson.teacher_id != user.id and gteacher != user.id:
            raise HTTPException(status_code=404, detail="Урок не найден")
    return _serialise(lesson)


# ── PATCH /lessons/{id} (admin only) ──────────────────────────────────────────
@router.patch(
    "/lessons/{lesson_id}",
    response_model=LessonRead,
    dependencies=[Depends(get_current_admin)],
)
async def patch_lesson(
    lesson_id: int,
    data: LessonUpdate,
    db: AsyncSession = Depends(get_db),
):
    lesson = await db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")

    payload = data.model_dump(exclude_unset=True)

    new_start = payload.get("start_time", lesson.start_time)
    new_end = payload.get("end_time", lesson.end_time)
    if new_end <= new_start:
        raise HTTPException(
            status_code=400, detail="end_time must be greater than start_time"
        )

    for field, value in payload.items():
        setattr(lesson, field, value)

    await db.commit()
    return await _reload(db, lesson_id)


# ── POST /lessons/{id}/cancel ─────────────────────────────────────────────────
@router.post(
    "/lessons/{lesson_id}/cancel",
    response_model=LessonRead,
    dependencies=[Depends(get_current_admin)],
)
async def cancel_lesson(
    lesson_id: int,
    body: LessonCancel | None = None,
    db: AsyncSession = Depends(get_db),
):
    lesson = await db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    if lesson.status == "rescheduled":
        raise HTTPException(
            status_code=400,
            detail="Этот урок уже перенесён, отменить его нельзя",
        )
    lesson.status = "cancelled"
    if body and body.note is not None:
        lesson.note = body.note
    await db.flush()

    from app.services import notifications_service as _ns

    audience = await _ns.audience_for_group(db, lesson.group_id)
    await _ns.emit(
        db,
        kind="lesson_cancelled",
        severity="warning",
        title=f"Урок отменён: {lesson.lesson_date.isoformat()}",
        body=lesson.note or None,
        link=f"/groups/{lesson.group_id}",
        payload={
            "lesson_id": lesson.id,
            "group_id": lesson.group_id,
            "lesson_date": lesson.lesson_date.isoformat(),
        },
        dedup_key=f"lesson:cancelled:{lesson.id}",
        audience=audience,
    )
    await db.commit()
    return await _reload(db, lesson_id)


# ── POST /lessons/{id}/reschedule ─────────────────────────────────────────────
@router.post(
    "/lessons/{lesson_id}/reschedule",
    response_model=LessonRead,
    dependencies=[Depends(get_current_admin)],
)
async def reschedule_lesson(
    lesson_id: int,
    data: LessonReschedule,
    db: AsyncSession = Depends(get_db),
):
    """Mark the original lesson as `rescheduled`, create a new `scheduled` one
    on the new date/time pointing back via `rescheduled_from_id`.
    """
    original = await db.get(Lesson, lesson_id)
    if not original:
        raise HTTPException(status_code=404, detail="Урок не найден")
    if original.status in ("rescheduled", "cancelled"):
        raise HTTPException(
            status_code=400,
            detail="Этот урок уже не активен — переносить нечего",
        )

    new_lesson = Lesson(
        group_id=original.group_id,
        teacher_id=original.teacher_id,
        room_id=original.room_id,
        lesson_date=data.new_date,
        start_time=data.new_start_time,
        end_time=data.new_end_time,
        status="scheduled",
        note=data.note,
        rescheduled_from_id=original.id,
    )
    db.add(new_lesson)
    original.status = "rescheduled"
    if data.note is not None:
        original.note = data.note
    await db.flush()

    from app.services import notifications_service as _ns

    audience = await _ns.audience_for_group(db, original.group_id)
    await _ns.emit(
        db,
        kind="schedule_changed",
        severity="info",
        title=(
            f"Урок перенесён: {original.lesson_date.isoformat()} → "
            f"{new_lesson.lesson_date.isoformat()}"
        ),
        body=data.note,
        link=f"/groups/{original.group_id}",
        payload={
            "from_lesson_id": original.id,
            "to_lesson_id": new_lesson.id,
            "group_id": original.group_id,
            "from_date": original.lesson_date.isoformat(),
            "to_date": new_lesson.lesson_date.isoformat(),
        },
        dedup_key=f"lesson:rescheduled:{original.id}:{new_lesson.id}",
        audience=audience,
    )
    await db.commit()
    await db.refresh(new_lesson)
    return await _reload(db, new_lesson.id)


# ── PATCH /lessons/{id}/journal — set topic/notes (admin or assigned teacher) ─
@router.patch("/lessons/{lesson_id}/journal", response_model=LessonRead)
async def patch_lesson_journal(
    lesson_id: int,
    data: LessonJournalUpdate,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    stmt = (
        select(Lesson)
        .options(
            selectinload(Lesson.group).selectinload(Group.course),
            selectinload(Lesson.teacher),
            selectinload(Lesson.room),
        )
        .where(Lesson.id == lesson_id)
    )
    lesson = (await db.execute(stmt)).scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")

    if user.role == "teacher":
        gteacher = lesson.group.teacher_id if lesson.group else None
        if lesson.teacher_id != user.id and gteacher != user.id:
            raise HTTPException(status_code=404, detail="Урок не найден")

    payload = data.model_dump(exclude_unset=True)
    if "topic" in payload:
        lesson.topic = payload["topic"]
    if "notes" in payload:
        lesson.notes = payload["notes"]

    await db.commit()
    return await _reload(db, lesson_id)


# ── DELETE /lessons/{id} (admin only) ─────────────────────────────────────────
@router.delete(
    "/lessons/{lesson_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin)],
)
async def delete_lesson(lesson_id: int, db: AsyncSession = Depends(get_db)):
    lesson = await db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    await db.delete(lesson)
    await db.commit()
    return None


# ── helper ────────────────────────────────────────────────────────────────────
async def _reload(db: AsyncSession, lesson_id: int) -> LessonRead:
    stmt = (
        select(Lesson)
        .options(
            selectinload(Lesson.group).selectinload(Group.course),
            selectinload(Lesson.teacher),
            selectinload(Lesson.room),
        )
        .where(Lesson.id == lesson_id)
    )
    lesson = (await db.execute(stmt)).scalar_one()
    return _serialise(lesson)
