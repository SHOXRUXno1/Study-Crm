from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


DebtPolicy = Literal["writeoff", "snapshot"]


# ── Request / Preview ────────────────────────────────────────────────────────

class StudentTransferRequest(BaseModel):
    """Body sent by the admin to execute a transfer."""

    to_group_id: int
    transfer_date: date
    debt_policy: DebtPolicy = "writeoff"
    reason: Optional[str] = Field(None, max_length=500)
    force: bool = False


class StudentTransferPreview(BaseModel):
    """Read-only response for the preview endpoint (no DB writes)."""

    from_group_id: Optional[int]
    from_group_name: Optional[str]
    to_group_id: int
    to_group_name: str
    prev_debt: int
    capacity_current: int
    capacity_max: int
    capacity_exceeded: bool


# ── Result ───────────────────────────────────────────────────────────────────

class StudentTransferResult(BaseModel):
    """Response after a successful transfer."""

    transfer_id: int
    student_id: int
    from_group_id: Optional[int]
    to_group_id: int
    transfer_date: date
    prev_debt: int
    debt_action: str
    adjustment_payment_id: Optional[int]


# ── History read ─────────────────────────────────────────────────────────────

class GroupSnapshot(BaseModel):
    id: Optional[int]
    name: Optional[str]


class StudentTransferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    from_group: Optional[GroupSnapshot]
    to_group: Optional[GroupSnapshot]
    transfer_date: date
    prev_debt: int
    debt_action: str
    adjustment_payment_id: Optional[int]
    reason: Optional[str]
    performed_by_subject: str
    performed_by_role: str
    created_at: datetime
