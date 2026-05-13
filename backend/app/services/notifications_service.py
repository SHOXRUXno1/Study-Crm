"""Notifications service.

Centralises *emission* (writes), *reads* (list / unread-count), *mutations*
(mark-read / delete), and the *lazy scanner* that produces derived alerts
(``debtor_overdue``, ``group_ending``, ``low_attendance``, ``open_conflicts``).

Design notes:

* One row per recipient (``recipient_subject`` + ``recipient_role``). The same
  logical event may produce several rows (admin, active managers where allowed,
  and the group teacher).
* ``dedup_key`` honours the partial-unique index ``uq_notifications_dedup``;
  duplicate inserts silently no-op via ``ON CONFLICT DO NOTHING``.
* Preferences (``notification_preferences``) toggle ``in_app`` per kind; if a
  user disables a kind, we simply skip the row for *that* recipient — admins
  / other teachers still get theirs.
* Emit is **never allowed to break the caller** — all writes happen on the
  same session, but errors are caught + logged.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable, Optional

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.attendance import Attendance
from app.models.group import Group
from app.models.lesson import Lesson
from app.models.notification import Notification
from app.models.notification_preference import NotificationPreference
from app.models.manager import Manager
from app.models.student import Student
from app.models.teacher import Teacher
from app.schemas.auth import AuthUser
from app.schemas.notification import (
    ALL_KINDS,
    ChannelPrefs,
    NotificationPreferencesRead,
    NotificationPreferencesUpdate,
)
from app.services.finance_service import compute_billing_many


logger = logging.getLogger(__name__)


# ── Constants ──────────────────────────────────────────────────────────────
ADMIN_AUDIENCE: tuple[str, str] = (settings.ADMIN_LOGIN, "admin")

# Per-user lazy scanner cooldown to avoid re-running expensive queries on every
# poll. In-memory; resets on process restart, which is fine for a single
# uvicorn worker.
_SCANNER_COOLDOWN = timedelta(minutes=5)
_last_scan_at: dict[tuple[str, str], datetime] = {}


# ── Real-time pub/sub bus ──────────────────────────────────────────────────
# Single-process in-memory broker. Each connected SSE client gets its own
# bounded asyncio.Queue keyed by (subject, role). Same user with multiple
# tabs → multiple queues, all receive the event. If a client falls behind
# (queue full) we drop the oldest event rather than blocking the publisher.
#
# NOTE: in-process means events do NOT cross workers. We currently run a
# single uvicorn worker; if scaling out, swap this for Redis pub/sub.

_QUEUE_MAXSIZE = 100
_subscribers: dict[tuple[str, str], set[asyncio.Queue]] = {}


def subscribe(subject: str, role: str) -> asyncio.Queue:
    """Create a queue and register it under ``(subject, role)``. The caller
    must invoke :func:`unsubscribe` (typically in a ``finally`` block)."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
    _subscribers.setdefault((subject, role), set()).add(queue)
    return queue


def unsubscribe(subject: str, role: str, queue: asyncio.Queue) -> None:
    bucket = _subscribers.get((subject, role))
    if not bucket:
        return
    bucket.discard(queue)
    if not bucket:
        _subscribers.pop((subject, role), None)


def _publish(audience: tuple[str, str], payload: dict[str, Any]) -> None:
    """Best-effort: drop on full queues, never raise."""
    bucket = _subscribers.get(audience)
    if not bucket:
        return
    for q in list(bucket):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            try:
                # Drop oldest, then push the new one.
                q.get_nowait()
                q.put_nowait(payload)
            except Exception:  # noqa: BLE001
                pass
        except Exception:  # noqa: BLE001
            logger.debug("publish to %s failed", audience, exc_info=True)


