"""Group schedule conflict detection.

Two active groups conflict when ALL of the following hold:

1. Same ``days`` value (``odd``/``even`` are mutually exclusive by design,
   so this collapses to an equality check).
2. Their ``[start_date..end_date]`` windows intersect.
3. Their ``[start_time..end_time]`` windows intersect strictly
   (touching boundaries — e.g. 10:30/10:30 — are NOT a conflict).
4. They share a resource: same ``room_id`` (room conflict)
   OR same ``teacher_id`` (teacher conflict). Both must be non-NULL.

The service runs at the application level on top of plain SELECTs.
A single conflicting peer can produce up to two hits if it collides on
both the teacher AND the room — that is intentional, the UI shows both
reasons separately.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time, timedelta
from typing import Literal, Optional

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.group import Group


ConflictKind = Literal["teacher", "room"]


@dataclass(frozen=True)
class ConflictHit:
    kind: ConflictKind
    group_id: int
    group_code: str
    teacher_name: Optional[str]
    room_name: Optional[str]
    days: str
    start_time: time
    end_time: time
    start_date: date
    end_date: date
    overlap_start: date
    overlap_end: date


def _hit_from_group(
    g: Group,
    *,
    kind: ConflictKind,
    window_start: date,
    window_end: date,
) -> ConflictHit:
    overlap_start = max(g.start_date, window_start)
    overlap_end = min(g.end_date, window_end)
    return ConflictHit(
        kind=kind,
        group_id=g.id,
        group_code=g.code,
        teacher_name=g.teacher_name,
        room_name=g.room_name,
        days=g.days,
        start_time=g.start_time,
        end_time=g.end_time,
        start_date=g.start_date,
        end_date=g.end_date,
        overlap_start=overlap_start,
        overlap_end=overlap_end,
    )


async def find_group_conflicts(
    db: AsyncSession,
    *,
    days: str,
    start_time: time,
    end_time: time,
    start_date: date,
    end_date: date,
    teacher_id: Optional[int],
    room_id: Optional[int],
    exclude_group_id: Optional[int] = None,
    today: Optional[date] = None,
) -> list[ConflictHit]:
    """Return all active groups that collide with the proposed slot.

    The function performs at most two SELECTs (one per resource); each
    one short-circuits to ``[]`` when its resource is ``None``.
    Caller is responsible for ordering the result if presentation cares.

    ``today`` is taken as a parameter purely for testability — the call
    sites pass ``date.today()``. The defensive ``end_date >= today`` guard
    skips ghost rows that are still labelled ``active`` but whose date
    window has already closed (status-drift safety net).
    """
    if teacher_id is None and room_id is None:
        return []

    today = today or date.today()

    base = (
        select(Group)
        .where(Group.status == "active")
        .where(Group.end_date >= today)
        .where(Group.days == days)
        .where(Group.start_date <= end_date)
        .where(Group.end_date >= start_date)
        .where(Group.start_time < end_time)
        .where(Group.end_time > start_time)
    )
    if exclude_group_id is not None:
        base = base.where(Group.id != exclude_group_id)

    hits: list[ConflictHit] = []

    if teacher_id is not None:
        rows = (
            await db.execute(base.where(Group.teacher_id == teacher_id))
        ).scalars().all()
        for g in rows:
            hits.append(
                _hit_from_group(
                    g,
                    kind="teacher",
                    window_start=start_date,
                    window_end=end_date,
                )
            )

    if room_id is not None:
        rows = (
            await db.execute(base.where(Group.room_id == room_id))
        ).scalars().all()
        for g in rows:
            hits.append(
                _hit_from_group(
                    g,
                    kind="room",
                    window_start=start_date,
                    window_end=end_date,
                )
            )

    hits.sort(key=lambda h: (h.start_date, h.start_time, h.kind, h.group_id))
    return hits


async def count_open_conflicts(
    db: AsyncSession,
    *,
    today: Optional[date] = None,
    days_ahead: int = 14,
) -> int:
    """Number of currently colliding *pairs* of active groups whose date
    windows intersect ``[today, today + days_ahead]``.

    A pair is counted at most once even if it conflicts on both teacher and
    room. We do a single self-join with ``a.id < b.id`` to keep the result
    a stable set of pairs.
    """
    today = today or date.today()
    horizon = today + timedelta(days=days_ahead)

    a = aliased(Group)
    b = aliased(Group)

    same_resource = or_(
        and_(a.teacher_id.is_not(None), a.teacher_id == b.teacher_id),
        and_(a.room_id.is_not(None), a.room_id == b.room_id),
    )

    stmt = (
        select(a.id)
        .join(
            b,
            and_(
                a.id < b.id,
                a.days == b.days,
                a.start_date <= b.end_date,
                a.end_date >= b.start_date,
                a.start_time < b.end_time,
                a.end_time > b.start_time,
                same_resource,
            ),
        )
        .where(a.status == "active")
        .where(b.status == "active")
        .where(a.end_date >= today)
        .where(b.end_date >= today)
        .where(a.start_date <= horizon)
        .where(b.start_date <= horizon)
    )

    rows = (await db.execute(stmt)).all()
    return len(rows)
