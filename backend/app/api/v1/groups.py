from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_admin_or_manager, get_current_user
from app.models.group import Group
from app.models.student import Student
from app.schemas.auth import AuthUser
from app.models.group_vacation import GroupVacation
from app.models.lesson import Lesson
from app.schemas.group import (
    ConflictCheck,
    ConflictCheckResponse,
    ConflictHit as ConflictHitSchema,
    GroupCreate,
    GroupListResponse,
    GroupRead,
    GroupUpdate,
    VacationCreate,
    VacationListResponse,
    VacationRead,
)
from app.services.conflict_service import (
    ConflictHit,
    find_group_conflicts,
)
from app.services.group_status import derived_group_status
from app.services.schedule_service import sync_future_lessons

router = APIRouter(prefix="/groups", tags=["groups"])


def _hit_to_schema(h: ConflictHit) -> ConflictHitSchema:
    return ConflictHitSchema(
        kind=h.kind,
        group_id=h.group_id,
        group_code=h.group_code,
        teacher_name=h.teacher_name,
        room_name=h.room_name,
        days=h.days,
        start_time=h.start_time,
        end_time=h.end_time,
        start_date=h.start_date,
        end_date=h.end_date,
        overlap_start=h.overlap_start,
        overlap_end=h.overlap_end,
    )


def _conflict_409(hits: list[ConflictHit]) -> HTTPException:
    """Build a 409 Conflict whose body matches ConflictCheckResponse."""
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "message": "schedule conflict",
            "conflicts": [_hit_to_schema(h).model_dump(mode="json") for h in hits],
        },
    )


async def _emit_conflicts_if_any(
    db: AsyncSession,
    *,
    group_id: int,
    days: str,
    start_time,
    end_time,
    start_date,
    end_date,
    teacher_id: int | None,
    room_id: int | None,
) -> None:
    """Non-blocking conflict notification — used when admin saves with
    ``force=True`` and we still want a record of the actual collisions."""
    try:
        hits = await find_group_conflicts(
            db,
            days=days,
            start_time=start_time,
            end_time=end_time,
            start_date=start_date,
            end_date=end_date,
            teacher_id=teacher_id,
            room_id=room_id,
            exclude_group_id=group_id,
        )
        if not hits:
            return
        from app.services import notifications_service as _ns

        audience = await _ns.audience_for_group(db, group_id)
        for h in hits[:5]:  # cap to avoid spam
            await _ns.emit(
                db,
                kind="schedule_conflict",
                severity="critical",
                title=f"Конфликт расписания: {h.group_code}",
                body=(
                    f"{h.kind}: {h.days} {h.start_time}-{h.end_time}"
                    if h.start_time and h.end_time
                    else h.kind
                ),
                link=f"/groups/{group_id}",
                payload={
                    "group_id": group_id,
                    "conflict_kind": h.kind,
                    "other_group_id": h.group_id,
                    "other_group_code": h.group_code,
                },
                dedup_key=(
                    f"conflict:{group_id}:{h.group_id}:"
                    f"{h.start_date.isoformat() if h.start_date else 'na'}"
                ),
                audience=audience,
            )
    except Exception:  # noqa: BLE001 — never break domain action
        pass


async def _catch_up_group_statuses(db: AsyncSession) -> None:
    """Ensure every group's status matches its date window.

    Only two statuses exist: active (end_date not yet passed) and
    completed (end_date has passed). This single UPDATE is idempotent.
    """
    today = date.today()

    await db.execute(
        update(Group)
        .where(Group.status != "completed", Group.end_date < today)
        .values(status="completed")
    )

    await db.commit()


def _project_derived_status(groups: list[Group], today: date) -> None:
    """Defense-in-depth: snap each group's in-memory status to the derived
    value before we serialise it.

    The catch-up above already normalises the DB, so this is mostly a
    no-op — but it guarantees the response is correct even if a race or
    a bug let a stale row slip through. Display correctness becomes
    independent of write-path success.
    """
    for g in groups:
        g.status = derived_group_status(
            start_date=g.start_date,
            end_date=g.end_date,
            today=today,
        )


