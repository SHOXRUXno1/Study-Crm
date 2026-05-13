from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.models.room import Room
from app.schemas.auth import AuthUser
from app.schemas.room import RoomCreate, RoomListResponse, RoomRead, RoomUpdate

router = APIRouter(
    prefix="/rooms",
    tags=["rooms"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=RoomListResponse)
async def list_rooms(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if user.role == "student":
        raise HTTPException(status_code=403, detail="Forbidden")

    stmt = select(Room)
    count_stmt = select(func.count()).select_from(Room)

    if search:
        like = f"%{search}%"
        stmt = stmt.where(Room.name.ilike(like))
        count_stmt = count_stmt.where(Room.name.ilike(like))

    stmt = stmt.order_by(Room.created_at.asc()).offset(skip).limit(limit)
    items = (await db.execute(stmt)).scalars().all()
    total = (await db.execute(count_stmt)).scalar_one()

    return RoomListResponse(items=list(items), total=total, skip=skip, limit=limit)


@router.get("/{room_id}", response_model=RoomRead)
async def get_room(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if user.role == "student":
        raise HTTPException(status_code=403, detail="Forbidden")
    room = await db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    return room


@router.post(
    "",
    response_model=RoomRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_admin)],
)
async def create_room(data: RoomCreate, db: AsyncSession = Depends(get_db)):
    room = Room(**data.model_dump())
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return room


@router.patch(
    "/{room_id}",
    response_model=RoomRead,
    dependencies=[Depends(get_current_admin)],
)
async def update_room(room_id: int, data: RoomUpdate, db: AsyncSession = Depends(get_db)):
    room = await db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(room, field, value)

    await db.commit()
    await db.refresh(room)
    return room


@router.delete(
    "/{room_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_admin)],
)
async def delete_room(room_id: int, db: AsyncSession = Depends(get_db)):
    room = await db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    await db.delete(room)
    await db.commit()
    return None
