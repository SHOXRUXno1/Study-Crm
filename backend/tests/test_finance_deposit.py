from datetime import date, datetime
from types import SimpleNamespace

import pytest

from app.services.finance_service import (
    FinanceError,
    _build_snapshot,
    validate_deposit_amount,
)


def _student(*, group_id: int | None = 1, created_at: datetime | None = None):
    return SimpleNamespace(
        id=10,
        group_id=group_id,
        created_at=created_at or datetime(2026, 1, 5, 9, 0, 0),
    )


def _group(
    *,
    price: int = 100,
    start_date: date = date(2026, 1, 1),
    end_date: date | None = date(2026, 4, 30),
    duration_months: int = 0,
):
    return SimpleNamespace(
        id=1,
        price=price,
        start_date=start_date,
        end_date=end_date,
        duration_months=duration_months,
    )


def _payment(amount: int, *, paid_at: date, created_at: datetime):
    return SimpleNamespace(amount=amount, paid_at=paid_at, created_at=created_at)


def test_deposit_over_debt_builds_credit_balance():
    snap = _build_snapshot(
        student=_student(),
        group=_group(),
        payments=[
            _payment(320, paid_at=date(2026, 3, 10), created_at=datetime(2026, 3, 10, 10, 0, 0)),
        ],
        today=date(2026, 3, 20),
    )

    assert snap.total_due == 300
    assert snap.total_paid == 320
    assert snap.debt_amount == 0
    assert snap.credit_balance == 20
    assert snap.total_course_cost == 400
    assert snap.max_deposit_amount == 80


def test_amount_above_remaining_cost_is_rejected():
    snap = _build_snapshot(
        student=_student(),
        group=_group(),
        payments=[_payment(320, paid_at=date(2026, 3, 10), created_at=datetime(2026, 3, 10, 10, 0, 0))],
        today=date(2026, 3, 20),
    )

    with pytest.raises(FinanceError) as exc:
        validate_deposit_amount(amount=81, snapshot=snap)

    assert exc.value.code == "amount_exceeds_remaining_cost"
    assert exc.value.max_allowed == 80


def test_credit_balance_recalculates_after_payment_removed():
    student = _student()
    group = _group()
    today = date(2026, 2, 20)
    payment_a = _payment(150, paid_at=date(2026, 2, 5), created_at=datetime(2026, 2, 5, 10, 0, 0))
    payment_b = _payment(120, paid_at=date(2026, 2, 10), created_at=datetime(2026, 2, 10, 10, 0, 0))

    before = _build_snapshot(
        student=student,
        group=group,
        payments=[payment_a, payment_b],
        today=today,
    )
    after = _build_snapshot(
        student=student,
        group=group,
        payments=[payment_a],
        today=today,
    )

    assert before.total_due == 200
    assert before.credit_balance == 70
    assert before.debt_amount == 0
    assert after.total_due == 200
    assert after.credit_balance == 0
    assert after.debt_amount == 50


def test_student_without_group_cannot_deposit():
    snap = _build_snapshot(
        student=_student(group_id=None),
        group=None,
        payments=[],
        today=date(2026, 3, 20),
    )

    with pytest.raises(FinanceError) as exc:
        validate_deposit_amount(amount=1, snapshot=snap)

    assert exc.value.code == "deposit_not_available"
    assert exc.value.max_allowed == 0


def test_duration_months_is_used_when_end_date_missing():
    snap = _build_snapshot(
        student=_student(),
        group=_group(end_date=None, duration_months=6),
        payments=[],
        today=date(2026, 3, 20),
    )

    assert snap.total_course_cost == 600
    assert snap.max_deposit_amount == 600
