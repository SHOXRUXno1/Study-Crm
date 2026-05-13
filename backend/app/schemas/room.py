from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RoomCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    capacity: int = Field(..., ge=1, le=1000)
    current_occupancy: int = Field(0, ge=0)
    status: str = Field("active", pattern="^(active|inactive)$")


class RoomUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    capacity: int | None = Field(None, ge=1, le=1000)
    current_occupancy: int | None = Field(None, ge=0)
    status: str | None = Field(None, pattern="^(active|inactive)$")


class RoomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    capacity: int
    current_occupancy: int
    status: str
    created_at: datetime
    updated_at: datetime


class RoomListResponse(BaseModel):
    items: list[RoomRead]
    total: int
    skip: int
    limit: int
