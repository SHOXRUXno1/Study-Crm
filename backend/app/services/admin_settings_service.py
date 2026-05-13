from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_settings import AdminSettings
from app.core.security import hash_password


async def get_or_create_settings(db: AsyncSession, default_password: str) -> AdminSettings:
    result = await db.execute(select(AdminSettings).where(AdminSettings.id == 1))
    row = result.scalar_one_or_none()
    if row is None:
        row = AdminSettings(id=1, password_hash=hash_password(default_password))
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def update_profile(
    db: AsyncSession,
    *,
    first_name: str | None,
    last_name: str | None,
    middle_name: str | None,
    phone: str | None,
    avatar_base64: str | None,
    avatar_set: bool,
) -> AdminSettings:
    result = await db.execute(select(AdminSettings).where(AdminSettings.id == 1))
    row = result.scalar_one()
    row.first_name = first_name
    row.last_name = last_name
    row.middle_name = middle_name
    row.phone = phone
    if avatar_set:
        row.avatar_base64 = avatar_base64
    await db.commit()
    await db.refresh(row)
    return row


async def update_password(db: AsyncSession, new_plain_password: str) -> None:
    result = await db.execute(select(AdminSettings).where(AdminSettings.id == 1))
    row = result.scalar_one()
    row.password_hash = hash_password(new_plain_password)
    await db.commit()
