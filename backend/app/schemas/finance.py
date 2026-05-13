"""Pydantic schemas for the finance module.

Two parallel concepts:

* **Payments** — actual money received (table ``payments``).
* **Billing**  — virtual obligations (months × group price) computed on the
  fly by :mod:`app.services.finance_service`. Never persisted.

The API mostly returns *combined* views: a student's billing (monthly amount,
total paid, debt) plus, optionally, a list of payments (ledger).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


PaymentMethod = Literal["cash", "transfer", "adjustment"]
PaymentMethodUser = Literal["cash", "transfer"]  # methods available via the UI
BillingStatus = Literal["paid", "debt"]
TrendDirection = Literal["up", "down", "stable"]


# ── Payments ────────────────────────────────────────────────────────────────
class PaymentCreate(BaseModel):
    student_id: int
    amount: int = Field(..., gt=0, le=10**12)
    method: PaymentMethodUser = "cash"
    paid_at: date
    note: Optional[str] = Field(None, max_length=2000)

    @field_validator("paid_at")
    @classmethod
    def _no_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("paid_at cannot be in the future")
        return v


class PaymentReceiptRead(BaseModel):
    id: int
    original_name: str
    mime_type: str
    size_bytes: int
    url: str
    created_at: datetime


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    amount: int
    method: str
    paid_at: date
    note: Optional[str] = None
    # Convenience: filled when serialised by the API for list views
    student_name: Optional[str] = None
    group_code: Optional[str] = None
    course_name: Optional[str] = None
    receipts: list[PaymentReceiptRead] = []

    created_at: datetime
    updated_at: datetime


class PaymentList(BaseModel):
    items: list[PaymentRead]
    total: int
    skip: int
    limit: int


# ── Summary / KPI ───────────────────────────────────────────────────────────
class MethodBreakdown(BaseModel):
    method: str
    count: int
    amount: int


class FinanceSummary(BaseModel):
    """Aggregates over a date range (``from`` / ``to`` are inclusive)."""

    period_from: date
    period_to: date

    payments_count: int
    payments_total: int
    by_method: list[MethodBreakdown]

    # Cross-period (current state, not bound to the range)
    debtors_count: int
    total_debt: int
    overdue_today: int  # debtors whose first unpaid month is today exactly


# ── Billing per student ─────────────────────────────────────────────────────
class StudentBilling(BaseModel):
    """Computed billing snapshot for one student at the moment of the call."""

    id: int
    full_name: str
    phone: Optional[str] = None
    parent_phone: Optional[str] = None
    group_id: Optional[int] = None
    group_code: Optional[str] = None
    course_name: Optional[str] = None

    monthly_amount: int  # group.price (0 if no group / no price)
    months_due: int       # how many monthly bills have been issued so far
    total_due: int        # months_due * monthly_amount
    total_paid: int       # sum of all payments
    debt_amount: int      # max(0, total_due - total_paid)
    credit_balance: int = 0   # max(0, total_paid - total_due)
    total_course_cost: int = 0
    max_deposit_amount: int = 0
    course_end_date: Optional[date] = None
    months_unpaid: int    # ceil(debt_amount / monthly_amount), 0 if no price
    overdue_days: int     # days since first unpaid month start (0 if no debt)

    last_payment_date: Optional[date] = None
    last_payment_amount: Optional[int] = None

    status: BillingStatus
    finance_note: Optional[str] = None


class StudentBillingList(BaseModel):
    items: list[StudentBilling]
    total: int
    skip: int
    limit: int


# ── Debtor row (extends StudentBilling with trend) ──────────────────────────
class DebtorRead(StudentBilling):
    trend: TrendDirection = "stable"


class DebtorList(BaseModel):
    items: list[DebtorRead]
    total: int
    skip: int
    limit: int


# ── Per-student ledger ──────────────────────────────────────────────────────
class StudentLedger(BaseModel):
    billing: StudentBilling
    payments: list[PaymentRead]


# ── Note update payload ─────────────────────────────────────────────────────
class FinanceNoteUpdate(BaseModel):
    note: Optional[str] = Field(None, max_length=2000)
