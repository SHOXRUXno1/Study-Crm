from datetime import date, datetime
from decimal import Decimal
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator

GenderValue = Literal["male", "female"] | None


USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,30}$")


# ── Salary field constraints ─────────────────────────────────────────────────
# Money columns use Integer UZS (consistent with payments.amount).
# salary_percent is Decimal because it's a percentage, not a sum.
SALARY_MONTHLY_FIELD = Field(0, ge=0, description="Фикс-оклад в месяц, UZS")
SALARY_PER_LESSON_FIELD = Field(0, ge=0, description="Ставка за проведённый урок, UZS")
SALARY_PER_STUDENT_FIELD = Field(0, ge=0, description="Ставка за активного ученика, UZS")
SALARY_PERCENT_FIELD = Field(
    Decimal("0"),
    ge=Decimal("0"),
    le=Decimal("100"),
    description="% от выручки группы (0..100, поддерживает дробные)",
)


def _normalize_username(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip().lower()
    if v == "":
        return None
    if not USERNAME_RE.match(v):
        raise ValueError(
            "username должен содержать 3-30 символов латиницы, цифр, ._- "
        )
    return v


class TeacherCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=80)
    last_name: str = Field(..., min_length=1, max_length=80)
    middle_name: str | None = Field(None, max_length=80)
    phone: str | None = Field(None, max_length=32)
    is_active: bool = True

    position: str = Field("teacher", max_length=40)

    birth_date: date | None = None
    hire_date: date | None = None
    gender: GenderValue = None

    # Optional account credentials
    username: str | None = Field(None, max_length=40)
    password: str | None = Field(None, min_length=6, max_length=128)

    # Salary rates (all default to 0 → component disabled)
    salary_monthly: int = SALARY_MONTHLY_FIELD
    salary_percent: Decimal = SALARY_PERCENT_FIELD
    salary_per_lesson: int = SALARY_PER_LESSON_FIELD
    salary_per_student: int = SALARY_PER_STUDENT_FIELD

    @model_validator(mode="after")
    def _check_credentials(self) -> "TeacherCreate":
        self.username = _normalize_username(self.username)
        if self.username and not self.password:
            raise ValueError("Если задан username, нужен и password")
        if self.password and not self.username:
            raise ValueError("Если задан password, нужен и username")
        return self


class TeacherUpdate(BaseModel):
    first_name: str | None = Field(None, min_length=1, max_length=80)
    last_name: str | None = Field(None, min_length=1, max_length=80)
    middle_name: str | None = Field(None, max_length=80)
    phone: str | None = Field(None, max_length=32)
    is_active: bool | None = None

    position: str | None = Field(None, max_length=40)

    birth_date: date | None = None
    hire_date: date | None = None
    gender: GenderValue = None

    # Optional account credentials (PATCH semantics)
    username: str | None = Field(None, max_length=40)
    password: str | None = Field(None, min_length=6, max_length=128)

    # Salary rates (PATCH semantics — only updated when explicitly sent)
    salary_monthly: int | None = Field(None, ge=0)
    salary_percent: Decimal | None = Field(None, ge=Decimal("0"), le=Decimal("100"))
    salary_per_lesson: int | None = Field(None, ge=0)
    salary_per_student: int | None = Field(None, ge=0)

    @model_validator(mode="after")
    def _normalize(self) -> "TeacherUpdate":
        if "username" in self.model_fields_set:
            self.username = _normalize_username(self.username)
        return self


class TeacherRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str
    middle_name: str | None
    phone: str | None
    is_active: bool
    position: str = "teacher"
    username: str | None
    has_account: bool = False
    avatar_base64: str | None = None

    birth_date: date | None = None
    hire_date: date | None = None
    gender: str | None = None

    salary_monthly: int = 0
    salary_percent: Decimal = Decimal("0")
    salary_per_lesson: int = 0
    salary_per_student: int = 0

    created_at: datetime
    updated_at: datetime

    # Serialise Decimal as JSON number (float) for the frontend, otherwise
    # Pydantic v2 emits a string and the form would have to parse it.
    @field_serializer("salary_percent")
    def _ser_salary_percent(self, value: Decimal) -> float:
        return float(value)

    @model_validator(mode="before")
    @classmethod
    def _derive_has_account(cls, data):
        # Allow building from ORM Teacher object: derive `has_account` from password_hash
        if hasattr(data, "password_hash"):
            obj_dict = {
                "id": data.id,
                "first_name": data.first_name,
                "last_name": data.last_name,
                "middle_name": data.middle_name,
                "phone": data.phone,
                "is_active": data.is_active,
                "position": getattr(data, "position", "teacher") or "teacher",
                "username": data.username,
                "has_account": bool(data.password_hash),
                "avatar_base64": data.avatar_base64,
                "birth_date": data.birth_date,
                "hire_date": data.hire_date,
                "gender": data.gender,
                "salary_monthly": data.salary_monthly,
                "salary_percent": data.salary_percent,
                "salary_per_lesson": data.salary_per_lesson,
                "salary_per_student": data.salary_per_student,
                "created_at": data.created_at,
                "updated_at": data.updated_at,
            }
            return obj_dict
        return data


class TeacherListResponse(BaseModel):
    items: list[TeacherRead]
    total: int
    skip: int
    limit: int


# ── Salary breakdown ─────────────────────────────────────────────────────────


class SalaryBreakdownRead(BaseModel):
    """Computed salary breakdown for a teacher in a given period."""

    model_config = ConfigDict(from_attributes=True)

    teacher_id: int
    teacher_name: str
    period_from: date
    period_to: date

    # Source measurements (used as multipliers)
    revenue: int = Field(..., ge=0, description="Сумма платежей учеников групп препода за период (UZS)")
    lessons_count: int = Field(..., ge=0, description="Количество проведённых уроков за период")
    students_count: int = Field(..., ge=0, description="Активные ученики групп препода (snapshot на момент вызова)")

    # Echo of the rates used (so the client can render the formula)
    rate_monthly: int = Field(..., ge=0)
    rate_percent: Decimal = Field(..., ge=Decimal("0"), le=Decimal("100"))
    rate_per_lesson: int = Field(..., ge=0)
    rate_per_student: int = Field(..., ge=0)

    # Per-component results (already multiplied)
    monthly_amount: int = Field(..., ge=0)
    percent_amount: int = Field(..., ge=0)
    lessons_amount: int = Field(..., ge=0)
    students_amount: int = Field(..., ge=0)

    total: int = Field(..., ge=0, description="Сумма всех 4 компонентов (UZS)")

    @field_serializer("rate_percent")
    def _ser_rate_percent(self, value: Decimal) -> float:
        return float(value)


class SalaryListResponse(BaseModel):
    period_from: date
    period_to: date
    items: list[SalaryBreakdownRead]
    total_payroll: int = Field(..., ge=0, description="Сумма total по всем преподам — ФОТ за период")


class TeacherChangePasswordRequest(BaseModel):
    """Used by teacher to change own password."""

    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)
