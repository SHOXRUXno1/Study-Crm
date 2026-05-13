from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.payment import Payment


class PaymentReceipt(Base):
    __tablename__ = "payment_receipts"
    __table_args__ = (
        Index("ix_payment_receipts_payment_id", "payment_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    payment_id: Mapped[int] = mapped_column(
        ForeignKey("payments.id", ondelete="CASCADE"),
        nullable=False,
    )
    original_name: Mapped[str] = mapped_column(Text, nullable=False)
    stored_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    mime_type: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )

    payment: Mapped["Payment"] = relationship("Payment", lazy="selectin")
