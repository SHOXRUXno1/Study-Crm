from __future__ import annotations

from datetime import date as date_t
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.group import Group
    from app.models.payment import Payment
    from app.models.student import Student


class StudentTransfer(Base, TimestampMixin):
    """Immutable audit record for each group-change operation.

    ``debt_action`` is one of:
    - ``"writeoff"``  — an adjustment Payment was created to zero the debt
    - ``"snapshot"``  — debt was noted but NOT cleared; billing continues
    - ``"none"``      — no debt existed at transfer time
    """

    __tablename__ = "student_transfers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_group_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL"), nullable=True
    )
    to_group_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL"), nullable=True
    )

    transfer_date: Mapped[date_t] = mapped_column(Date, nullable=False)

    # Debt snapshot at the moment of transfer (integer UZS).
    prev_debt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # "writeoff" | "snapshot" | "none"
    debt_action: Mapped[str] = mapped_column(String(16), nullable=False)

    # Points to the adjustment Payment row when debt_action == "writeoff".
    adjustment_payment_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("payments.id", ondelete="SET NULL"), nullable=True
    )

    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Who performed the transfer (admin login or teacher username).
    performed_by_subject: Mapped[str] = mapped_column(String(64), nullable=False)
    performed_by_role: Mapped[str] = mapped_column(String(16), nullable=False)

    # ── Relationships ────────────────────────────────────────────────────────
    student: Mapped["Student"] = relationship("Student", lazy="selectin")
    from_group: Mapped[Optional["Group"]] = relationship(
        "Group", foreign_keys=[from_group_id], lazy="selectin"
    )
    to_group: Mapped[Optional["Group"]] = relationship(
        "Group", foreign_keys=[to_group_id], lazy="selectin"
    )
    adjustment_payment: Mapped[Optional["Payment"]] = relationship(
        "Payment", foreign_keys=[adjustment_payment_id], lazy="selectin"
    )
