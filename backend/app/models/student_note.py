from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.student import Student


class StudentNote(Base, TimestampMixin):
    __tablename__ = "student_notes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)

    student: Mapped["Student"] = relationship("Student", lazy="selectin")
