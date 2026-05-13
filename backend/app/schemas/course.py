from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CourseBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str | None = None
    is_active: bool = True


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    description: str | None = None
    is_active: bool | None = None


class CourseRead(CourseBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class CourseListResponse(BaseModel):
    items: list[CourseRead]
    total: int
    skip: int
    limit: int
