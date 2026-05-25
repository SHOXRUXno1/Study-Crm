"""Student transfer service.

Single entry point for moving a student from one group to another. The entire
operation is atomic: billing snapshot, optional debt adjustment, group
assignment and audit record all commit together. Notification emission and
denormalised ``payment_status`` recomputation happen *after* the commit so a
DB failure cannot leave a stale notification or wrong status.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group import Group
from app.models.payment import Payment
from app.models.student import Student
from app.models.student_transfer import StudentTransfer
from app.schemas.auth import AuthUser
from app.schemas.student_transfer import (
    DebtPolicy,
    StudentTransferPreview,
    StudentTransferResult,
)
from app.services.finance_service import compute_billing, sync_payment_status

logger = logging.getLogger(__name__)

_MAX_DAYS_PAST = 30
_MAX_DAYS_FUTURE = 30


def _err(status_code: int, code: str, message: str, **extra) -> HTTPException:
    """Build an HTTPException with a structured ``{ code, message, ... }`` body.

    The frontend matches on ``code`` and shows ``message`` only as a fallback,
    so the codes are stable contract; messages can be reworded freely.
    """
    detail: dict = {"code": code, "message": message}
    if extra:
        detail.update(extra)
    return HTTPException(status_code=status_code, detail=detail)


async def preview_transfer(
    db: AsyncSession,
    *,
    student: Student,
    to_group_id: int,
    transfer_date: Optional[date] = None,
) -> StudentTransferPreview:
    """Compute a read-only preview with full before/after projections."""
    today = date.today()
    effective_date = transfer_date or today

    new_group = await db.get(Group, to_group_id)
    if new_group is None:
        raise _err(404, "target_not_found", "Target group not found")

    old_group: Optional[Group] = (
        await db.get(Group, student.group_id) if student.group_id else None
    )

    # Pre-transfer debt: compute against current (old) group at the proposed date.
    snap_old = await compute_billing(
        db, student=student, group=old_group, today=effective_date
    )
    prev_debt = max(0, snap_old.debt_amount) if snap_old.debt_amount else 0

    # Post-transfer debt under SNAPSHOT policy: recompute against the new
    # group at the same date, with all existing payments still credited.
    snap_new = await compute_billing(
        db, student=student, group=new_group, today=effective_date
    )
    projected_snapshot = (
        max(0, snap_new.debt_amount) if snap_new.debt_amount else 0
    )

    return StudentTransferPreview(
        from_group_id=old_group.id if old_group else None,
        from_group_name=old_group.code if old_group else None,
        from_monthly_price=old_group.price if old_group else None,
        to_group_id=new_group.id,
        to_group_name=new_group.code,
        to_monthly_price=new_group.price,
        prev_debt=prev_debt,
        projected_debt_after_writeoff=0,
        projected_debt_after_snapshot=projected_snapshot,
        projected_debt_after_reset=0,
        capacity_current=new_group.student_count,
        capacity_max=new_group.max_students,
        capacity_exceeded=new_group.student_count >= new_group.max_students,
        transfer_date_min=today - timedelta(days=_MAX_DAYS_PAST),
        transfer_date_max=today + timedelta(days=_MAX_DAYS_FUTURE),
        target_completed=(new_group.status == "completed"),
        same_group=(student.group_id == to_group_id),
    )


async def transfer_student(
    db: AsyncSession,
    *,
    student: Student,
    to_group_id: int,
    transfer_date: date,
    debt_policy: DebtPolicy,
    reason: Optional[str],
    force: bool,
    actor: AuthUser,
) -> StudentTransferResult:
    """Execute the transfer atomically."""
    today = date.today()
    date_min = today - timedelta(days=_MAX_DAYS_PAST)
    date_max = today + timedelta(days=_MAX_DAYS_FUTURE)

    # ── Validate transfer_date window ────────────────────────────────────────
    if transfer_date < date_min or transfer_date > date_max:
        raise _err(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "transfer_date_out_of_range",
            f"transfer_date must be within ±{_MAX_DAYS_PAST} days of today",
            min=date_min.isoformat(),
            max=date_max.isoformat(),
        )

    # ── Load new group ───────────────────────────────────────────────────────
    new_group = await db.get(Group, to_group_id)
    if new_group is None:
        raise _err(404, "target_not_found", "Target group not found")

    # ── Business rule checks ─────────────────────────────────────────────────
    if student.group_id is None:
        raise _err(
            status.HTTP_409_CONFLICT,
            "not_enrolled",
            "Student is not enrolled in any group. Use enroll instead of transfer.",
        )

    if student.group_id == to_group_id:
        raise _err(
            status.HTTP_409_CONFLICT,
            "same_group",
            "Student is already in the target group",
        )

    if new_group.status == "completed":
        raise _err(
            status.HTTP_409_CONFLICT,
            "group_completed",
            "Cannot transfer into a completed group",
        )

    if new_group.student_count >= new_group.max_students and not force:
        raise _err(
            status.HTTP_409_CONFLICT,
            "capacity_exceeded",
            "Target group is full",
            current=new_group.student_count,
            max=new_group.max_students,
        )

    # Admin override (reset) requires an explicit reason for the audit trail.
    if debt_policy == "reset" and not (reason and reason.strip()):
        raise _err(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "reset_requires_reason",
            "Reset policy requires a non-empty reason",
        )

    # ── Debt snapshot ────────────────────────────────────────────────────────
    old_group: Optional[Group] = (
        await db.get(Group, student.group_id) if student.group_id else None
    )
    snap = await compute_billing(db, student=student, group=old_group, today=transfer_date)
    prev_debt = max(0, snap.debt_amount) if snap.debt_amount else 0

    # ── Debt action: writeoff / snapshot / reset / none ──────────────────────
    adjustment_payment: Optional[Payment] = None
    debt_action: str

    if prev_debt == 0:
        debt_action = "none"
    elif debt_policy == "writeoff":
        adjustment_payment = Payment(
            student_id=student.id,
            amount=prev_debt,
            method="adjustment",
            paid_at=transfer_date,
            note=(
                f"[transfer] write-off from group {old_group.id} "
                f"({old_group.code if old_group else '?'})"
            ),
        )
        db.add(adjustment_payment)
        await db.flush()
        debt_action = "writeoff"
    elif debt_policy == "reset":
        # Admin override: clear debt and document intent in the note + audit.
        adjustment_payment = Payment(
            student_id=student.id,
            amount=prev_debt,
            method="adjustment",
            paid_at=transfer_date,
            note=(
                f"[transfer:reset] admin override "
                f"from group {old_group.id if old_group else '?'} "
                f"({old_group.code if old_group else '?'}): "
                f"{reason.strip() if reason else ''}"
            ),
        )
        db.add(adjustment_payment)
        await db.flush()
        debt_action = "reset"
    else:  # snapshot
        debt_action = "snapshot"

    # ── Update student ───────────────────────────────────────────────────────
    from_group_id = student.group_id
    student.group_id = to_group_id

    if old_group is not None:
        old_group.student_count = max(0, old_group.student_count - 1)
    new_group.student_count = new_group.student_count + 1

    # ── Write audit record ───────────────────────────────────────────────────
    transfer = StudentTransfer(
        student_id=student.id,
        from_group_id=from_group_id,
        to_group_id=to_group_id,
        transfer_date=transfer_date,
        prev_debt=prev_debt,
        debt_action=debt_action,
        adjustment_payment_id=(
            adjustment_payment.id if adjustment_payment else None
        ),
        reason=reason,
        performed_by_subject=actor.login,
        performed_by_role=actor.role,
    )
    db.add(transfer)
    await db.flush()

    await db.commit()
    await db.refresh(student)

    # ── Post-commit side effects ─────────────────────────────────────────────
    # Recompute denormalised payment_status against the new group so the UI
    # badge does not lag behind reality (was a stale-status bug).
    try:
        await sync_payment_status(db, student=student)
        await db.commit()
    except Exception:  # noqa: BLE001
        logger.warning(
            "sync_payment_status after transfer failed for student=%s",
            student.id,
            exc_info=True,
        )

    # ── Emit notification (best-effort, after commit) ────────────────────────
    try:
        from app.services import notifications_service as ns

        old_teacher_username = await _group_teacher_username(db, from_group_id)
        new_teacher_username = await _group_teacher_username(db, to_group_id)

        audience: list[tuple[str, str]] = list(ns.audience_admin_only())
        seen = set(audience)
        for uname in (old_teacher_username, new_teacher_username):
            if uname and (uname, "teacher") not in seen:
                audience.append((uname, "teacher"))
                seen.add((uname, "teacher"))

        title = f"{student.full_name}: переведён"
        debt_suffix = ""
        if debt_action == "writeoff":
            debt_suffix = f" · списано {prev_debt:,} UZS"
        elif debt_action == "reset":
            debt_suffix = f" · обнулено {prev_debt:,} UZS (admin)"
        body = (
            f"{old_group.code if old_group else '—'} → {new_group.code}{debt_suffix}"
        )

        await ns.emit(
            db,
            kind="student_transferred",
            severity="info",
            title=title,
            body=body,
            link=f"/students/{student.id}",
            payload={
                "student_id": student.id,
                "student_name": student.full_name,
                "from_group_id": from_group_id,
                "from_group_name": old_group.code if old_group else None,
                "to_group_id": to_group_id,
                "to_group_name": new_group.code,
                "transfer_date": transfer_date.isoformat(),
                "prev_debt": prev_debt,
                "debt_action": debt_action,
            },
            audience=audience,
        )
    except Exception:  # noqa: BLE001
        logger.warning("student_transferred notification emit failed", exc_info=True)

    return StudentTransferResult(
        transfer_id=transfer.id,
        student_id=student.id,
        from_group_id=from_group_id,
        to_group_id=to_group_id,
        transfer_date=transfer_date,
        prev_debt=prev_debt,
        debt_action=debt_action,
        adjustment_payment_id=adjustment_payment.id if adjustment_payment else None,
    )


async def list_transfers(
    db: AsyncSession,
    *,
    student_id: int,
) -> list[StudentTransfer]:
    rows = (
        await db.execute(
            select(StudentTransfer)
            .where(StudentTransfer.student_id == student_id)
            .order_by(StudentTransfer.transfer_date.desc(), StudentTransfer.id.desc())
        )
    ).scalars().all()
    return list(rows)


async def _group_teacher_username(
    db: AsyncSession, group_id: Optional[int]
) -> Optional[str]:
    if group_id is None:
        return None
    from app.models.teacher import Teacher
    row = (
        await db.execute(
            select(Teacher.username)
            .join(Group, Group.teacher_id == Teacher.id)
            .where(Group.id == group_id)
            .where(Teacher.is_active.is_(True))
        )
    ).scalar_one_or_none()
    return row
