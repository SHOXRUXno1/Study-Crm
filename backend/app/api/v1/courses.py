from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.models.course import Course
from app.schemas.auth import AuthUser
from app.schemas.course import (
    CourseCreate,
    CourseListResponse,
    CourseRead,
    CourseUpdate,
)

router = APIRouter(
    prefix="/courses",
    tags=["courses"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=CourseListResponse)
async def list_courses(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
    is_active: bool | None = Query(None),
    search: str | None = Query(None, description="Поиск по name"),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if user.role == "student":
        raise HTTPException(status_code=403, detail="Forbidden")

    stmt = select(Course)
    count_stmt = select(func.count()).select_from(Course)

    if is_active is not None:
        stmt = stmt.where(Course.is_active == is_active)
        count_stmt = count_stmt.where(Course.is_active == is_active)

    if search:
        like = f"%{search}%"
        stmt = stmt.where(Course.name.ilike(like))
        count_stmt = count_stmt.where(Course.name.ilike(like))

    stmt = stmt.order_by(Course.created_at.desc()).offset(skip).limit(limit)
    items = (await db.execute(stmt)).scalars().all()
    total = (await db.execute(count_stmt)).scalar_one()

    return CourseListResponse(items=list(items), total=total, skip=skip, limit=limit)


@router.post(
    "",
    response_model=CourseRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin)],
)
async def create_course(
    data: CourseCreate,
    db: AsyncSession = Depends(get_db),
):
    exists = await db.execute(
        select(Course).where(func.lower(Course.name) == data.name.strip().lower())
    )
    if exists.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Курс с таким названием уже существует",
        )

    course = Course(
        name=data.name.strip(),
        description=data.description,
        is_active=data.is_active,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return course


@router.get("/{course_id}", response_model=CourseRead)
async def get_course(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if user.role == "student":
        raise HTTPException(status_code=403, detail="Forbidden")
    course = await db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    return course


@router.patch(
    "/{course_id}",
    response_model=CourseRead,
    dependencies=[Depends(get_current_admin)],
)
async def update_course(
    course_id: int,
    data: CourseUpdate,
    db: AsyncSession = Depends(get_db),
):
    course = await db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")

    update_data = data.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"]:
        new_name = update_data["name"].strip()
        dup = await db.execute(
            select(Course).where(
                func.lower(Course.name) == new_name.lower(),
                Course.id != course_id,
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="Курс с таким названием уже существует",
            )
        update_data["name"] = new_name

    for field, value in update_data.items():
        setattr(course, field, value)

    await db.commit()
    await db.refresh(course)
    return course


@router.delete(
    "/{course_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin)],
)
async def delete_course(course_id: int, db: AsyncSession = Depends(get_db)):
    """Hard delete — запись физически удаляется из БД."""
    course = await db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    await db.delete(course)
    await db.commit()
    return None