async def _hydrate_student_counts(db: AsyncSession, groups: list[Group]) -> None:
    """Override stale denormalised `student_count` with actual count of *active*
    students from the `students` table.

    Only active students are counted to keep the value consistent with the
    journal/attendance roster (which itself filters by ``is_active=True``).
    """
    if not groups:
        return
    ids = [g.id for g in groups]
    rows = (
        await db.execute(
            select(Student.group_id, func.count(Student.id))
            .where(Student.group_id.in_(ids), Student.is_active.is_(True))
            .group_by(Student.group_id)
        )
    ).all()
    counts = {gid: cnt for gid, cnt in rows}
    for g in groups:
        g.student_count = counts.get(g.id, 0)


@router.get("", response_model=GroupListResponse)
async def list_groups(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: str | None = Query(None, description="active | completed"),
    course_id: int | None = Query(None),
    teacher_id: int | None = Query(None),
    search: str | None = Query(None, description="Поиск по коду группы (ILIKE)"),
    sort: str = Query("newest", description="newest | oldest | az | za | most-students"),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if user.role == "student":
        raise HTTPException(status_code=403, detail="Forbidden")

    await _catch_up_group_statuses(db)

    stmt = select(Group)
    count_stmt = select(func.count()).select_from(Group)

    # Role-based scope: a teacher can only see their own groups.
    if user.role == "teacher":
        stmt = stmt.where(Group.teacher_id == user.id)
        count_stmt = count_stmt.where(Group.teacher_id == user.id)

    if status is not None:
        stmt = stmt.where(Group.status == status)
        count_stmt = count_stmt.where(Group.status == status)

    if course_id is not None:
        stmt = stmt.where(Group.course_id == course_id)
        count_stmt = count_stmt.where(Group.course_id == course_id)

    if teacher_id is not None:
        stmt = stmt.where(Group.teacher_id == teacher_id)
        count_stmt = count_stmt.where(Group.teacher_id == teacher_id)

    if search:
        like = f"%{search}%"
        stmt = stmt.where(Group.code.ilike(like))
        count_stmt = count_stmt.where(Group.code.ilike(like))

    if sort == "az":
        stmt = stmt.order_by(Group.code.asc())
    elif sort == "za":
        stmt = stmt.order_by(Group.code.desc())
    elif sort == "oldest":
        stmt = stmt.order_by(Group.created_at.asc())
    elif sort == "most-students":
        # Sorted post-fetch (see below) using actual student counts.
        stmt = stmt.order_by(Group.created_at.desc())
    else:
        stmt = stmt.order_by(Group.created_at.desc())

    today = date.today()

    if sort == "most-students":
        # We sort post-fetch by computed counts to ensure freshness.
        stmt = stmt.offset(skip).limit(limit)
        items = list((await db.execute(stmt)).scalars().all())
        total = (await db.execute(count_stmt)).scalar_one()
        await _hydrate_student_counts(db, items)
        _project_derived_status(items, today)
        items.sort(key=lambda g: g.student_count, reverse=True)
        return GroupListResponse(items=items, total=total, skip=skip, limit=limit)

    stmt = stmt.offset(skip).limit(limit)
    items = list((await db.execute(stmt)).scalars().all())
    total = (await db.execute(count_stmt)).scalar_one()
    await _hydrate_student_counts(db, items)
    _project_derived_status(items, today)

    return GroupListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/{group_id}", response_model=GroupRead)
async def get_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if user.role == "student":
        raise HTTPException(status_code=403, detail="Forbidden")

    await _catch_up_group_statuses(db)

    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    if user.role == "teacher" and group.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    await _hydrate_student_counts(db, [group])
    _project_derived_status([group], date.today())
    return group


@router.post(
    "/check-conflicts",
    response_model=ConflictCheckResponse,
    dependencies=[Depends(get_current_admin)],
)
async def check_conflicts(
    payload: ConflictCheck,
    db: AsyncSession = Depends(get_db),
):
    """Read-only preview: returns groups that would clash with the proposed slot.

    Used by the create/edit form to render a live conflict banner BEFORE the
    admin hits Save. Same response shape is returned by POST/PATCH on 409.
    """
    # Snap any drifted status rows to their derived value first — otherwise
    # a "ghost" active group whose end_date already passed would falsely
    # show up as a conflict.
    await _catch_up_group_statuses(db)

    derived = derived_group_status(
        start_date=payload.start_date,
        end_date=payload.end_date,
        today=date.today(),
    )
    if derived != "active":
        # A group that is already completed cannot occupy a future slot.
        return ConflictCheckResponse(conflicts=[])

    hits = await find_group_conflicts(
        db,
        days=payload.days,
        start_time=payload.start_time,
        end_time=payload.end_time,
        start_date=payload.start_date,
        end_date=payload.end_date,
        teacher_id=payload.teacher_id,
        room_id=payload.room_id,
        exclude_group_id=payload.exclude_group_id,
    )
    return ConflictCheckResponse(conflicts=[_hit_to_schema(h) for h in hits])


@router.post(
    "",
    response_model=GroupRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin)],
)
async def create_group(
    data: GroupCreate,
    force: bool = Query(False, description="Игнорировать конфликты расписания"),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(Group).where(func.lower(Group.code) == data.code.strip().upper().lower())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Группа с таким кодом уже существует")

    derived = derived_group_status(
        start_date=data.start_date,
        end_date=data.end_date,
        today=date.today(),
    )

    if not force and derived == "active":
        await _catch_up_group_statuses(db)
        hits = await find_group_conflicts(
            db,
            days=data.days,
            start_time=data.start_time,
            end_time=data.end_time,
            start_date=data.start_date,
            end_date=data.end_date,
            teacher_id=data.teacher_id,
            room_id=data.room_id,
        )
        if hits:
            raise _conflict_409(hits)

    group = Group(**{k: v for k, v in data.model_dump().items()})
    group.code = data.code.strip().upper()
    group.status = derived
    db.add(group)
    await db.flush()  # need group.id for sync_future_lessons
    await sync_future_lessons(db, group)

    # If admin used force=True, double-check for residual conflicts and notify.
    if force and derived == "active":
        await _emit_conflicts_if_any(
            db,
            group_id=group.id,
            days=data.days,
            start_time=data.start_time,
            end_time=data.end_time,
            start_date=data.start_date,
            end_date=data.end_date,
            teacher_id=data.teacher_id,
            room_id=data.room_id,
        )

    await db.commit()
    await db.refresh(group)
    # Reload so selectin relationships are populated
    group = await db.get(Group, group.id)
    await _hydrate_student_counts(db, [group])
    return group


@router.patch(
    "/{group_id}",
    response_model=GroupRead,
    dependencies=[Depends(get_current_admin)],
)
async def update_group(
    group_id: int,
    data: GroupUpdate,
    force: bool = Query(False, description="Игнорировать конфликты расписания"),
    db: AsyncSession = Depends(get_db),
):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    update_data = data.model_dump(exclude_unset=True)

    if "code" in update_data and update_data["code"]:
        new_code = update_data["code"].strip().upper()
        dup = await db.execute(
            select(Group).where(
                func.lower(Group.code) == new_code.lower(),
                Group.id != group_id,
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Группа с таким кодом уже существует")
        update_data["code"] = new_code

    # Whether the change affects future lesson generation OR any conflict input.
    schedule_fields = {
        "days", "start_time", "end_time",
        "start_date", "end_date", "status",
        "teacher_id", "room_id",
    }
    schedule_dirty = bool(schedule_fields & update_data.keys())

    if schedule_dirty and not force:
        # Conflict check uses MERGED values: new where provided, current otherwise.
        merged_days = update_data.get("days", group.days)
        merged_start_time = update_data.get("start_time", group.start_time)
        merged_end_time = update_data.get("end_time", group.end_time)
        merged_start_date = update_data.get("start_date", group.start_date)
        merged_end_date = update_data.get("end_date", group.end_date)
        merged_teacher_id = (
            update_data["teacher_id"] if "teacher_id" in update_data else group.teacher_id
        )
        merged_room_id = (
            update_data["room_id"] if "room_id" in update_data else group.room_id
        )

        derived_after = derived_group_status(
            start_date=merged_start_date,
            end_date=merged_end_date,
            today=date.today(),
        )
        if derived_after == "active":
            await _catch_up_group_statuses(db)
            hits = await find_group_conflicts(
                db,
                days=merged_days,
                start_time=merged_start_time,
                end_time=merged_end_time,
                start_date=merged_start_date,
                end_date=merged_end_date,
                teacher_id=merged_teacher_id,
                room_id=merged_room_id,
                exclude_group_id=group_id,
            )
            if hits:
                raise _conflict_409(hits)

    for field, value in update_data.items():
        setattr(group, field, value)

    group.status = derived_group_status(
        start_date=group.start_date,
        end_date=group.end_date,
        today=date.today(),
    )

    await db.flush()
    if schedule_dirty:
        await sync_future_lessons(db, group)

    if force and schedule_dirty and group.status == "active":
        await _emit_conflicts_if_any(
            db,
            group_id=group.id,
            days=group.days,
            start_time=group.start_time,
            end_time=group.end_time,
            start_date=group.start_date,
            end_date=group.end_date,
            teacher_id=group.teacher_id,
            room_id=group.room_id,
        )

    await db.commit()
    await db.refresh(group)
    group = await db.get(Group, group.id)
    await _hydrate_student_counts(db, [group])
    return group


@router.delete(
    "/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin)],
)
async def delete_group(group_id: int, db: AsyncSession = Depends(get_db)):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    await db.delete(group)
    await db.commit()
    return None


# ── Vacation endpoints ───────────────────────────────────────────────────────


@router.get("/{group_id}/vacations", response_model=VacationListResponse)
async def list_vacations(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    rows = (
        await db.execute(
            select(GroupVacation)
            .where(GroupVacation.group_id == group_id)
            .order_by(GroupVacation.vacation_date.desc())
        )
    ).scalars().all()
    return VacationListResponse(items=list(rows))


@router.post(
    "/{group_id}/vacations",
    response_model=VacationRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin)],
)
async def create_vacation(
    group_id: int,
    data: VacationCreate,
    db: AsyncSession = Depends(get_db),
):
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    existing = (
        await db.execute(
            select(GroupVacation).where(
                GroupVacation.group_id == group_id,
                GroupVacation.vacation_date == data.vacation_date,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Каникулы на эту дату уже назначены")

    vacation = GroupVacation(
        group_id=group_id,
        vacation_date=data.vacation_date,
        note=data.note,
    )
    db.add(vacation)

    lesson = (
        await db.execute(
            select(Lesson).where(
                Lesson.group_id == group_id,
                Lesson.lesson_date == data.vacation_date,
                Lesson.status == "scheduled",
            )
        )
    ).scalar_one_or_none()
    if lesson:
        lesson.status = "cancelled"
        lesson.note = data.note or "Каникулы"

    await db.commit()
    await db.refresh(vacation)
    return vacation


@router.delete(
    "/{group_id}/vacations/{vacation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin)],
)
async def delete_vacation(
    group_id: int,
    vacation_id: int,
    db: AsyncSession = Depends(get_db),
):
    vacation = await db.get(GroupVacation, vacation_id)
    if not vacation or vacation.group_id != group_id:
        raise HTTPException(status_code=404, detail="Каникулы не найдены")

    lesson = (
        await db.execute(
            select(Lesson).where(
                Lesson.group_id == group_id,
                Lesson.lesson_date == vacation.vacation_date,
                Lesson.status == "cancelled",
            )
        )
    ).scalar_one_or_none()
    if lesson:
        lesson.status = "scheduled"
        lesson.note = None

    await db.delete(vacation)
    await db.commit()
    return None
