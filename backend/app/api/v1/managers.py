from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.core.security import hash_password
from app.models.manager import Manager
from app.schemas.auth import AuthUser
from app.schemas.manager import ManagerCreate, ManagerListResponse, ManagerRead, ManagerUpdate

router = APIRouter(prefix="/managers", tags=["managers"])


@router.get("", response_model=ManagerListResponse)
async def list_managers(
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=2000),
    is_active: bool | None = Query(None),
    search: str | None = Query(None, description="Поиск по ФИО или телефону"),
    sort: str = Query("newest", description="newest | oldest | az | za"),
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    stmt = select(Manager)
    count_stmt = select(func.count()).select_from(Manager)

    if is_active is not None:
        stmt = stmt.where(Manager.is_active == is_active)
        count_stmt = count_stmt.where(Manager.is_active == is_active)

    if search:
        like = f"%{search}%"
        cond = or_(
            Manager.first_name.ilike(like),
            Manager.last_name.ilike(like),
            Manager.middle_name.ilike(like),
            Manager.phone.ilike(like),
            Manager.username.ilike(like),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    if sort == "az":
        stmt = stmt.order_by(Manager.last_name.asc(), Manager.first_name.asc())
    elif sort == "za":
        stmt = stmt.order_by(Manager.last_name.desc(), Manager.first_name.desc())
    elif sort == "oldest":
        stmt = stmt.order_by(Manager.created_at.asc())
    else:
        stmt = stmt.order_by(Manager.created_at.desc())

    stmt = stmt.offset(skip).limit(limit)
    items = (await db.execute(stmt)).scalars().all()
    total = (await db.execute(count_stmt)).scalar_one()
    return ManagerListResponse(items=list(items), total=total)


@router.post("", response_model=ManagerRead, status_code=status.HTTP_201_CREATED)
async def create_manager(
    data: ManagerCreate,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    existing = await db.execute(select(Manager).where(Manager.username == data.username.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="username_taken")
    manager = Manager(
        first_name=data.first_name,
        last_name=data.last_name,
        middle_name=data.middle_name,
        phone=data.phone,
        username=data.username.lower(),
        password_hash=hash_password(data.password),
        is_active=data.is_active,
        position=data.position or "manager",
        birth_date=data.birth_date,
        hire_date=data.hire_date,
        gender=data.gender,
    )
    db.add(manager)
    await db.commit()
    await db.refresh(manager)
    return manager


@router.get("/{manager_id}", response_model=ManagerRead)
async def get_manager(
    manager_id: int,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    manager = await db.get(Manager, manager_id)
    if not manager:
        raise HTTPException(status_code=404, detail="not_found")
    return manager


@router.patch("/{manager_id}", response_model=ManagerRead)
async def update_manager(
    manager_id: int,
    data: ManagerUpdate,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    manager = await db.get(Manager, manager_id)
    if not manager:
        raise HTTPException(status_code=404, detail="not_found")

    if data.username is not None:
        new_username = data.username.lower()
        if new_username != manager.username:
            existing = await db.execute(
                select(Manager).where(Manager.username == new_username)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="username_taken")
        manager.username = new_username

    if data.first_name is not None:
        manager.first_name = data.first_name
    if data.last_name is not None:
        manager.last_name = data.last_name
    if "middle_name" in data.model_fields_set:
        manager.middle_name = data.middle_name
    if "phone" in data.model_fields_set:
        manager.phone = data.phone
    if data.is_active is not None:
        manager.is_active = data.is_active
    if data.password is not None:
        manager.password_hash = hash_password(data.password)
    if data.position is not None:
        manager.position = data.position
    if "birth_date" in data.model_fields_set:
        manager.birth_date = data.birth_date
    if "hire_date" in data.model_fields_set:
        manager.hire_date = data.hire_date
    if "gender" in data.model_fields_set:
        manager.gender = data.gender

    await db.commit()
    await db.refresh(manager)
    return manager


@router.delete("/{manager_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_manager(
    manager_id: int,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    manager = await db.get(Manager, manager_id)
    if not manager:
        raise HTTPException(status_code=404, detail="not_found")
    await db.delete(manager)
    await db.commit()
