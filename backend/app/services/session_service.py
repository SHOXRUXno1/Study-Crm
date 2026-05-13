import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from user_agents import parse as parse_ua
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import Session


def generate_jti() -> str:
    return uuid.uuid4().hex


def parse_user_agent(ua_string: str | None) -> dict:
    if not ua_string:
        return {"device_type": None, "os_name": None, "browser_name": None}
    ua = parse_ua(ua_string)
    if ua.is_mobile:
        device_type = "mobile"
    elif ua.is_tablet:
        device_type = "tablet"
    else:
        device_type = "desktop"
    return {
        "device_type": device_type,
        "os_name": ua.os.family or None,
        "browser_name": ua.browser.family or None,
    }


async def lookup_ip_location(ip: str | None) -> dict:
    """Бесплатный ipapi.co (1000/day). Если недоступен — возвращает пустые поля."""
    result = {"city": None, "country": None}
    if not ip:
        return result
    # Пропускаем локальные адреса
    if (
        ip.startswith("127.")
        or ip == "localhost"
        or ip.startswith("192.168.")
        or ip.startswith("10.")
        or ip == "::1"
    ):
        return result
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"https://ipapi.co/{ip}/json/")
            if resp.status_code == 200:
                data = resp.json()
                result["city"] = data.get("city")
                result["country"] = data.get("country_name")
    except Exception:
        pass
    return result


async def create_session(
    db: AsyncSession,
    *,
    jti: str,
    user_agent: str | None,
    ip_address: str | None,
    subject: str,
    role: str,
) -> Session:
    ua_info = parse_user_agent(user_agent)
    geo = await lookup_ip_location(ip_address)
    now = datetime.now(timezone.utc)
    session = Session(
        jti=jti,
        subject=subject,
        role=role,
        user_agent=user_agent[:500] if user_agent else None,
        ip_address=ip_address,
        last_active_at=now,
        **ua_info,
        **geo,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def get_active_session_by_jti(db: AsyncSession, jti: str) -> Optional[Session]:
    result = await db.execute(
        select(Session).where(Session.jti == jti, Session.revoked_at.is_(None))
    )
    return result.scalar_one_or_none()


TOUCH_DEBOUNCE_SECONDS = 30


async def touch_session(db: AsyncSession, session: Session) -> None:
    """Update session.last_active_at, but at most once every TOUCH_DEBOUNCE_SECONDS.

    Without debouncing this commits on every authenticated request, which is a
    huge write amplification (login → 1 commit per API hit). With debouncing we
    keep "last activity" usefully fresh while collapsing burst traffic.
    """
    now = datetime.now(timezone.utc)
    last = session.last_active_at
    if last is not None:
        # Compare in UTC. If the column is naïve (legacy data), assume UTC.
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if (now - last).total_seconds() < TOUCH_DEBOUNCE_SECONDS:
            return
    session.last_active_at = now
    await db.commit()


async def list_active_sessions(
    db: AsyncSession, *, subject: str, role: str
) -> list[Session]:
    """Sessions owned by the given user (subject + role pair)."""
    result = await db.execute(
        select(Session)
        .where(
            Session.revoked_at.is_(None),
            Session.subject == subject,
            Session.role == role,
        )
        .order_by(Session.last_active_at.desc())
    )
    return list(result.scalars().all())


async def revoke_session(
    db: AsyncSession,
    session_id: int,
    *,
    subject: str | None = None,
    role: str | None = None,
) -> bool:
    """Revoke by id; if subject+role provided, only owner can revoke."""
    stmt = (
        update(Session)
        .where(Session.id == session_id, Session.revoked_at.is_(None))
    )
    if subject is not None and role is not None:
        stmt = stmt.where(Session.subject == subject, Session.role == role)
    stmt = stmt.values(revoked_at=datetime.now(timezone.utc))
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount > 0


async def revoke_all_except(
    db: AsyncSession, except_jti: str, *, subject: str, role: str
) -> int:
    result = await db.execute(
        update(Session)
        .where(
            Session.jti != except_jti,
            Session.revoked_at.is_(None),
            Session.subject == subject,
            Session.role == role,
        )
        .values(revoked_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return result.rowcount
