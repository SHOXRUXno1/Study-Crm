from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class NotificationPreference(Base):
    """Per-user (subject + role) notification preferences as a free-form JSONB.

    The shape is owned by the application layer (see ``schemas/notification.py``):

        {
          "kinds": { "<kind>": {"in_app": bool, "push": bool, "telegram": bool}, ... },
          "quiet_hours": {"enabled": bool, "start": "HH:MM", "end": "HH:MM"},
          "telegram_username": str | null
        }
    """

    __tablename__ = "notification_preferences"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    user_role: Mapped[str] = mapped_column(String(20), nullable=False)
    prefs: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_subject", "user_role", name="uq_notif_prefs_user"),
    )
