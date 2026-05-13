from __future__ import annotations

from datetime import datetime, time, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator


# ── kinds + severities ──────────────────────────────────────────────────────

NotificationKind = Literal[
    # Episodic (emitter-driven)
    "payment_received",
    "lesson_cancelled",
    "schedule_changed",
    "schedule_conflict",
    "new_student",
    "course_enrollment",
    "attendance_changed",
    "student_transferred",
    # Derived (scanner-driven, dedup-keyed)
    "debtor_overdue",
    "group_ending",
    "low_fill",
    "unpaid_advance",
    "low_attendance",
    "open_conflicts",
]

NotificationSeverity = Literal["info", "success", "warning", "critical"]

ALL_KINDS: tuple[str, ...] = (
    "payment_received",
    "lesson_cancelled",
    "schedule_changed",
    "schedule_conflict",
    "new_student",
    "course_enrollment",
    "attendance_changed",
    "student_transferred",
    "debtor_overdue",
    "group_ending",
    "low_fill",
    "unpaid_advance",
    "low_attendance",
    "open_conflicts",
)


# ── notification rows ───────────────────────────────────────────────────────


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: NotificationKind
    severity: NotificationSeverity
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    payload: Optional[dict[str, Any]] = None
    read_at: Optional[datetime] = None
    created_at: datetime

    @staticmethod
    def _to_utc_iso(value: Optional[datetime]) -> Optional[str]:
        if value is None:
            return None
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    @field_serializer("read_at", when_used="json")
    def _serialize_read_at(self, value: Optional[datetime]) -> Optional[str]:
        return self._to_utc_iso(value)

    @field_serializer("created_at", when_used="json")
    def _serialize_created_at(self, value: datetime) -> str:
        serialized = self._to_utc_iso(value)
        return serialized if serialized is not None else ""


class NotificationListResponse(BaseModel):
    items: list[NotificationRead]
    total: int
    unread: int


class UnreadCount(BaseModel):
    unread: int


class MarkReadResponse(BaseModel):
    updated: int


# ── preferences ─────────────────────────────────────────────────────────────


class ChannelPrefs(BaseModel):
    in_app: bool = True
    push: bool = False
    telegram: bool = False


class QuietHours(BaseModel):
    enabled: bool = False
    start: time = time(22, 0)
    end: time = time(7, 0)


def _default_kinds() -> dict[str, ChannelPrefs]:
    return {kind: ChannelPrefs() for kind in ALL_KINDS}


class NotificationPreferencesRead(BaseModel):
    """Full preferences blob returned to the client.

    Always echoes a complete shape — missing kinds get a default
    (in_app=True, push=False, telegram=False) so the UI never has to
    cope with sparse data.
    """

    kinds: dict[str, ChannelPrefs] = Field(default_factory=_default_kinds)
    quiet_hours: QuietHours = Field(default_factory=QuietHours)
    telegram_username: Optional[str] = None

    @field_validator("kinds", mode="after")
    @classmethod
    def _ensure_all_kinds(cls, v: dict[str, ChannelPrefs]) -> dict[str, ChannelPrefs]:
        out = dict(v)
        for k in ALL_KINDS:
            out.setdefault(k, ChannelPrefs())
        return out


class NotificationPreferencesUpdate(BaseModel):
    """Partial update — any subset of fields may be omitted."""

    kinds: Optional[dict[str, ChannelPrefs]] = None
    quiet_hours: Optional[QuietHours] = None
    telegram_username: Optional[str] = Field(None, max_length=64)
