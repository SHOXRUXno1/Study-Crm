from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Session(Base, TimestampMixin):
    """JWT сессии. Используется для stateful auth (admin или teacher)."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    jti: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    # Владелец сессии (для изоляции admin/teacher)
    subject: Mapped[str] = mapped_column(String(80), nullable=False, index=True, server_default="admin")
    role:    Mapped[str] = mapped_column(String(16), nullable=False, server_default="admin")

    # Инфо о клиенте
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    # Парсинг User-Agent
    device_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    os_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    browser_name: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Геолокация по IP
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    country: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Активность
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
