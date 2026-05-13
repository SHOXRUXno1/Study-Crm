from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_admin_or_manager, get_current_user
from app.core.security import hash_password
from app.models.teacher import Teacher
from app.schemas.auth import AuthUser
from app.schemas.teacher import (
    SalaryBreakdownRead,
    SalaryListResponse,
    TeacherCreate,
    TeacherListResponse,
    TeacherRead,
    TeacherUpdate,
)
from app.services.salary_service import compute_all_salaries, compute_teacher_salary

router = APIRouter(prefix="/teachers", tags=["teachers"])


# ── Salary period helpers ───────────────────────────────────────────────────


def _default_month_range(today: date | None = None) -> tuple[date, date]:
    """Return ``(month_start, month_end)`` for ``today`` (default: today)."""
    today = today or date.today()
    start = date(today.year, today.month, 1)
    if today.month == 12:
        next_month = date(today.year + 1, 1, 1)
    else:
        next_month = date(today.year, today.month + 1, 1)
    end = next_month - timedelta(days=1)
    return start, end


def _resolve_period(
    period_from: date | None, period_to: date | None
) -> tuple[date, date]:
    """Validate or fall back to the current calendar month."""
    if period_from is None and period_to is None:
        return _default_month_range()
    if period_from is None or period_to is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нужно указать оба параметра: from и to",
        )
    if period_from > period_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="from не может быть позже to",
        )
    return period_from, period_to


async def _username_taken(
    db: AsyncSession, username: str, exclude_id: int | None = None
) -> bool:
    stmt = select(Teacher.id).where(Teacher.username == username)
    if exclude_id is not None:
        stmt = stmt.where(Teacher.id != exclude_id)
    res = await db.execute(stmt)
    return res.scalar_one_or_none() is not None


@router.get(
    "",
    response_model=TeacherListResponse,
    dependencies=[Depends(get_current_admin_or_manager)],
)
async def list_teachers(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: bool | None = Query(None),
    search: str | None = Query(None, description="Поиск по ФИО или телефону"),
    sort: str = Query("newest", description="newest | oldest | az | za"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Teacher)
    count_stmt = select(func.count()).select_from(Teacher)

    if is_active is not None:
        stmt = stmt.where(Teacher.is_active == is_active)
        count_stmt = count_stmt.where(Teacher.is_active == is_active)

    if search:
        like = f"%{search}%"
        cond = or_(
            Teacher.first_name.ilike(like),
            Teacher.last_name.ilike(like),
            Teacher.middle_name.ilike(like),
            Teacher.phone.ilike(like),
            Teacher.username.ilike(like),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    if sort == "az":
        stmt = stmt.order_by(Teacher.last_name.asc(), Teacher.first_name.asc())
    elif sort == "za":
        stmt = stmt.order_by(Teacher.last_name.desc(), Teacher.first_name.desc())
    elif sort == "oldest":
        stmt = stmt.order_by(Teacher.created_at.asc())
    else:
        stmt = stmt.order_by(Teacher.created_at.desc())

    stmt = stmt.offset(skip).limit(limit)
    items = (await db.execute(stmt)).scalars().all()
    total = (await db.execute(count_stmt)).scalar_one()

    return TeacherListResponse(items=list(items), total=total, skip=skip, limit=limit)


# Registered BEFORE /{teacher_id} on purpose: FastAPI matches routes in the
# order they are declared, and "salaries" would otherwise be interpreted as
# a teacher_id and fail with 422 (int parsing).
@router.get(
    "/salaries",
    response_model=SalaryListResponse,
    dependencies=[Depends(get_current_admin)],
)
async def list_all_salaries(
    period_from: date | None = Query(None, alias="from"),
    period_to: date | None = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only payroll overview — breakdown for every active teacher.

    Defaults to the current calendar month when ``from``/``to`` are omitted.
    """
    pf, pt = _resolve_period(period_from, period_to)
    payload = await compute_all_salaries(db, pf, pt)
    items = [SalaryBreakdownRead.model_validate(b) for b in payload["items"]]
    return SalaryListResponse(
        period_from=pf,
        period_to=pt,
        items=items,
        total_payroll=payload["total_payroll"],
    )


@router.get("/{teacher_id}", response_model=TeacherRead)
async def get_teacher(
    teacher_id: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if user.role not in ("admin", "teacher", "manager"):
        raise HTTPException(status_code=403, detail="Forbidden")
    if user.role == "teacher" and user.id != teacher_id:
        raise HTTPException(status_code=404, detail="Преподаватель не найден")

    teacher = await db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Преподаватель не найден")
    return teacher


@router.get("/{teacher_id}/salary", response_model=SalaryBreakdownRead)
async def get_teacher_salary(
    teacher_id: int,
    period_from: date | None = Query(None, alias="from"),
    period_to: date | None = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    """Salary breakdown for a single teacher.

    Visible to admin (any teacher) and to the teacher themselves
    (``user.role == 'teacher'`` and ``user.id == teacher_id``).
    Managers and other roles are not allowed (financial data).
    """
    if user.role == "admin":
        pass
    elif user.role == "teacher":
        if user.id != teacher_id:
            raise HTTPException(status_code=404, detail="Преподаватель не найден")
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )

    teacher = await db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Преподаватель не найден")

    pf, pt = _resolve_period(period_from, period_to)
    breakdown = await compute_teacher_salary(db, teacher, pf, pt)
    return SalaryBreakdownRead.model_validate(breakdown)


@router.post(
    "",
    response_model=TeacherRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin)],
)
async def create_teacher(data: TeacherCreate, db: AsyncSession = Depends(get_db)):
    payload = data.model_dump()
    password_plain = payload.pop("password", None)

    if payload.get("username"):
        if await _username_taken(db, payload["username"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Логин уже занят",
            )

    teacher = Teacher(**payload)
    if password_plain:
        teacher.password_hash = hash_password(password_plain)

    db.add(teacher)
    await db.commit()
    await db.refresh(teacher)
    return teacher


@router.patch(
    "/{teacher_id}",
    response_model=TeacherRead,
    dependencies=[Depends(get_current_admin)],
)
async def update_teacher(
    teacher_id: int, data: TeacherUpdate, db: AsyncSession = Depends(get_db)
):
    teacher = await db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Преподаватель не найден")

    update_data = data.model_dump(exclude_unset=True)
    password_plain = update_data.pop("password", None)

    if "username" in update_data:
        new_username = update_data["username"]
        if new_username and await _username_taken(
            db, new_username, exclude_id=teacher_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Логин уже занят",
            )

    for field, value in update_data.items():
        setattr(teacher, field, value)

    if password_plain:
        teacher.password_hash = hash_password(password_plain)

    # If username is removed → wipe credentials so the teacher can no longer log in.
    if "username" in update_data and not update_data["username"]:
        teacher.password_hash = None

    await db.commit()
    await db.refresh(teacher)
    return teacher


@router.delete(
    "/{teacher_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin)],
)
async def delete_teacher(teacher_id: int, db: AsyncSession = Depends(get_db)):
    teacher = await db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Преподаватель не найден")
    await db.delete(teacher)
    await db.commit()
    return None