def _row_to_dict(row) -> dict[str, Any]:
    """Convert an INSERT ... RETURNING row to a JSON-friendly dict."""
    m = row._mapping
    def iso_utc(dt: Optional[datetime]) -> Optional[str]:
        if dt is None:
            return None
        normalized = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        return normalized.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    return {
        "id":         m["id"],
        "kind":       m["kind"],
        "severity":   m["severity"],
        "title":      m["title"],
        "body":       m["body"],
        "link":       m["link"],
        "payload":    m["payload"],
        "read_at":    iso_utc(m["read_at"]),
        "created_at": iso_utc(m["created_at"]),
    }


# ── Audience resolvers ─────────────────────────────────────────────────────
def audience_admin_only() -> list[tuple[str, str]]:
    """Admin login only — for events that must not go to managers (payments,
    student transfers with debt details, etc.)."""
    return [ADMIN_AUDIENCE]


async def _append_active_managers(db: AsyncSession, out: list[tuple[str, str]]) -> None:
    seen = set(out)
    q = (
        await db.execute(
            select(Manager.username)
            .where(Manager.is_active.is_(True))
            .where(Manager.username.is_not(None))
        )
    ).all()
    for (uname,) in q:
        if not uname:
            continue
        pair = (str(uname).lower(), "manager")
        if pair not in seen:
            out.append(pair)
            seen.add(pair)


async def audience_for_group(
    db: AsyncSession, group_id: Optional[int]
) -> list[tuple[str, str]]:
    """Admin + active managers + teacher of the group (if any has a username).

    Students are intentionally excluded: the cabinet does not surface
    notifications and the role has no client subscribed to the SSE stream.
    """
    out: list[tuple[str, str]] = [ADMIN_AUDIENCE]
    await _append_active_managers(db, out)
    if group_id is None:
        return out
    teacher_username = (
        await db.execute(
            select(Teacher.username)
            .join(Group, Group.teacher_id == Teacher.id)
            .where(Group.id == group_id)
            .where(Teacher.is_active.is_(True))
        )
    ).scalar_one_or_none()
    if teacher_username:
        out.append((teacher_username, "teacher"))
    return out


async def audience_for_student(
    db: AsyncSession, student_id: int, *, for_payment_event: bool = False
) -> list[tuple[str, str]]:
    """Admin + (unless ``for_payment_event``) active managers + the group's teacher.

    ``for_payment_event=True`` restricts recipients to admin + teacher so
    managers never receive explicit payment payloads.

    Students themselves are not part of the notification audience — see
    :func:`audience_for_group` for the rationale.
    """
    out: list[tuple[str, str]] = [ADMIN_AUDIENCE]
    if not for_payment_event:
        await _append_active_managers(db, out)
    teacher_username = (
        await db.execute(
            select(Teacher.username)
            .join(Group, Group.teacher_id == Teacher.id)
            .join(Student, Student.group_id == Group.id)
            .where(Student.id == student_id)
            .where(Teacher.is_active.is_(True))
        )
    ).scalar_one_or_none()
    if teacher_username:
        out.append((teacher_username, "teacher"))
    return out


# ── Preferences helpers ────────────────────────────────────────────────────
async def _get_prefs_blob(
    db: AsyncSession, *, subject: str, role: str
) -> NotificationPreferencesRead:
    row = (
        await db.execute(
            select(NotificationPreference)
            .where(NotificationPreference.user_subject == subject)
            .where(NotificationPreference.user_role == role)
        )
    ).scalar_one_or_none()
    if not row:
        return NotificationPreferencesRead()
    try:
        return NotificationPreferencesRead.model_validate(row.prefs or {})
    except Exception:  # noqa: BLE001 — fall back to defaults on bad blob
        logger.warning("Bad prefs blob for %s/%s; using defaults", subject, role)
        return NotificationPreferencesRead()


async def _kind_enabled_in_app(
    db: AsyncSession, *, subject: str, role: str, kind: str
) -> bool:
    prefs = await _get_prefs_blob(db, subject=subject, role=role)
    cp: ChannelPrefs = prefs.kinds.get(kind, ChannelPrefs())
    return bool(cp.in_app)


