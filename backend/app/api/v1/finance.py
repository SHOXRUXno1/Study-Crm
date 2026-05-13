"""Finance API — admin-only.

Endpoints:

* ``GET    /finance/summary``                  — period KPI + debtor counts.
* ``GET    /finance/payments``                 — paginated payments feed.
* ``POST   /finance/payments``                 — accept a payment.
* ``DELETE /finance/payments/{id}``            — refund / undo.
* ``GET    /finance/students-billing``         — all students with billing
  snapshot (used by the Payments page table & "accept payment" modal).
* ``GET    /finance/debtors``                  — debtors only, with phone /
  finance note / trend (used by the Debtors page).
* ``GET    /finance/students/{id}/ledger``     — billing + payments for one
  student (Student profile / Payments tab).
* ``PATCH  /finance/students/{id}/note``       — update ``finance_note``.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.config import settings
from app.core.deps import get_current_admin, get_current_admin_or_manager, get_current_user
from app.models.group import Group
from app.models.payment import Payment
from app.models.payment_receipt import PaymentReceipt
from app.models.student import Student
from app.schemas.auth import AuthUser
from app.schemas.finance import (
    DebtorList,
    DebtorRead,
    FinanceNoteUpdate,
    FinanceSummary,
    MethodBreakdown,
    PaymentCreate,
    PaymentList,
    PaymentMethod,
    PaymentReceiptRead,
    PaymentRead,
    StudentBilling,
    StudentBillingList,
    StudentLedger,
)
from app.services.finance_service import (
    BillingSnapshot,
    FinanceError,
    compute_billing,
    compute_billing_many,
    compute_student_ledger,
    compute_trends,
    delete_payment as svc_delete_payment,
    record_payment,
    summary as svc_summary,
)
from app.services.files_service import (
    delete_payment_receipt,
    get_receipt_path,
    save_payment_receipt,
)


router = APIRouter(prefix="/finance", tags=["finance"])


# ── helpers ─────────────────────────────────────────────────────────────────
def _full_name(s: Student) -> str:
    return s.full_name or ""


def _serialise_payment(
    p: Payment,
    student: Optional[Student] = None,
    group: Optional[Group] = None,
) -> PaymentRead:
    s = student or p.student
    g = group or (s.group if s and s.group else None)
    receipt_items = [
        PaymentReceiptRead(
            id=r.id,
            original_name=r.original_name,
            mime_type=r.mime_type,
            size_bytes=int(r.size_bytes),
            url=f"/api/v1/finance/payments/{p.id}/receipts/{r.id}",
            created_at=r.created_at,
        )
        for r in sorted(p.receipts, key=lambda x: x.id)
    ]
    return PaymentRead(
        id=p.id,
        student_id=p.student_id,
        amount=int(p.amount),
        method=p.method,
        paid_at=p.paid_at,
        note=p.note,
        student_name=_full_name(s) if s else None,
        group_code=g.code if g else (s.group.code if s and s.group else None),
        course_name=g.course.name if g and g.course else (s.group.course.name if s and s.group and s.group.course else None),
        receipts=receipt_items,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def _to_billing_schema(s: Student, snap: BillingSnapshot) -> StudentBilling:
    g = s.group
    return StudentBilling(
        id=s.id,
        full_name=_full_name(s),
        phone=s.phone,
        parent_phone=s.parent_phone,
        group_id=s.group_id,
        group_code=g.code if g else None,
        course_name=g.course.name if g and g.course else None,
        monthly_amount=snap.monthly_amount,
        months_due=snap.months_due,
        total_due=snap.total_due,
        total_paid=snap.total_paid,
        debt_amount=snap.debt_amount,
        credit_balance=snap.credit_balance,
        total_course_cost=snap.total_course_cost,
        max_deposit_amount=snap.max_deposit_amount,
        course_end_date=snap.course_end_date,
        months_unpaid=snap.months_unpaid,
        overdue_days=snap.overdue_days,
        last_payment_date=snap.last_payment_date,
        last_payment_amount=snap.last_payment_amount,
        status=snap.status,  # type: ignore[arg-type]
        finance_note=s.finance_note,
    )


# ── GET /finance/summary ────────────────────────────────────────────────────
@router.get("/summary", response_model=FinanceSummary)
async def get_summary(
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    today = date.today()
    if to is None:
        to = today
    if from_ is None:
        from_ = date(today.year, today.month, 1)
    if to < from_:
        raise HTTPException(status_code=400, detail="`to` must be on or after `from`")

    data = await svc_summary(db, period_from=from_, period_to=to)
    return FinanceSummary(
        period_from=from_,
        period_to=to,
        payments_count=data.payments_count,
        payments_total=data.payments_total,
        by_method=[
            MethodBreakdown(method=m.method, count=m.count, amount=m.amount)
            for m in data.by_method
        ],
        debtors_count=data.debtors_count,
        total_debt=data.total_debt,
        overdue_today=data.overdue_today,
    )


# ── GET /finance/payments ───────────────────────────────────────────────────
@router.get("/payments", response_model=PaymentList)
async def list_payments(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    student_id: Optional[int] = Query(None),
    group_id: Optional[int] = Query(None),
    method: Optional[str] = Query(None, description="cash | transfer"),
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    search: Optional[str] = Query(None, description="ФИО / телефон"),
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    stmt = select(Payment).join(Payment.student)
    count_stmt = select(func.count(Payment.id)).select_from(Payment).join(Payment.student)

    if student_id is not None:
        stmt = stmt.where(Payment.student_id == student_id)
        count_stmt = count_stmt.where(Payment.student_id == student_id)
    if group_id is not None:
        stmt = stmt.where(Student.group_id == group_id)
        count_stmt = count_stmt.where(Student.group_id == group_id)
    if method is not None:
        stmt = stmt.where(Payment.method == method)
        count_stmt = count_stmt.where(Payment.method == method)
    if from_ is not None:
        stmt = stmt.where(Payment.paid_at >= from_)
        count_stmt = count_stmt.where(Payment.paid_at >= from_)
    if to is not None:
        stmt = stmt.where(Payment.paid_at <= to)
        count_stmt = count_stmt.where(Payment.paid_at <= to)
    if search:
        like = f"%{search}%"
        cond = or_(
            Student.full_name.ilike(like),
            Student.phone.ilike(like),
            Student.parent_phone.ilike(like),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    stmt = stmt.order_by(Payment.paid_at.desc(), Payment.id.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    total = (await db.execute(count_stmt)).scalar_one()

    items = [_serialise_payment(p) for p in rows]
    return PaymentList(items=items, total=int(total), skip=skip, limit=limit)


# ── POST /finance/payments ──────────────────────────────────────────────────
@router.post(
    "/payments",
    response_model=PaymentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_payment(
    student_id: int = Form(...),
    amount: int = Form(...),
    method: PaymentMethod = Form(...),
    paid_at: date = Form(...),
    note: Optional[str] = Form(None),
    files: list[UploadFile] = File(default_factory=list),
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    body = PaymentCreate(
        student_id=student_id,
        amount=amount,
        method=method,
        paid_at=paid_at,
        note=note,
    )
    student = await db.get(Student, body.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    receipt_files = [f for f in files if f.filename]
    if body.method == "transfer":
        if not receipt_files:
            raise HTTPException(status_code=400, detail={"code": "receipt_required"})
        if len(receipt_files) > settings.RECEIPT_MAX_FILES_PER_PAYMENT:
            raise HTTPException(status_code=400, detail={"code": "receipt_too_many"})

    saved_receipts: list[PaymentReceipt] = []
    try:
        payment = await record_payment(
            db,
            student=student,
            amount=body.amount,
            method=body.method,
            paid_at=body.paid_at,
            note=body.note,
        )
        for upload in receipt_files:
            saved_receipts.append(
                await save_payment_receipt(
                    db,
                    payment_id=payment.id,
                    upload=upload,
                )
            )
    except FinanceError as exc:
        await db.rollback()
        for receipt in saved_receipts:
            path = get_receipt_path(
                payment_id=receipt.payment_id,
                stored_name=receipt.stored_name,
            )
            try:
                if path.exists():
                    path.unlink()
            except OSError:
                pass
        raise HTTPException(status_code=400, detail=exc.to_detail()) from exc
    await db.commit()

    payment = await db.get(
        Payment,
        payment.id,
        options=(selectinload(Payment.receipts),),
    )
    return _serialise_payment(payment)  # type: ignore[arg-type]


def _ensure_receipt_access(user: AuthUser, payment: Payment) -> None:
    if user.role == "admin":
        return
    if user.role == "student" and user.id == payment.student_id:
        return
    raise HTTPException(status_code=403, detail="Недостаточно прав")


@router.get("/payments/{payment_id}/receipts/{receipt_id}")
async def get_payment_receipt(
    payment_id: int,
    receipt_id: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    stmt = (
        select(Payment)
        .options(selectinload(Payment.receipts))
        .where(Payment.id == payment_id)
    )
    payment = (await db.execute(stmt)).scalars().first()
    if not payment:
        raise HTTPException(status_code=404, detail="Платёж не найден")
    _ensure_receipt_access(user, payment)

    receipt = next((r for r in payment.receipts if r.id == receipt_id), None)
    if not receipt:
        raise HTTPException(status_code=404, detail="Файл чека не найден")

    path = get_receipt_path(payment_id=payment.id, stored_name=receipt.stored_name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Файл чека не найден")

    return FileResponse(
        path=path,
        media_type=receipt.mime_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(receipt.original_name)}"
        },
    )


@router.delete("/payments/{payment_id}/receipts/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_receipt(
    payment_id: int,
    receipt_id: int,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    stmt = (
        select(Payment)
        .options(selectinload(Payment.receipts))
        .where(Payment.id == payment_id)
    )
    payment = (await db.execute(stmt)).scalars().first()
    if not payment:
        raise HTTPException(status_code=404, detail="Платёж не найден")
    receipt = next((r for r in payment.receipts if r.id == receipt_id), None)
    if not receipt:
        raise HTTPException(status_code=404, detail="Файл чека не найден")
    await delete_payment_receipt(db, receipt=receipt)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── DELETE /finance/payments/{id} ───────────────────────────────────────────
@router.delete("/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment(
    payment_id: int,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Платёж не найден")
    await svc_delete_payment(db, payment=payment)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── GET /finance/students-billing ───────────────────────────────────────────
@router.get("/students-billing", response_model=StudentBillingList)
async def list_students_billing(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    group_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status", description="paid | debt"),
    last_payment_from: Optional[date] = Query(None),
    last_payment_to: Optional[date] = Query(None),
    sort_by: str = Query("name", pattern="^(name|last_payment|debt|total_paid)$"),
    sort_dir: str = Query("asc", pattern="^(asc|desc)$"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    # Base query — applied regardless of whether status filter is in play.
    base_stmt = (
        select(Student)
        .where(Student.is_active.is_(True))
        .order_by(Student.full_name.asc())
    )
    if group_id is not None:
        base_stmt = base_stmt.where(Student.group_id == group_id)
    if search:
        like = f"%{search}%"
        base_stmt = base_stmt.where(
            or_(
                Student.full_name.ilike(like),
                Student.phone.ilike(like),
                Student.parent_phone.ilike(like),
            )
        )

    all_rows = (await db.execute(base_stmt)).scalars().all()
    group_ids = {s.group_id for s in all_rows if s.group_id is not None}
    groups: dict[int, Group] = {}
    if group_ids:
        gq = await db.execute(select(Group).where(Group.id.in_(group_ids)))
        groups = {g.id: g for g in gq.scalars().all()}

    snaps = await compute_billing_many(db, students=all_rows, groups_by_id=groups)
    matching = list(all_rows)
    if status_filter is not None:
        matching = [s for s in matching if snaps[s.id].status == status_filter]
    if last_payment_from is not None:
        matching = [
            s for s in matching
            if snaps[s.id].last_payment_date is not None and snaps[s.id].last_payment_date >= last_payment_from
        ]
    if last_payment_to is not None:
        matching = [
            s for s in matching
            if snaps[s.id].last_payment_date is not None and snaps[s.id].last_payment_date <= last_payment_to
        ]

    reverse = sort_dir == "desc"
    if sort_by == "name":
        matching.sort(key=lambda s: (s.full_name or "").lower(), reverse=reverse)
    elif sort_by == "last_payment":
        matching.sort(
            key=lambda s: snaps[s.id].last_payment_date or date.min,
            reverse=reverse,
        )
    elif sort_by == "debt":
        matching.sort(key=lambda s: snaps[s.id].debt_amount, reverse=reverse)
    elif sort_by == "total_paid":
        matching.sort(key=lambda s: snaps[s.id].total_paid, reverse=reverse)

    total = len(matching)
    page = matching[skip: skip + limit]
    items = [_to_billing_schema(s, snaps[s.id]) for s in page]
    return StudentBillingList(items=items, total=total, skip=skip, limit=limit)


# ── GET /finance/debtors ────────────────────────────────────────────────────
@router.get("/debtors", response_model=DebtorList)
async def list_debtors(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    group_id: Optional[int] = Query(None),
    min_overdue_days: int = Query(0, ge=0),
    max_overdue_days: Optional[int] = Query(None, ge=0),
    debt_min: Optional[int] = Query(None, ge=0),
    debt_max: Optional[int] = Query(None, ge=0),
    months_unpaid_min: Optional[int] = Query(None, ge=0),
    months_unpaid_max: Optional[int] = Query(None, ge=0),
    trend: Optional[str] = Query(None, pattern="^(up|down|stable)$"),
    last_payment_from: Optional[date] = Query(None),
    last_payment_to: Optional[date] = Query(None),
    sort_by: str = Query("debt", pattern="^(debt|overdue|name|last_payment)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin_or_manager),
):
    stmt = select(Student).where(Student.is_active.is_(True))
    if group_id is not None:
        stmt = stmt.where(Student.group_id == group_id)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                Student.full_name.ilike(like),
                Student.phone.ilike(like),
                Student.parent_phone.ilike(like),
            )
        )

    rows = (await db.execute(stmt)).scalars().all()

    group_ids = {s.group_id for s in rows if s.group_id is not None}
    groups: dict[int, Group] = {}
    if group_ids:
        gq = await db.execute(select(Group).where(Group.id.in_(group_ids)))
        groups = {g.id: g for g in gq.scalars().all()}

    snaps = await compute_billing_many(db, students=rows, groups_by_id=groups)

    debtors_pairs = [
        (s, snaps[s.id])
        for s in rows
        if snaps[s.id].debt_amount > 0 and snaps[s.id].overdue_days >= min_overdue_days
    ]
    if max_overdue_days is not None:
        debtors_pairs = [p for p in debtors_pairs if p[1].overdue_days <= max_overdue_days]
    if debt_min is not None:
        debtors_pairs = [p for p in debtors_pairs if p[1].debt_amount >= debt_min]
    if debt_max is not None:
        debtors_pairs = [p for p in debtors_pairs if p[1].debt_amount <= debt_max]
    if months_unpaid_min is not None:
        debtors_pairs = [p for p in debtors_pairs if p[1].months_unpaid >= months_unpaid_min]
    if months_unpaid_max is not None:
        debtors_pairs = [p for p in debtors_pairs if p[1].months_unpaid <= months_unpaid_max]
    if last_payment_from is not None:
        debtors_pairs = [
            p for p in debtors_pairs
            if p[1].last_payment_date is not None and p[1].last_payment_date >= last_payment_from
        ]
    if last_payment_to is not None:
        debtors_pairs = [
            p for p in debtors_pairs
            if p[1].last_payment_date is not None and p[1].last_payment_date <= last_payment_to
        ]

    trends = await compute_trends(db, student_ids=[s.id for s, _ in debtors_pairs])
    if trend is not None:
        debtors_pairs = [p for p in debtors_pairs if trends.get(p[0].id, "stable") == trend]

    reverse = sort_dir == "desc"
    if sort_by == "debt":
        debtors_pairs.sort(key=lambda x: x[1].debt_amount, reverse=reverse)
    elif sort_by == "overdue":
        debtors_pairs.sort(key=lambda x: x[1].overdue_days, reverse=reverse)
    elif sort_by == "name":
        debtors_pairs.sort(key=lambda x: (x[0].full_name or "").lower(), reverse=reverse)
    elif sort_by == "last_payment":
        debtors_pairs.sort(key=lambda x: x[1].last_payment_date or date.min, reverse=reverse)

    total = len(debtors_pairs)
    sliced = debtors_pairs[skip: skip + limit]

    items = [
        DebtorRead(
            **_to_billing_schema(s, snap).model_dump(),
            trend=trends.get(s.id, "stable"),  # type: ignore[arg-type]
        )
        for s, snap in sliced
    ]

    return DebtorList(items=items, total=total, skip=skip, limit=limit)


# ── GET /finance/students/{id}/ledger ───────────────────────────────────────
@router.get("/students/{student_id}/ledger", response_model=StudentLedger)
async def get_student_ledger(
    student_id: int,
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    led = await compute_student_ledger(
        db, student=student, period_from=from_, period_to=to
    )
    billing = _to_billing_schema(led.student, led.snapshot)
    payments = [
        _serialise_payment(p, student=led.student, group=led.group)
        for p in led.payments
    ]
    return StudentLedger(billing=billing, payments=payments)


# ── PATCH /finance/students/{id}/note ───────────────────────────────────────
@router.patch("/students/{student_id}/note", response_model=StudentBilling)
async def update_finance_note(
    student_id: int,
    body: FinanceNoteUpdate,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    student.finance_note = body.note
    await db.commit()

    group = await db.get(Group, student.group_id) if student.group_id else None
    snap = await compute_billing(db, student=student, group=group)
    return _to_billing_schema(student, snap)
