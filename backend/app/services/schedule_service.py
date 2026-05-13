"""Schedule materialisation service.

Generates concrete `Lesson` rows from a `Group`'s recurring template
(`days` + `start_time` / `end_time`). The contract is intentionally simple:

    sync_future_lessons(db, group)
        ↳ Wipes only future SCHEDULED lessons of this group, then re-creates
          them according to the current group state. Past lessons and rows in
          a non-`scheduled` status (cancelled / completed / rescheduled) are
          kept untouched — they're history.

This means an admin can freely change a group's days/time/teacher/room and the
schedule reflects the new state going forward, while the journal of what
actually happened stays intact.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group import Group
from app.models.lesson import Lesson


# Mon=0, Tue=1, …, Sat=5, Sun=6
WEEKDAY_MAP: dict[str, tuple[int, ...]] = {
    "odd": (0, 2, 4),
    "even": (1, 3, 5),
}

_ACTIVE_GROUP_STATUSES = ("active",)


async def sync_future_lessons(
    db: AsyncSession,
    group: Group,
    *,
    today: Optional[date] = None,
) -> int:
    """Re-materialise future lessons for `group`.

    Returns the number of lessons inserted. Caller is responsible for the
    surrounding commit.
    """
    today = today or date.today()

    # 1. Wipe future scheduled lessons of this group.
    await db.execute(
        delete(Lesson)
        .where(Lesson.group_id == group.id)
        .where(Lesson.lesson_date >= today)
        .where(Lesson.status == "scheduled")
    )

    # 2. If the group is completed — stop.
    if group.status not in _ACTIVE_GROUP_STATUSES:
        return 0

    weekdays = WEEKDAY_MAP.get(group.days, ())
    if not weekdays:
        return 0
    if group.end_date < group.start_date:
        return 0

    # 3. Generate from max(start_date, today) → end_date.
    cur = max(group.start_date, today)
    end = group.end_date
    rows: list[Lesson] = []
    while cur <= end:
        if cur.weekday() in weekdays:
            rows.append(
                Lesson(
                    group_id=group.id,
                    teacher_id=group.teacher_id,
                    room_id=group.room_id,
                    lesson_date=cur,
                    start_time=group.start_time,
                    end_time=group.end_time,
                    status="scheduled",
                )
            )
        cur += timedelta(days=1)

    if rows:
        db.add_all(rows)
    await db.flush()
    return len(rows)
