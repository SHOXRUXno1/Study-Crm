"""Finance service.

Encapsulates the auto-billing logic so it stays in one place. The DB only
stores **payments**; obligations (monthly bills) are derived from
``group.price`` and the calendar months between the student's effective start
date and today.

Public surface:

* :func:`compute_billing`        — billing snapshot for a single student.
* :func:`compute_billing_many`   — same but in bulk (one query for all
  payments and a single students fetch).
* :func:`record_payment`         — insert a payment + sync ``payment_status``.
* :func:`delete_payment`         — drop a payment + sync ``payment_status``.
* :func:`summary`                — period KPI used by the Finance dashboard.
* :func:`compute_trend`          — month-over-month payment trend per student.

All numbers are integer UZS.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable, Mapping, Optional, Sequence

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.group import Group
from app.models.payment import Payment
from app.models.student import Student


# ── Date helpers ────────────────────────────────────────────────────────────
def _add_months(d: date, n: int) -> date:
    """Return the 1st of the month obtained by adding ``n`` months to ``d``."""
    total = d.year * 12 + (d.month - 1) + n
    year, month = divmod(total, 12)
    return date(year, month + 1, 1)


def _months_between(start: date, end: date) -> int:
    """Number of *calendar* months from ``start`` to ``end`` (inclusive of
    both endpoints' months)."""
    if end < start:
        return 0
    return (end.year - start.year) * 12 + (end.month - start.month) + 1


def _month_start(d: date) -> date:
    return date(d.year, d.month, 1)


# ── Billing snapshot ────────────────────────────────────────────────────────
@dataclass
class BillingSnapshot:
    monthly_amount: int
    months_due: int
    total_due: int
    total_paid: int
    debt_amount: int
    months_unpaid: int
    overdue_days: int
    last_payment_date: Optional[date]
    last_payment_amount: Optional[int]
    status: str  # paid | debt
    credit_balance: int
    total_course_cost: int
    max_deposit_amount: int
    course_end_date: Optional[date]


class FinanceError(ValueError):
    def __init__(self, code: str, *, max_allowed: Optional[int] = None) -> None:
        super().__init__(code)
        self.code = code
        self.max_allowed = max_allowed

    def to_detail(self) -> dict[str, int | str]:
        detail: dict[str, int | str] = {"code": self.code}
        if self.max_allowed is not None:
            detail["max_allowed"] = int(self.max_allowed)
        return detail


def validate_deposit_amount(*, amount: int, snapshot: BillingSnapshot) -> None:
    if snapshot.max_deposit_amount <= 0:
        raise FinanceError("deposit_not_available", max_allowed=0)
    if amount > snapshot.max_deposit_amount:
        raise FinanceError("amount_exceeds_remaining_cost", max_allowed=snapshot.max_deposit_amount)


def _effective_start(student: Student, group: Group) -> date:
    student_start = student.created_at.date() if student.created_at else group.start_date
    return max(group.start_date, student_start)


def _compute_total_course_cost(*, student: Student, group: Optional[Group], effective_start: date) -> int:
    monthly = int(group.price) if group and group.price else 0
    if not group or monthly <= 0:
        return 0

    if group.end_date:
        billable_months = _months_between(_month_start(effective_start), _month_start(group.end_date))
    elif group.duration_months and group.duration_months > 0:
        billable_months = int(group.duration_months)
    else:
        billable_months = max(1, int(settings.DEFAULT_PREPAY_HORIZON_MONTHS))
    return max(0, billable_months) * monthly


def _build_snapshot(
    *,
    student: Student,
    group: Optional[Group],
    payments: Sequence[Payment],
    today: date,
) -> BillingSnapshot:
    monthly = int(group.price) if group and group.price else 0
    effective_start = today
    course_end_date: Optional[date] = None

    # Effective billing window: from group start (or student creation) to now.
    if group is not None and monthly > 0:
        effective_start = _effective_start(student, group)
        # Cap by group.end_date so completed groups don't keep accruing debt.
        effective_end = min(today, group.end_date) if group.end_date else today
        months_due = max(0, _months_between(_month_start(effective_start), _month_start(effective_end)))
        if group.end_date:
            course_end_date = group.end_date
        elif group.duration_months and group.duration_months > 0:
            course_end_date = _add_months(_month_start(effective_start), int(group.duration_months) - 1)
    else:
        months_due = 0

    total_due = months_due * monthly
    total_paid = sum(int(p.amount) for p in payments)
    debt = max(0, total_due - total_paid)
    credit_balance = max(0, total_paid - total_due)
    total_course_cost = _compute_total_course_cost(student=student, group=group, effective_start=effective_start)
    max_deposit_amount = max(0, total_course_cost - total_paid)

    if monthly > 0 and debt > 0:
        # how many full unpaid months
        months_unpaid = (debt + monthly - 1) // monthly
        # first unpaid month = months_due - months_unpaid + 1 (1-based)
        first_unpaid_idx = months_due - months_unpaid  # 0-based offset
        first_unpaid_month_start = _add_months(_month_start(effective_start), max(0, first_unpaid_idx))
        overdue_days = max(0, (today - first_unpaid_month_start).days)
    else:
        months_unpaid = 0
        overdue_days = 0

    last_paid_dt: Optional[date] = None
    last_paid_amt: Optional[int] = None
    if payments:
        latest = max(payments, key=lambda p: (p.paid_at, p.created_at))
        last_paid_dt = latest.paid_at
        last_paid_amt = int(latest.amount)

    # Strict dichotomy: either fully covered → paid, or anything missing → debt.
    # When monthly == 0 or months_due == 0 → total_due == 0, so 0 >= 0 → paid.
    status = "paid" if total_paid >= total_due else "debt"

    return BillingSnapshot(
        monthly_amount=monthly,
        months_due=months_due,
        total_due=total_due,
        total_paid=total_paid,
        debt_amount=debt,
        months_unpaid=months_unpaid,
        overdue_days=overdue_days,
        last_payment_date=last_paid_dt,
        last_payment_amount=last_paid_amt,
        status=status,
        credit_balance=credit_balance,
        total_course_cost=total_course_cost,
        max_deposit_amount=max_deposit_amount,
        course_end_date=course_end_date,
    )


async def compute_billing(
    db: AsyncSession,
    *,
    student: Student,
    group: Optional[Group],
    today: Optional[date] = None,
) -> BillingSnapshot:
    today = today or date.today()
    payments = (
        await db.execute(
            select(Payment).where(Payment.student_id == student.id)
        )
    ).scalars().all()
    return _build_snapshot(student=student, group=group, payments=payments, today=today)


@dataclass
class StudentLedgerData:
    student: Student
    group: Optional[Group]
    snapshot: BillingSnapshot
    payments: list[Payment]


async def compute_student_ledger(
    db: AsyncSession,
    *,
    student: Student,
    period_from: Optional[date] = None,
    period_to: Optional[date] = None,
    today: Optional[date] = None,
) -> StudentLedgerData:
    """Single source of truth for "billing snapshot + payments" used by both
    the admin Finance API and the student cabinet self-API.

    The snapshot is always computed against the *full* payment history (so the
    debt is correct), but the returned ``payments`` list is filtered by the
    optional ``period_from`` / ``period_to`` window.
    """
    group = await db.get(Group, student.group_id) if student.group_id else None
    snap = await compute_billing(db, student=student, group=group, today=today)

    pay_stmt = select(Payment).where(Payment.student_id == student.id)
    if period_from:
        pay_stmt = pay_stmt.where(Payment.paid_at >= period_from)
    if period_to:
        pay_stmt = pay_stmt.where(Payment.paid_at <= period_to)
    pay_stmt = pay_stmt.order_by(Payment.paid_at.desc(), Payment.id.desc())
    payments = list((await db.execute(pay_stmt)).scalars().all())

    return StudentLedgerData(
        student=student, group=group, snapshot=snap, payments=payments
    )


async def compute_billing_many(
    db: AsyncSession,
    *,
    students: Sequence[Student],
    groups_by_id: Mapping[int, Group],
    today: Optional[date] = None,
) -> dict[int, BillingSnapshot]:
    """Compute billing for many students with a single payments query."""
    today = today or date.today()
    if not students:
        return {}

    student_ids = [s.id for s in students]
    rows = (
        await db.execute(
            select(Payment).where(Payment.student_id.in_(student_ids))
        )
    ).scalars().all()

    by_student: dict[int, list[Payment]] = defaultdict(list)
    for p in rows:
        by_student[p.student_id].append(p)

    out: dict[int, BillingSnapshot] = {}
    for s in students:
        g = groups_by_id.get(s.group_id) if s.group_id else None
        out[s.id] = _build_snapshot(
            student=s, group=g, payments=by_student.get(s.id, ()), today=today
        )
    return out


# ── Status sync ─────────────────────────────────────────────────────────────
async def sync_payment_status(
    db: AsyncSession,
    *,
    student: Student,
) -> str:
    """Recompute and write back :pyattr:`Student.payment_status`. Returns
    the new status. Caller commits."""
    group = await db.get(Group, student.group_id) if student.group_id else None
    snap = await compute_billing(db, student=student, group=group)
    if student.payment_status != snap.status:
        student.payment_status = snap.status
        await db.flush()
    return snap.status


# ── Mutations ───────────────────────────────────────────────────────────────
async def record_payment(
    db: AsyncSession,
    *,
    student: Student,
    amount: int,
    method: str,
    paid_at: date,
    note: Optional[str],
) -> Payment:
    group = await db.get(Group, student.group_id) if student.group_id else None
    snap = await compute_billing(db, student=student, group=group)
    validate_deposit_amount(amount=amount, snapshot=snap)

    payment = Payment(
        student_id=student.id,
        amount=amount,
        method=method,
        paid_at=paid_at,
        note=note,
    )
    db.add(payment)
    await db.flush()
    await sync_payment_status(db, student=student)

    # Notify (admin + group teacher). Late import to dodge circular dependency.
    from app.services import notifications_service as _ns

    audience = await _ns.audience_for_student(db, student.id, for_payment_event=True)
    await _ns.emit(
        db,
        kind="payment_received",
        severity="success",
        title=f"Платёж принят: {student.full_name}",
        body=f"{amount:,} UZS · {method}".replace(",", " "),
        link=f"/students/{student.id}",
        payload={
            "student_id": student.id,
            "payment_id": payment.id,
            "amount": amount,
            "method": method,
        },
        dedup_key=f"payment:{payment.id}",
        audience=audience,
    )
    return payment


async def delete_payment(db: AsyncSession, *, payment: Payment) -> None:
    from app.services.files_service import delete_payment_receipt

    student = await db.get(Student, payment.student_id)
    for receipt in list(payment.receipts):
        await delete_payment_receipt(db, receipt=receipt)
    await db.delete(payment)
    await db.flush()
    if student is not None:
        await sync_payment_status(db, student=student)


# ── Summary KPI ─────────────────────────────────────────────────────────────
@dataclass
class MethodAgg:
    method: str
    count: int
    amount: int


@dataclass
class FinanceSummaryData:
    payments_count: int
    payments_total: int
    by_method: list[MethodAgg]
    debtors_count: int
    total_debt: int
    overdue_today: int


async def summary(
    db: AsyncSession,
    *,
    period_from: date,
    period_to: date,
) -> FinanceSummaryData:
    # Period aggregates
    rows = (
        await db.execute(
            select(
                Payment.method,
                func.count(Payment.id),
                func.coalesce(func.sum(Payment.amount), 0),
            )
            .where(Payment.paid_at >= period_from)
            .where(Payment.paid_at <= period_to)
            .group_by(Payment.method)
        )
    ).all()
    methods = [MethodAgg(method=str(m), count=int(c), amount=int(a)) for m, c, a in rows]
    total_count = sum(m.count for m in methods)
    total_amount = sum(m.amount for m in methods)

    # Cross-period debt overview — compute from current state.
    students_q = await db.execute(
        select(Student).where(Student.is_active.is_(True))
    )
    students = list(students_q.scalars().all())
    group_ids = {s.group_id for s in students if s.group_id is not None}
    groups: dict[int, Group] = {}
    if group_ids:
        gq = await db.execute(select(Group).where(Group.id.in_(group_ids)))
        groups = {g.id: g for g in gq.scalars().all()}

    snaps = await compute_billing_many(db, students=students, groups_by_id=groups)
    today = date.today()
    debtors_count = 0
    total_debt = 0
    overdue_today = 0
    for snap in snaps.values():
        if snap.debt_amount > 0:
            debtors_count += 1
            total_debt += snap.debt_amount
            if snap.overdue_days == 0 and snap.months_unpaid > 0:
                # Edge case: just rolled into the new month today.
                overdue_today += 1

    return FinanceSummaryData(
        payments_count=total_count,
        payments_total=total_amount,
        by_method=methods,
        debtors_count=debtors_count,
        total_debt=total_debt,
        overdue_today=overdue_today,
    )


# ── Trend ──────────────────────────────────────────────────────────────────
async def compute_trends(
    db: AsyncSession, *, student_ids: Iterable[int]
) -> dict[int, str]:
    """Compare last full month payments vs the previous month per student.

    Returns a mapping ``student_id -> "up" | "down" | "stable"``.

    Heuristic: if the debt is *growing* (this month they paid less than the
    previous one), trend is ``up`` (bad). If they paid more, ``down`` (good).
    """
    ids = list(student_ids)
    if not ids:
        return {}

    today = date.today()
    cur_start = _month_start(today)
    prev_start = _add_months(cur_start, -1)

    rows = (
        await db.execute(
            select(
                Payment.student_id,
                func.sum(
                    case((Payment.paid_at >= cur_start, Payment.amount), else_=0)
                ).label("cur"),
                func.sum(
                    case(
                        (
                            (Payment.paid_at >= prev_start) & (Payment.paid_at < cur_start),
                            Payment.amount,
                        ),
                        else_=0,
                    )
                ).label("prev"),
            )
            .where(Payment.student_id.in_(ids))
            .where(Payment.paid_at >= prev_start)
            .group_by(Payment.student_id)
        )
    ).all()

    out: dict[int, str] = {sid: "stable" for sid in ids}
    for sid, cur, prev in rows:
        c = int(cur or 0)
        p = int(prev or 0)
        if c > p:
            out[sid] = "down"  # paid more than before → debt going down
        elif c < p:
            out[sid] = "up"    # paid less → debt likely growing
        else:
            out[sid] = "stable"
    return out
