from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Notification(Base):
    """A single inbox-style notification addressed to one principal.

    The same logical event (e.g. a payment) may produce multiple rows here —
    one per recipient (admin, group's teacher, …). This denormalisation
    keeps the read path trivial: `WHERE recipient_subject=? AND recipient_role=?`.
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    recipient_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    recipient_role: Mapped[str] = mapped_column(String(20), nullable=False)
    kind: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    payload: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    dedup_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index(
            "ix_notifications_recipient_unread",
            "recipient_subject",
            "recipient_role",
            "read_at",
            "created_at",
        ),
        Index(
            "uq_notifications_dedup",
            "recipient_subject",
            "recipient_role",
            "dedup_key",
            unique=True,
            postgresql_where="dedup_key IS NOT NULL",
        ),
    )
