from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Date, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.group import Group


class Student(Base, TimestampMixin):
    __tablename__ = "students"
    __table_args__ = (
        # Phone is also the cabinet login. Partial unique so multiple students
        # without a phone are still allowed.
        Index(
            "ix_students_phone_unique",
            "phone",
            unique=True,
            postgresql_where=text("phone IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # "male" | "female" | None
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    parent_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # "instagram" | "telegram" | "recommended" | None
    source: Mapped[str | None] = mapped_column(String(30), nullable=True)

    group_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Cabinet credentials. Login is the phone (above). password_hash is set
    # by admin via POST/PATCH /students with `password=...`.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # "paid" | "debt" — derived from finance_service after each payment write,
    # but also editable by admin for backwards compatibility. Strict dichotomy:
    # either the student is fully paid up, or they owe money.
    payment_status: Mapped[str] = mapped_column(String(20), nullable=False, default="paid")

    # Free-form internal note used by the Debtors page (e.g. "promised to pay
    # by Friday"). Persisted between sessions; only admin sees this.
    finance_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # ── Relationships ──────────────────────────────────────────────────
    group: Mapped[Optional["Group"]] = relationship("Group", lazy="selectin")

    # ── Computed ───────────────────────────────────────────────────────
    @property
    def group_code(self) -> Optional[str]:
        return self.group.code if self.group else None

    @property
    def course_name(self) -> Optional[str]:
        return self.group.course_name if self.group else None
