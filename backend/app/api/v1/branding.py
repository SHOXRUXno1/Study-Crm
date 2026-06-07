import base64
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.schemas.auth import AuthUser
from app.schemas.branding import BrandingRead, BrandingUpdate
from app.services.admin_settings_service import get_branding, update_branding
from app.services.og_service import invalidate_branding_cache

_DEFAULT_LOGO = Path(__file__).resolve().parents[2] / "static" / "default-logo.svg"
_DATA_URI_RE = re.compile(r"^data:(image/[\w.+-]+);base64,(.+)$", re.DOTALL)

router = APIRouter(prefix="/branding", tags=["branding"])

_ALLOWED_LOGO_PREFIXES = (
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/svg+xml;base64,",
    "data:image/webp;base64,",
)


def _decode_logo_data_uri(data_uri: str) -> tuple[str, bytes]:
    match = _DATA_URI_RE.match(data_uri.strip())
    if not match:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid logo data URI")
    media_type, payload = match.group(1), match.group(2)
    try:
        return media_type, base64.b64decode(payload, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid logo base64") from exc


@router.get("/logo")
async def get_branding_logo(
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Public logo for og:image — no auth (Telegram/WhatsApp crawlers)."""
    response.headers["Cache-Control"] = "public, max-age=300"
    row = await get_branding(db)
    if row.brand_logo_base64:
        media_type, raw = _decode_logo_data_uri(row.brand_logo_base64)
        return Response(content=raw, media_type=media_type)
    return FileResponse(_DEFAULT_LOGO, media_type="image/svg+xml")


@router.get("", response_model=BrandingRead)
async def get_branding_public(
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — no auth required. Returns current branding settings."""
    response.headers["Cache-Control"] = "public, max-age=60"
    row = await get_branding(db)
    return BrandingRead.model_validate(row)


@router.patch("", response_model=BrandingRead)
async def update_branding_admin(
    payload: BrandingUpdate,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_current_admin),
):
    """Admin-only: update brand name and/or logo."""
    if payload.logo_set and payload.brand_logo_base64:
        if not any(payload.brand_logo_base64.startswith(p) for p in _ALLOWED_LOGO_PREFIXES):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "invalid_logo_type",
                    "message": "Logo must be a PNG, JPEG, SVG, or WebP image encoded as base64 data URI.",
                },
            )

    row = await update_branding(
        db,
        brand_name=payload.brand_name,
        brand_logo_base64=payload.brand_logo_base64,
        logo_set=payload.logo_set,
    )
    invalidate_branding_cache()
    return BrandingRead.model_validate(row)