# ── Emit ───────────────────────────────────────────────────────────────────
async def emit(
    db: AsyncSession,
    *,
    kind: str,
    severity: str,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
    dedup_key: Optional[str] = None,
    audience: Iterable[tuple[str, str]],
) -> int:
    """Insert one row per recipient. Honour preferences + dedup_key.

    Wraps everything in try/except — domain callers must never crash because
    of notification side-effects. Returns the number of rows actually inserted.
    """
    inserted = 0
    try:
        for subject, role in audience:
            if not subject or not role:
                continue
            if not await _kind_enabled_in_app(
                db, subject=subject, role=role, kind=kind
            ):
                continue
            stmt = pg_insert(Notification.__table__).values(
                recipient_subject=subject,
                recipient_role=role,
                kind=kind,
                severity=severity,
                title=title,
                body=body,
                link=link,
                payload=payload,
                dedup_key=dedup_key,
            )
            # Dedup: silently no-op when partial unique index trips.
            if dedup_key is not None:
                stmt = stmt.on_conflict_do_nothing(
                    index_elements=["recipient_subject", "recipient_role", "dedup_key"],
                    index_where=Notification.__table__.c.dedup_key.isnot(None),
                )
            stmt = stmt.returning(Notification.__table__)
            res = await db.execute(stmt)
            row = res.fetchone()
            if row is None:
                # Conflict-suppressed (existing dedup_key); nothing to broadcast.
                continue
            inserted += 1
            # Real-time fan-out. We publish *now* — before the caller commits.
            # Worst case (transaction rollback): clients see a transient
            # notification that disappears on next list refresh. Acceptable
            # trade-off vs. the wiring complexity of post-commit hooks.
            _publish((subject, role), _row_to_dict(row))
        # Caller usually commits later; we don't commit here so emit can sit
        # inside a single transactional flow with the domain mutation.
    except Exception:  # noqa: BLE001
        logger.exception("notifications.emit failed (kind=%s)", kind)
    return inserted


