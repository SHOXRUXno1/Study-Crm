from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

Gender = Literal["male", "female"]
PaymentStatus = Literal["paid", "debt"]


# ── Helpers ──────────────────────────────────────────────────────────────────

_PHONE_ALLOWED = re.compile(r"[^0-9+]")
_PHONE_DIGITS_RE = re.compile(r"\d")


def normalise_phone(value: str | None) -> str | None:
    """Normalise an incoming phone for storage: keep only digits and a single
    leading ``+``. Returns ``None`` for empty input.
    """
    if value is None:
        return None
    cleaned = _PHONE_ALLOWED.sub("", value).strip()
    if not cleaned:
        return None
    # Keep only the first '+' (if present at the start).
    if cleaned.startswith("+"):
        cleaned = "+" + cleaned[1:].replace("+", "")
    else:
        cleaned = cleaned.replace("+", "")
    if not _PHONE_DIGITS_RE.search(cleaned):
        return None
    return cleaned


def _validate_phone(value: str | None) -> str | None:
    cleaned = normalise_phone(value)
    if cleaned is None:
        return None
    digits = re.sub(r"\D", "", cleaned)
    if len(digits) < 9:
        raise ValueError("Phone must contain at least 9 digits")
    if len(cleaned) > 32:
        raise ValueError("Phone too long")
    return cleaned


# ── Student schemas ──────────────────────────────────────────────────────────


class StudentCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    gender: Gender | None = None
    birth_date: date | None = None
    phone: str | None = Field(None, max_length=32)
    parent_phone: str | None = Field(None, max_length=32)
    source: str | None = Field(None, max_length=30)
    group_id: int | None = None
    payment_status: PaymentStatus = "paid"
    is_active: bool = True
    # Cabinet password (optional). When set, phone is required as login.
    password: str | None = Field(None, min_length=6, max_length=255)

    @field_validator("phone", "parent_phone")
    @classmethod
    def _normalise_phones(cls, v: str | None) -> str | None:
        return _validate_phone(v)


class StudentUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=255)
    gender: Gender | None = None
    birth_date: date | None = None
    phone: str | None = Field(None, max_length=32)
    parent_phone: str | None = Field(None, max_length=32)
    source: str | None = Field(None, max_length=30)
    group_id: int | None = None
    payment_status: PaymentStatus | None = None
    finance_note: str | None = Field(None, max_length=2000)
    is_active: bool | None = None
    # Cabinet password (optional). Send to set/reset.
    password: str | None = Field(None, min_length=6, max_length=255)

    @field_validator("phone", "parent_phone")
    @classmethod
    def _normalise_phones(cls, v: str | None) -> str | None:
        return _validate_phone(v)


class StudentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    gender: str | None
    birth_date: date | None
    phone: str | None
    parent_phone: str | None
    source: str | None = None
    group_id: Optional[int]
    payment_status: str
    finance_note: Optional[str] = None
    is_active: bool
    # Computed
    group_code: Optional[str]
    course_name: Optional[str]
    has_credentials: bool = False
    created_at: datetime
    updated_at: datetime


class StudentListResponse(BaseModel):
    items: list[StudentRead]
    total: int
    skip: int
    limit: int


# ── Note schemas ─────────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class NoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    text: str
    created_at: datetime


class NoteListResponse(BaseModel):
    items: list[NoteRead]


# ── Self-profile (student cabinet) ───────────────────────────────────────────


class StudentSelfProfile(BaseModel):
    """Profile returned to the student themselves — only their own data."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    phone: str | None
    parent_phone: str | None
    gender: str | None
    birth_date: date | None
    source: str | None = None
    group_id: int | None
    group_code: str | None
    course_name: str | None
    payment_status: str
    is_active: bool
    created_at: datetime
