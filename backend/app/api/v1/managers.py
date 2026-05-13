from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
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
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    res = await db.execute(select(Manager).order_by(Manager.last_name, Manager.first_name))
    items = res.scalars().all()
    count_res = await db.execute(select(func.count()).select_from(Manager))
    total = count_res.scalar_one()
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
