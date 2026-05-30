from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Teacher(Base, TimestampMixin):
    __tablename__ = "teachers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    middle_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Position — always "teacher" for this table, stored for unified UI
    position: Mapped[str] = mapped_column(
        String(40), nullable=False, default="teacher", server_default="teacher"
    )

    # Personal info
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    hire_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # "male" | "female" | NULL
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Account credentials (set by admin when creating a teacher)
    username: Mapped[str | None] = mapped_column(
        String(40), unique=True, nullable=True, index=True
    )
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Profile picture (data URL, base64) — editable by teacher itself
    avatar_base64: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Salary rates (4 independent components, see salary_service.py) ─────
    # All money columns are Integer UZS to stay consistent with payments.amount.
    # salary_percent is the only Numeric — it's a percentage, not a money sum.
    salary_monthly: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    salary_percent: Mapped[Decimal] = mapped_column(
        Numeric(precision=5, scale=2),
        nullable=False,
        default=Decimal("0"),
        server_default="0",
    )
    salary_per_lesson: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    salary_per_student: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
