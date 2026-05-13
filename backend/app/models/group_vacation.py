from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.group import Group


class GroupVacation(Base, TimestampMixin):
    __tablename__ = "group_vacations"
    __table_args__ = (
        UniqueConstraint("group_id", "vacation_date", name="uq_group_vacation_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vacation_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    group: Mapped["Group"] = relationship("Group", lazy="selectin")
