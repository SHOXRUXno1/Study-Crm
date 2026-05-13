from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Manager(Base, TimestampMixin):
    __tablename__ = "managers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    middle_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    username: Mapped[str] = mapped_column(
        String(40), unique=True, nullable=False, index=True
    )
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_base64: Mapped[str | None] = mapped_column(Text, nullable=True)
