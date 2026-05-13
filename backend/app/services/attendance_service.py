"""Attendance service — bulk upsert + lesson auto-completion.

The service centralises two pieces of logic so they can be reused by both the
``PUT /lessons/{id}/attendance`` endpoint and any future bulk import flows:

1. ``upsert_marks`` — idempotently merges a list of mark inputs for a single
   lesson. Existing marks for students in the payload are updated in-place,
   missing marks are inserted, and marks for students *not* in the payload are
   left untouched. Audit fields (``marked_by_role`` / ``marked_by_id``) are
   refreshed on every write.

2. ``maybe_autocomplete_lesson`` — promotes the lesson's ``status`` to
   ``"completed"`` once attendance has been taken for the entire roster of
   currently-enrolled students *and* the lesson has already started (we never
   complete a future lesson).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import Attendance
from app.models.lesson import Lesson
from app.models.student import Student
from app.schemas.attendance import AttendanceMarkInput
from app.schemas.auth import AuthUser


# ── Bulk upsert ──────────────────────────────────────────────────────────────
async def upsert_marks(
    db: AsyncSession,
    *,
    lesson: Lesson,
    inputs: Sequence[AttendanceMarkInput],
    user: AuthUser,
) -> list[Attendance]:
    """Upsert attendance marks for ``lesson`` from ``inputs``.

    Returns the resulting (already-flushed) Attendance rows in the same order
    as ``inputs``. Caller commits.
    """
    if not inputs:
        return []

    student_ids = [m.student_id for m in inputs]

    # Fetch existing marks for these students in one query.
    existing_q = await db.execute(
        select(Attendance)
        .where(Attendance.lesson_id == lesson.id)
        .where(Attendance.student_id.in_(student_ids))
    )
    existing: dict[int, Attendance] = {
        a.student_id: a for a in existing_q.scalars().all()
    }

    role = user.role
    teacher_id = user.id if role == "teacher" else None

    out: list[Attendance] = []
    for inp in inputs:
        row = existing.get(inp.student_id)
        if row is None:
            row = Attendance(
                lesson_id=lesson.id,
                student_id=inp.student_id,
                status=inp.status,
                late_minutes=inp.late_minutes,
                reason_code=inp.reason_code,
                reason_text=inp.reason_text,
                marked_by_role=role,
                marked_by_id=teacher_id,
            )
            db.add(row)
        else:
            row.status = inp.status
            row.late_minutes = inp.late_minutes
            row.reason_code = inp.reason_code
            row.reason_text = inp.reason_text
            row.marked_by_role = role
            row.marked_by_id = teacher_id
            row.updated_at = datetime.now(timezone.utc)
        out.append(row)

    await db.flush()

    # Notify on bulk-absence (>= 5 absent OR >50% absent in this batch).
    absent_count = sum(1 for r in out if r.status == "absent")
    threshold_pct = absent_count * 2 > len(out) if out else False
    if absent_count >= 5 or (absent_count >= 3 and threshold_pct):
        from app.services import notifications_service as _ns

        try:
            audience = await _ns.audience_for_group(db, lesson.group_id)
            await _ns.emit(
                db,
                kind="attendance_changed",
                severity="warning",
                title=(
                    f"Много отсутствующих: {absent_count} учеников "
                    f"({lesson.lesson_date.isoformat()})"
                ),
                body=None,
                link=f"/groups/{lesson.group_id}",
                payload={
                    "lesson_id": lesson.id,
                    "group_id": lesson.group_id,
                    "absent_count": absent_count,
                    "marks_in_batch": len(out),
                },
                dedup_key=f"attn:{lesson.id}",
                audience=audience,
            )
        except Exception:  # noqa: BLE001 — never break attendance flow
            pass
    return out


# ── Auto-completion ──────────────────────────────────────────────────────────
async def maybe_autocomplete_lesson(
    db: AsyncSession, *, lesson: Lesson
) -> bool:
    """Promote lesson to ``status="completed"`` if all enrolled students have
    a mark *and* the lesson has already started.

    Idempotent. Returns True if the status was changed by this call.
    """
    if lesson.status not in ("scheduled",):
        return False

    # Lesson must be in the past (or already started today).
    # We compare in UTC so behaviour is identical regardless of the host TZ.
    # Note: lesson.lesson_date / lesson.start_time are wall-clock business-local
    # values (the school operates in a single TZ); we treat them as UTC here for
    # a stable, monotonic comparison. If multi-TZ ever becomes a requirement,
    # add a per-school timezone field and convert before this comparison.
    started_at = datetime.combine(
        lesson.lesson_date, lesson.start_time, tzinfo=timezone.utc
    )
    if started_at > datetime.now(timezone.utc):
        return False

    enrolled = await db.execute(
        select(func.count(Student.id))
        .where(Student.group_id == lesson.group_id)
        .where(Student.is_active.is_(True))
    )
    enrolled_count = int(enrolled.scalar() or 0)
    if enrolled_count == 0:
        return False

    marked = await db.execute(
        select(func.count(Attendance.id)).where(Attendance.lesson_id == lesson.id)
    )
    marked_count = int(marked.scalar() or 0)

    if marked_count >= enrolled_count:
        lesson.status = "completed"
        await db.flush()
        return True
    return False


# ── Helpers ──────────────────────────────────────────────────────────────────
def filter_marks_to_enrolled(
    inputs: Iterable[AttendanceMarkInput], allowed_student_ids: set[int]
) -> list[AttendanceMarkInput]:
    """Drop marks whose student isn't enrolled in the lesson's group — keeps
    the mark table consistent with the roster."""
    return [m for m in inputs if m.student_id in allowed_student_ids]