# ── Reads ──────────────────────────────────────────────────────────────────
async def list_for(
    db: AsyncSession,
    *,
    user: AuthUser,
    only_unread: bool,
    kind: Optional[str],
    since: Optional[datetime],
    skip: int,
    limit: int,
) -> tuple[list[Notification], int, int]:
    """Return ``(items, total_for_filters, unread_total)`` for a user."""
    base = (
        select(Notification)
        .where(Notification.recipient_subject == user.login)
        .where(Notification.recipient_role == user.role)
    )
    if only_unread:
        base = base.where(Notification.read_at.is_(None))
    if kind:
        base = base.where(Notification.kind == kind)
    if since:
        base = base.where(Notification.created_at >= since)

    total = int(
        (
            await db.execute(
                select(func.count()).select_from(base.subquery())
            )
        ).scalar_one()
        or 0
    )

    rows = list(
        (
            await db.execute(
                base.order_by(Notification.created_at.desc())
                .offset(skip)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )

    unread = await unread_count(db, user=user)
    return rows, total, unread


async def unread_count(db: AsyncSession, *, user: AuthUser) -> int:
    return int(
        (
            await db.execute(
                select(func.count(Notification.id))
                .where(Notification.recipient_subject == user.login)
                .where(Notification.recipient_role == user.role)
                .where(Notification.read_at.is_(None))
            )
        ).scalar_one()
        or 0
    )


# ── Mutations ──────────────────────────────────────────────────────────────
async def mark_read(
    db: AsyncSession,
    *,
    user: AuthUser,
    ids: Optional[list[int]],
) -> int:
    """``ids=None`` → mark *all* unread as read."""
    base = (
        select(Notification)
        .where(Notification.recipient_subject == user.login)
        .where(Notification.recipient_role == user.role)
        .where(Notification.read_at.is_(None))
    )
    if ids is not None:
        if not ids:
            return 0
        base = base.where(Notification.id.in_(ids))

    rows = list((await db.execute(base)).scalars().all())
    if not rows:
        return 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for n in rows:
        n.read_at = now
    await db.flush()
    return len(rows)


async def delete_one(
    db: AsyncSession, *, user: AuthUser, notification_id: int
) -> bool:
    n = (
        await db.execute(
            select(Notification)
            .where(Notification.id == notification_id)
            .where(Notification.recipient_subject == user.login)
            .where(Notification.recipient_role == user.role)
        )
    ).scalar_one_or_none()
    if not n:
        return False
    await db.delete(n)
    await db.flush()
    return True


async def delete_all_read(db: AsyncSession, *, user: AuthUser) -> int:
    rows = list(
        (
            await db.execute(
                select(Notification)
                .where(Notification.recipient_subject == user.login)
                .where(Notification.recipient_role == user.role)
                .where(Notification.read_at.is_not(None))
            )
        )
        .scalars()
        .all()
    )
    for n in rows:
        await db.delete(n)
    if rows:
        await db.flush()
    return len(rows)


# ── Preferences API ────────────────────────────────────────────────────────
async def get_prefs(
    db: AsyncSession, *, user: AuthUser
) -> NotificationPreferencesRead:
    return await _get_prefs_blob(db, subject=user.login, role=user.role)


async def update_prefs(
    db: AsyncSession,
    *,
    user: AuthUser,
    patch: NotificationPreferencesUpdate,
) -> NotificationPreferencesRead:
    # Read-merge-write — we never expose the raw row.
    current = await _get_prefs_blob(db, subject=user.login, role=user.role)

    merged_kinds = dict(current.kinds)
    if patch.kinds is not None:
        for k, v in patch.kinds.items():
            merged_kinds[k] = v
    merged = NotificationPreferencesRead(
        kinds=merged_kinds,
        quiet_hours=patch.quiet_hours or current.quiet_hours,
        telegram_username=(
            patch.telegram_username
            if patch.telegram_username is not None
            else current.telegram_username
        ),
    )

    blob = merged.model_dump(mode="json")

    row = (
        await db.execute(
            select(NotificationPreference)
            .where(NotificationPreference.user_subject == user.login)
            .where(NotificationPreference.user_role == user.role)
        )
    ).scalar_one_or_none()
    if row:
        row.prefs = blob
    else:
        row = NotificationPreference(
            user_subject=user.login,
            user_role=user.role,
            prefs=blob,
        )
        db.add(row)
    await db.flush()
    return merged


# ── Lazy scanner ───────────────────────────────────────────────────────────
async def maybe_run_scanner(
    db: AsyncSession,
    *,
    user: AuthUser,
    today: Optional[date] = None,
) -> int:
    """Run derived-alert scanner if cooldown elapsed for this user.

    Returns the number of new rows inserted (0 if scanner was skipped or
    nothing changed). The scanner emits to **the same audience(s)** that
    would be relevant for each finding — so admin sees everything; a teacher
    sees only events for their groups.
    """
    # Cheap user-level scope check: only admin/teacher/manager trigger the (expensive)
    # derived-alert scanner. Students are passive recipients only.
    if user.role == "student":
        return 0

    key = (user.login, user.role)
    now = datetime.utcnow()
    last = _last_scan_at.get(key)
    if last is not None and (now - last) < _SCANNER_COOLDOWN:
        return 0
    _last_scan_at[key] = now

    today = today or date.today()
    inserted = 0
    try:
        inserted += await _scan_debtors(db, today=today)
        inserted += await _scan_group_ending(db, today=today)
        inserted += await _scan_low_attendance(db, today=today)
    except Exception:  # noqa: BLE001
        logger.exception("scanner failed")
    return inserted


async def _scan_debtors(db: AsyncSession, *, today: date) -> int:
    """Emit ``debtor_overdue`` for each student with overdue ≥ 7 days.

    dedup_key: ``debtor:{student_id}:{YYYY-MM}`` — at most one alert per
    student per calendar month.
    """
    students = list(
        (
            await db.execute(
                select(Student).where(Student.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    )
    group_ids = {s.group_id for s in students if s.group_id is not None}
    groups: dict[int, Group] = {}
    if group_ids:
        gq = await db.execute(select(Group).where(Group.id.in_(group_ids)))
        groups = {g.id: g for g in gq.scalars().all()}

    snaps = await compute_billing_many(db, students=students, groups_by_id=groups)
    students_by_id = {s.id: s for s in students}

    inserted = 0
    bucket = f"{today.year:04d}-{today.month:02d}"
    for sid, snap in snaps.items():
        if snap.debt_amount <= 0 or snap.overdue_days < 7:
            continue
        student = students_by_id.get(sid)
        if not student:
            continue
        severity = "critical" if snap.overdue_days >= 30 else "warning"
        audience = await audience_for_student(db, sid)
        title = f"Должник: {student.full_name}"
        body = f"{snap.overdue_days} дн. просрочки, долг {snap.debt_amount:,} UZS".replace(
            ",", " "
        )
        inserted += await emit(
            db,
            kind="debtor_overdue",
            severity=severity,
            title=title,
            body=body,
            link=f"/students/{sid}",
            payload={
                "student_id": sid,
                "debt_amount": snap.debt_amount,
                "overdue_days": snap.overdue_days,
            },
            dedup_key=f"debtor:{sid}:{bucket}",
            audience=audience,
        )
    return inserted


async def _scan_group_ending(db: AsyncSession, *, today: date) -> int:
    """Emit ``group_ending`` for groups ending in the next 14 days."""
    horizon = today + timedelta(days=14)
    rows = list(
        (
            await db.execute(
                select(Group)
                .where(Group.status == "active")
                .where(Group.end_date >= today)
                .where(Group.end_date <= horizon)
            )
        )
        .scalars()
        .all()
    )
    inserted = 0
    for g in rows:
        days_left = (g.end_date - today).days
        title = f"Группа {g.code} завершится через {days_left} дн."
        body = f"Конец занятий: {g.end_date.isoformat()}"
        audience = await audience_for_group(db, g.id)
        inserted += await emit(
            db,
            kind="group_ending",
            severity="info",
            title=title,
            body=body,
            link=f"/groups/{g.id}",
            payload={"group_id": g.id, "end_date": g.end_date.isoformat()},
            dedup_key=f"group_ending:{g.id}:{g.end_date.isoformat()}",
            audience=audience,
        )
    return inserted


async def _scan_low_attendance(db: AsyncSession, *, today: date) -> int:
    """Emit ``low_attendance`` for groups with rate < 70% over last 30 days
    (requires ≥ 10 marks to be statistically meaningful)."""
    since = today - timedelta(days=30)
    rows = list(
        (
            await db.execute(
                select(
                    Group.id,
                    Group.code,
                    func.count(Attendance.id).label("total"),
                    func.sum(
                        case(
                            (Attendance.status.in_(("present", "late")), 1),
                            else_=0,
                        )
                    ).label("ok"),
                )
                .select_from(Attendance)
                .join(Lesson, Attendance.lesson_id == Lesson.id)
                .join(Group, Lesson.group_id == Group.id)
                .where(Lesson.lesson_date >= since)
                .where(Lesson.lesson_date <= today)
                .where(~Lesson.status.in_(("cancelled", "rescheduled")))
                .where(Group.status == "active")
                .group_by(Group.id, Group.code)
                .having(func.count(Attendance.id) >= 10)
            )
        ).all()
    )
    inserted = 0
    bucket = f"{today.year:04d}-{today.month:02d}"
    for gid, code, total, ok in rows:
        total = int(total or 0)
        ok = int(ok or 0)
        if total < 10:
            continue
        rate = (ok * 100) // total if total else 0
        if rate >= 70:
            continue
        title = f"Низкая посещаемость: {code} ({rate}%)"
        body = f"{ok}/{total} отметок за последние 30 дней"
        audience = await audience_for_group(db, int(gid))
        inserted += await emit(
            db,
            kind="low_attendance",
            severity="warning",
            title=title,
            body=body,
            link=f"/journal?group={gid}",
            payload={"group_id": int(gid), "rate_pct": rate},
            dedup_key=f"low_attn:{gid}:{bucket}",
            audience=audience,
        )
    return inserted
