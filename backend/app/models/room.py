from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Room(Base, TimestampMixin):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_occupancy: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
