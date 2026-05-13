from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AdminSettings(Base, TimestampMixin):
    """Единственная запись (id=1) с настройками администратора."""

    __tablename__ = "admin_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    first_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    middle_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    avatar_base64: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
