from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_admin_or_manager, get_current_user
from app.core.security import hash_password
from app.models.group import Group
from app.models.student import Student
from app.models.student_note import StudentNote
from app.schemas.auth import AuthUser
from app.schemas.student import (
    NoteCreate,
    NoteListResponse,
    NoteRead,
    StudentCreate,
    StudentListResponse,
    StudentRead,
    StudentUpdate,
)
from app.schemas.student_transfer import (
    StudentTransferPreview,
    StudentTransferRead,
    StudentTransferRequest,
    StudentTransferResult,
    GroupSnapshot,
)

router = APIRouter(prefix="/students", tags=["students"])


async def _teacher_group_ids(db: AsyncSession, teacher_id: int) -> list[int]:
    res = await db.execute(select(Group.id).where(Group.teacher_id == teacher_id))
    return [row[0] for row in res.all()]


def _serialize_student(s: Student, *, role: str) -> dict:
    """Serialize through the Pydantic model and strip admin-only fields for non-admins.

    `finance_note` is treated as PII / admin-only; teachers must never see it.
    """
    payload = StudentRead.model_validate(s).model_dump()
    payload["has_credentials"] = bool(getattr(s, "password_hash", None))
    if role != "admin":
        payload["finance_note"] = None
    return payload


async def _phone_taken(
    db: AsyncSession, phone: str, exclude_id: int | None = None
) -> bool:
    stmt = select(Student.id).where(Student.phone == phone)
    if exclude_id is not None:
        stmt = stmt.where(Student.id != exclude_id)
    return (await db.execute(stmt)).first() is not None


@router.get("", response_model=StudentListResponse)
async def list_students(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    group_id: int | None = Query(None),
    payment_status: str | None = Query(
        None, description="paid | debt"
    ),
    is_active: bool | None = Query(None),
    search: str | None = Query(
        None, description="Поиск по ФИО / телефону"
    ),
    sort: str = Query(
        "newest", description="newest | oldest | az | za"
    ),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    # Students cannot list their peers; the cabinet only exposes their own
    # data via /me/student/*.
    if user.role == "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    stmt = select(Student)
    count_stmt = select(func.count()).select_from(Student)

    # Role-based scope: teacher sees only students in their groups.
    if user.role == "teacher":
        gids = await _teacher_group_ids(db, user.id)
        if not gids:
            return StudentListResponse(items=[], total=0, skip=skip, limit=limit)
        stmt = stmt.where(Student.group_id.in_(gids))
        count_stmt = count_stmt.where(Student.group_id.in_(gids))
        # Teachers see only active students by default — deactivated ones are
        # hidden unless they explicitly request `?is_active=false`.
        if is_active is None:
            is_active = True

    if group_id is not None:
        stmt = stmt.where(Student.group_id == group_id)
        count_stmt = count_stmt.where(Student.group_id == group_id)

    if payment_status is not None:
        stmt = stmt.where(Student.payment_status == payment_status)
        count_stmt = count_stmt.where(Student.payment_status == payment_status)

    if is_active is not None:
        stmt = stmt.where(Student.is_active == is_active)
        count_stmt = count_stmt.where(Student.is_active == is_active)

    if search:
        like = f"%{search}%"
        cond = or_(
            Student.full_name.ilike(like),
            Student.phone.ilike(like),
            Student.parent_phone.ilike(like),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    if sort == "az":
        stmt = stmt.order_by(Student.full_name.asc())
    elif sort == "za":
        stmt = stmt.order_by(Student.full_name.desc())
    elif sort == "oldest":
        stmt = stmt.order_by(Student.created_at.asc())
    else:
        stmt = stmt.order_by(Student.created_at.desc())

    stmt = stmt.offset(skip).limit(limit)
    items = (await db.execute(stmt)).scalars().all()
    total = (await db.execute(count_stmt)).scalar_one()

    serialized = [_serialize_student(s, role=user.role) for s in items]
    return StudentListResponse(items=serialized, total=total, skip=skip, limit=limit)


@router.get("/{student_id}", response_model=StudentRead)
async def get_student(
    student_id: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    if user.role == "teacher":
        gids = await _teacher_group_ids(db, user.id)
        if student.group_id not in gids:
            raise HTTPException(status_code=404, detail="Ученик не найден")
    elif user.role == "student":
        # Students can only fetch their own card via this endpoint.
        if student.id != user.id:
            raise HTTPException(status_code=404, detail="Ученик не найден")

    return _serialize_student(student, role=user.role)


@router.post(
    "",
    response_model=StudentRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin_or_manager)],
)
async def create_student(data: StudentCreate, db: AsyncSession = Depends(get_db)):
    payload = data.model_dump()
    password_plain = payload.pop("password", None)

    # Cabinet password requires a phone (it is the login).
    if password_plain and not payload.get("phone"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Для пароля кабинета нужен номер телефона",
        )

    if payload.get("phone") and await _phone_taken(db, payload["phone"]):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Этот телефон уже занят",
        )

    student = Student(**payload)
    if password_plain:
        student.password_hash = hash_password(password_plain)
    db.add(student)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Этот телефон уже занят",
        )

    from app.services import notifications_service as _ns

    audience = await _ns.audience_for_student(db, student.id)
    await _ns.emit(
        db,
        kind="new_student",
        severity="info",
        title=f"Новый ученик: {student.full_name}",
        body=(
            f"Источник: {student.source}" if student.source else None
        ),
        link=f"/students/{student.id}",
        payload={"student_id": student.id, "group_id": student.group_id},
        dedup_key=f"new_student:{student.id}",
        audience=audience,
    )
    await db.commit()
    await db.refresh(student)
    # Reload with relationships for response
    student = await db.get(Student, student.id)
    return _serialize_student(student, role="admin")


