from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

GroupStatus = Literal["active", "completed"]
DaysType = Literal["odd", "even"]


class GroupCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    course_id: Optional[int] = None
    teacher_id: Optional[int] = None
    room_id: Optional[int] = None
    days: DaysType = "odd"
    start_time: time
    end_time: time
    max_students: int = Field(15, ge=1)
    price: int = Field(0, ge=0)
    duration_months: int = Field(3, ge=1)
    start_date: date
    end_date: date
    status: GroupStatus = "active"

    @model_validator(mode="after")
    def _check_times(self) -> "GroupCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be greater than start_time")
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class GroupUpdate(BaseModel):
    code: Optional[str] = Field(None, min_length=1, max_length=50)
    course_id: Optional[int] = None
    teacher_id: Optional[int] = None
    room_id: Optional[int] = None
    days: Optional[DaysType] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    max_students: Optional[int] = Field(None, ge=1)
    student_count: Optional[int] = Field(None, ge=0)
    price: Optional[int] = Field(None, ge=0)
    duration_months: Optional[int] = Field(None, ge=1)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[GroupStatus] = None


class GroupRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    code: str
    course_id: Optional[int]
    teacher_id: Optional[int]
    room_id: Optional[int]
    days: str
    start_time: time
    end_time: time
    time_slot: str  # derived from start_time/end_time on the model
    max_students: int
    student_count: int
    price: int
    duration_months: int
    start_date: date
    end_date: date
    status: str
    course_name: Optional[str]
    teacher_name: Optional[str]
    room_name: Optional[str]
    created_at: datetime
    updated_at: datetime


class GroupListResponse(BaseModel):
    items: list[GroupRead]
    total: int
    skip: int
    limit: int


# ── Vacation schemas ─────────────────────────────────────────────────────────

class VacationCreate(BaseModel):
    vacation_date: date
    note: Optional[str] = Field(None, max_length=255)


class VacationRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    group_id: int
    vacation_date: date
    note: Optional[str]
    created_at: datetime


class VacationListResponse(BaseModel):
    items: list[VacationRead]


# ── Conflict schemas ─────────────────────────────────────────────────────────

ConflictKind = Literal["teacher", "room"]


class ConflictHit(BaseModel):
    """One reason a proposed schedule clashes with an existing group.

    A single peer group can appear twice (once as ``teacher`` and once as
    ``room``) when both resources collide — the UI surfaces both reasons.
    """

    kind: ConflictKind
    group_id: int
    group_code: str
    teacher_name: Optional[str]
    room_name: Optional[str]
    days: str
    start_time: time
    end_time: time
    start_date: date
    end_date: date
    overlap_start: date
    overlap_end: date


class ConflictCheck(BaseModel):
    """Read-only payload for the live conflict preview endpoint."""

    days: DaysType
    start_time: time
    end_time: time
    start_date: date
    end_date: date
    teacher_id: Optional[int] = None
    room_id: Optional[int] = None
    exclude_group_id: Optional[int] = None

    @model_validator(mode="after")
    def _check_window(self) -> "ConflictCheck":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be greater than start_time")
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class ConflictCheckResponse(BaseModel):
    conflicts: list[ConflictHit]
