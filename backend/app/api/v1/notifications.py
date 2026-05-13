"""Notifications API.

Available to **admin, teacher, and manager** sessions; rows are scoped by
``recipient_subject + recipient_role`` so each principal only ever sees their
own inbox. Lazy scanner runs at most once per ``_SCANNER_COOLDOWN`` per user.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import get_current_user
from app.core.security import decode_token
from app.models.manager import Manager
from app.models.teacher import Teacher
from app.schemas.auth import AuthUser
from app.schemas.notification import (
    MarkReadResponse,
    NotificationListResponse,
    NotificationPreferencesRead,
    NotificationPreferencesUpdate,
    NotificationRead,
    UnreadCount,
)
from app.services import notifications_service as svc
from app.services.session_service import get_active_session_by_jti


logger = logging.getLogger(__name__)


router = APIRouter(prefix="/notifications", tags=["notifications"])


def _ensure_not_student(user: AuthUser) -> None:
    """In-app notifications are for staff (admin / teacher / manager)."""
    if user.role == "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


class MarkReadPayload(BaseModel):
    """``ids=None`` → mark all unread for the current user as read."""

    ids: Optional[list[int]] = None


# ── Reads ──────────────────────────────────────────────────────────────────
@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    only_unread: bool = Query(False),
    kind: Optional[str] = Query(None),
    since: Optional[datetime] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    _ensure_not_student(user)
    if since and since.tzinfo is not None:
        # DB stores naive UTC-style timestamps, so normalize incoming aware
        # values to the same basis before filtering.
        since = since.astimezone(timezone.utc).replace(tzinfo=None)
    # Lazy scanner. Inserts new rows (if any) inside this transaction; commit
    # below picks them up so they appear in the very same response.
    scanner_inserted = await svc.maybe_run_scanner(db, user=user)
    if scanner_inserted:
        await db.commit()

    items, total, unread = await svc.list_for(
        db,
        user=user,
        only_unread=only_unread,
        kind=kind,
        since=since,
        skip=skip,
        limit=limit,
    )
    return NotificationListResponse(
        items=[NotificationRead.model_validate(n) for n in items],
        total=total,
        unread=unread,
    )


@router.get("/unread-count", response_model=UnreadCount)
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    _ensure_not_student(user)
    return UnreadCount(unread=await svc.unread_count(db, user=user))


# ── Mutations ──────────────────────────────────────────────────────────────
@router.post("/mark-read", response_model=MarkReadResponse)
async def mark_read(
    payload: Optional[MarkReadPayload] = Body(None),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    _ensure_not_student(user)
    ids = payload.ids if payload is not None else None
    updated = await svc.mark_read(db, user=user, ids=ids)
    await db.commit()
    return MarkReadResponse(updated=updated)


@router.delete("/read", status_code=status.HTTP_204_NO_CONTENT)
async def delete_read(
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    _ensure_not_student(user)
    await svc.delete_all_read(db, user=user)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    _ensure_not_student(user)
    ok = await svc.delete_one(db, user=user, notification_id=notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Preferences ────────────────────────────────────────────────────────────
@router.get("/preferences", response_model=NotificationPreferencesRead)
async def get_preferences(
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    _ensure_not_student(user)
    return await svc.get_prefs(db, user=user)


@router.put("/preferences", response_model=NotificationPreferencesRead)
async def update_preferences(
    patch: NotificationPreferencesUpdate,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    _ensure_not_student(user)
    merged = await svc.update_prefs(db, user=user, patch=patch)
    await db.commit()
    return merged


# ── Real-time stream (SSE) ─────────────────────────────────────────────────


async def _resolve_user_from_token(token: str) -> AuthUser:
    """Mirror :func:`app.core.deps.get_current_user` for token-only auth.

    EventSource cannot send ``Authorization: Bearer`` headers, so the SSE
    endpoint authenticates via ``?token=`` query parameter. We re-validate
    the JWT, the active session, and (for teachers) the Teacher row.
    """
    payload = decode_token(token)
    sub = payload.get("sub")
    jti = payload.get("jti")
    role = payload.get("role")
    if not sub or not jti or not role:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    async with AsyncSessionLocal() as db:
        session = await get_active_session_by_jti(db, jti)
        if not session:
            raise HTTPException(status_code=401, detail="Session revoked or expired")

        if role == "admin":
            if sub != settings.ADMIN_LOGIN:
                raise HTTPException(status_code=401, detail="Invalid credentials")
            return AuthUser(login=settings.ADMIN_LOGIN, role="admin")

        if role == "teacher":
            tid_raw = payload.get("tid")
            if tid_raw is None:
                raise HTTPException(status_code=401, detail="Invalid credentials")
            try:
                tid_int = int(tid_raw)
            except (TypeError, ValueError):
                raise HTTPException(status_code=401, detail="Invalid credentials")
            teacher = await db.get(Teacher, tid_int)
            if (
                not teacher
                or not teacher.is_active
                or not teacher.username
                or teacher.username != sub
            ):
                raise HTTPException(status_code=401, detail="Account disabled")
            full_name = " ".join(
                p for p in (teacher.last_name, teacher.first_name, teacher.middle_name) if p
            )
            return AuthUser(
                login=teacher.username,
                role="teacher",
                id=teacher.id,
                name=full_name or teacher.username,
            )

        if role == "student":
            # Students do not subscribe to the SSE stream; reject explicitly so
            # the client never silently keeps a doomed connection open.
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        if role == "manager":
            mid_raw = payload.get("mid")
            if mid_raw is None:
                raise HTTPException(status_code=401, detail="Invalid credentials")
            try:
                mid_int = int(mid_raw)
            except (TypeError, ValueError):
                raise HTTPException(status_code=401, detail="Invalid credentials")
            manager = await db.get(Manager, mid_int)
            if (
                not manager
                or not manager.is_active
                or not manager.username
                or manager.username != sub
            ):
                raise HTTPException(status_code=401, detail="Account disabled")
            full_name = " ".join(
                p for p in (manager.last_name, manager.first_name, manager.middle_name) if p
            )
            return AuthUser(
                login=manager.username,
                role="manager",
                id=manager.id,
                name=full_name or manager.username,
            )

    raise HTTPException(status_code=401, detail="Invalid credentials")


@router.get("/stream")
async def stream_notifications(
    request: Request,
    token: str = Query(..., description="JWT access token"),
):
    """Server-Sent Events stream of new notifications for the current user.

    Wire format:
    * ``event: ready``        — initial handshake (data: ``{}``)
    * ``event: notification`` — fired for each new notification matching the
                                authenticated user's ``(subject, role)``.
                                ``data`` is the same shape as ``NotificationRead``.
    * ``: ping``              — comment line every 25 s to keep the connection
                                alive through proxies. Browsers ignore comments.

    Auth: JWT in ``?token=`` (EventSource cannot send ``Authorization``
    headers natively). Token expiry while connected does not close the
    stream; clients reload to refresh credentials.
    """
    user = await _resolve_user_from_token(token)
    queue = svc.subscribe(user.login, user.role)

    async def event_stream() -> AsyncIterator[bytes]:
        # Greet the client so the EventSource ``onopen`` fires reliably and
        # we know the connection is live (some browsers buffer until first
        # bytes arrive).
        yield b"event: ready\ndata: {}\n\n"
        try:
            while True:
                if await request.is_disconnected():
                    return
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=25.0)
                except asyncio.TimeoutError:
                    yield b": ping\n\n"
                    continue
                except asyncio.CancelledError:
                    return
                try:
                    body = json.dumps(payload, ensure_ascii=False, default=str)
                except Exception:  # noqa: BLE001
                    logger.warning("notification payload not JSON-serialisable", exc_info=True)
                    continue
                yield f"event: notification\ndata: {body}\n\n".encode("utf-8")
        finally:
            svc.unsubscribe(user.login, user.role, queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # disable nginx buffering if behind one
            "Connection": "keep-alive",
        },
    )