@router.patch(
    "/{student_id}",
    response_model=StudentRead,
    dependencies=[Depends(get_current_admin_or_manager)],
)
async def update_student(
    student_id: int, data: StudentUpdate, db: AsyncSession = Depends(get_db)
):
    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    update_data = data.model_dump(exclude_unset=True)
    password_plain = update_data.pop("password", None)

    # Changing group_id must go through the dedicated transfer endpoint so that
    # debt, capacity, and audit records are handled properly.
    if (
        "group_id" in update_data
        and update_data["group_id"] is not None
        and update_data["group_id"] != student.group_id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "use_transfer_endpoint",
                "message": "Use POST /students/{id}/transfer to change a student's group",
            },
        )

    # Pre-check phone uniqueness (faster, friendlier than catching DB error).
    if "phone" in update_data and update_data["phone"]:
        if await _phone_taken(
            db, update_data["phone"], exclude_id=student_id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Этот телефон уже занят",
            )

    for field, value in update_data.items():
        setattr(student, field, value)

    if password_plain is not None:
        # Empty string from FE means "do not change"; pydantic min_length=6
        # already rejects short strings, so we just hash whatever passed.
        # The phone must exist for credentials to make sense.
        if not student.phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Для пароля кабинета нужен номер телефона",
            )
        student.password_hash = hash_password(password_plain)

    # Removing phone wipes credentials so the cabinet login is consistent.
    if "phone" in update_data and not update_data["phone"]:
        student.password_hash = None

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Этот телефон уже занят",
        )
    await db.refresh(student)
    student = await db.get(Student, student.id)
    return _serialize_student(student, role="admin")


@router.delete(
    "/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin)],
)
async def delete_student(student_id: int, db: AsyncSession = Depends(get_db)):
    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    await db.delete(student)
    await db.commit()
    return None


# ── Student notes ────────────────────────────────────────────────────────────


@router.get("/{student_id}/notes", response_model=NoteListResponse)
async def list_notes(
    student_id: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    rows = (
        await db.execute(
            select(StudentNote)
            .where(StudentNote.student_id == student_id)
            .order_by(StudentNote.created_at.desc())
        )
    ).scalars().all()
    return NoteListResponse(items=list(rows))


@router.post(
    "/{student_id}/notes",
    response_model=NoteRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin)],
)
async def create_note(
    student_id: int,
    data: NoteCreate,
    db: AsyncSession = Depends(get_db),
):
    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    note = StudentNote(student_id=student_id, text=data.text)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.delete(
    "/{student_id}/notes/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin)],
)
async def delete_note(
    student_id: int,
    note_id: int,
    db: AsyncSession = Depends(get_db),
):
    note = await db.get(StudentNote, note_id)
    if not note or note.student_id != student_id:
        raise HTTPException(status_code=404, detail="Примечание не найдено")
    await db.delete(note)
    await db.commit()
    return None


# ── Transfer endpoints ────────────────────────────────────────────────────────


@router.get(
    "/{student_id}/transfer/preview",
    response_model=StudentTransferPreview,
    dependencies=[Depends(get_current_admin)],
)
async def transfer_preview(
    student_id: int,
    to_group_id: int = Query(...),
    transfer_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Read-only: compute debt snapshot + capacity check for the UI dialog."""
    from app.services.transfer_service import preview_transfer

    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    return await preview_transfer(
        db,
        student=student,
        to_group_id=to_group_id,
        transfer_date=transfer_date,
    )


@router.post(
    "/{student_id}/transfer",
    response_model=StudentTransferResult,
    status_code=status.HTTP_200_OK,
)
async def do_transfer(
    student_id: int,
    data: StudentTransferRequest,
    db: AsyncSession = Depends(get_db),
    actor: AuthUser = Depends(get_current_admin),
):
    """Execute student transfer atomically. Admin only."""
    from app.services.transfer_service import transfer_student

    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    return await transfer_student(
        db,
        student=student,
        to_group_id=data.to_group_id,
        transfer_date=data.transfer_date,
        debt_policy=data.debt_policy,
        reason=data.reason,
        force=data.force,
        actor=actor,
    )


@router.get(
    "/{student_id}/transfers",
    response_model=list[StudentTransferRead],
    dependencies=[Depends(get_current_admin)],
)
async def list_student_transfers(
    student_id: int,
    db: AsyncSession = Depends(get_db),
):
    """History of all group transfers for this student."""
    from app.services.transfer_service import list_transfers

    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    rows = await list_transfers(db, student_id=student_id)

    def _make_group_snap(group) -> GroupSnapshot | None:
        if group is None:
            return None
        return GroupSnapshot(id=group.id, name=group.code)

    result = []
    for r in rows:
        result.append(
            StudentTransferRead(
                id=r.id,
                student_id=r.student_id,
                from_group=_make_group_snap(r.from_group),
                to_group=_make_group_snap(r.to_group),
                transfer_date=r.transfer_date,
                prev_debt=r.prev_debt,
                debt_action=r.debt_action,
                adjustment_payment_id=r.adjustment_payment_id,
                reason=r.reason,
                performed_by_subject=r.performed_by_subject,
                performed_by_role=r.performed_by_role,
                created_at=r.created_at,
            )
        )
    return result
