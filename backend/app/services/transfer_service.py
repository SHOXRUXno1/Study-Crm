"""Student transfer service.

Single entry point for moving a student from one group to another. The entire
operation is atomic: billing snapshot, optional debt write-off, group assignment
and audit record all commit together. Notification emission happens *after* the
commit so a DB failure cannot leave a stale notification.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

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
from app.services.finance_service import compute_billing

logger = logging.getLogger(__name__)

_MAX_DAYS_PAST = 30
_MAX_DAYS_FUTURE = 30


async def preview_transfer(
    db: AsyncSession,
    *,
    student: Student,
    to_group_id: int,
    transfer_date: Optional[date] = None,
) -> StudentTransferPreview:
    """Compute a read-only preview: debt snapshot + capacity info."""
    transfer_date = transfer_date or date.today()

    new_group = await db.get(Group, to_group_id)
    if new_group is None:
        from fastapi import HTTPException  # local import to avoid circular
        raise HTTPException(status_code=404, detail="Target group not found")

    old_group: Optional[Group] = (
        await db.get(Group, student.group_id) if student.group_id else None
    )

    snap = await compute_billing(db, student=student, group=old_group, today=transfer_date)
    prev_debt = max(0, snap.debt_amount) if snap.debt_amount else 0

    return StudentTransferPreview(
        from_group_id=old_group.id if old_group else None,
        from_group_name=old_group.name if old_group else None,
        to_group_id=new_group.id,
        to_group_name=new_group.name,
        prev_debt=prev_debt,
        capacity_current=new_group.student_count,
        capacity_max=new_group.max_students,
        capacity_exceeded=new_group.student_count >= new_group.max_students,
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

    # ── Validate transfer_date window ────────────────────────────────────────
    if transfer_date < today - timedelta(days=_MAX_DAYS_PAST):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=422,
            detail=f"transfer_date cannot be more than {_MAX_DAYS_PAST} days in the past",
        )
    if transfer_date > today + timedelta(days=_MAX_DAYS_FUTURE):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=422,
            detail=f"transfer_date cannot be more than {_MAX_DAYS_FUTURE} days in the future",
        )

    # ── Load new group ───────────────────────────────────────────────────────
    new_group = await db.get(Group, to_group_id)
    if new_group is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Target group not found")

    # ── Business rule checks ─────────────────────────────────────────────────
    if student.group_id is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=409,
            detail="Student is not enrolled in any group. Use enroll instead of transfer.",
        )

    if student.group_id == to_group_id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=409,
            detail="same_group: student is already in the target group",
        )

    if new_group.status == "completed":
        from fastapi import HTTPException
        raise HTTPException(
            status_code=409,
            detail="group_completed: cannot transfer into a completed group",
        )

    if new_group.student_count >= new_group.max_students and not force:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=409,
            detail="capacity_exceeded",
            headers={
                "X-Capacity-Current": str(new_group.student_count),
                "X-Capacity-Max": str(new_group.max_students),
            },
        )

    # ── Debt snapshot ────────────────────────────────────────────────────────
    old_group: Optional[Group] = (
        await db.get(Group, student.group_id) if student.group_id else None
    )
    snap = await compute_billing(db, student=student, group=old_group, today=transfer_date)
    prev_debt = max(0, snap.debt_amount) if snap.debt_amount else 0

    # ── Optional debt write-off via adjustment Payment ───────────────────────
    adjustment_payment: Optional[Payment] = None
    debt_action: str

    if prev_debt > 0 and debt_policy == "writeoff":
        adjustment_payment = Payment(
            student_id=student.id,
            amount=prev_debt,
            method="adjustment",
            paid_at=transfer_date,
            note=(
                f"[transfer] write-off from group {old_group.id} "
                f"({old_group.name if old_group else '?'})"
            ),
        )
        db.add(adjustment_payment)
        await db.flush()  # get the id before commit
        debt_action = "writeoff"
    elif prev_debt == 0:
        debt_action = "none"
    else:
        debt_action = "snapshot"

    # ── Update student ───────────────────────────────────────────────────────
    from_group_id = student.group_id
    student.group_id = to_group_id

    # Update denormalised counters on the groups
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
        body = (
            f"{old_group.name if old_group else '—'} → {new_group.name}"
            + (f" · списано {prev_debt:,} UZS" if debt_action == "writeoff" else "")
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
                "from_group_name": old_group.name if old_group else None,
                "to_group_id": to_group_id,
                "to_group_name": new_group.name,
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
