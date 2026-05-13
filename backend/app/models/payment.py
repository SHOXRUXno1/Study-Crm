from __future__ import annotations

from datetime import date as date_t
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.payment_receipt import PaymentReceipt
    from app.models.student import Student


class Payment(Base, TimestampMixin):
    """A single tuition payment for a student.

    Money is stored as integer UZS — no fractional currency. Method is one of
    ``cash | transfer``. Obligations (monthly bills) are not stored —
    they are derived on the fly from the student's group ``price`` and group's
    lifecycle (see :mod:`app.services.finance_service`).
    """

    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_student_paid_at", "student_id", "paid_at"),
        Index("ix_payments_paid_at", "paid_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Amount in UZS, must be > 0. We don't enforce a CHECK at DB level for
    # forward compatibility with refund flows, but the service / schema do.
    amount: Mapped[int] = mapped_column(Integer, nullable=False)

    # cash | transfer
    method: Mapped[str] = mapped_column(String(16), nullable=False, default="cash")

    paid_at: Mapped[date_t] = mapped_column(Date, nullable=False)

    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Relationships ───────────────────────────────────────────────────
    student: Mapped["Student"] = relationship("Student", lazy="selectin")
    receipts: Mapped[list["PaymentReceipt"]] = relationship(
        "PaymentReceipt",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="PaymentReceipt.id",
    )
