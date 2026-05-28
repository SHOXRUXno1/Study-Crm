from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.schemas.auth import AuthUser
from app.schemas.branding import BrandingRead, BrandingUpdate
from app.services.admin_settings_service import get_branding, update_branding

router = APIRouter(prefix="/branding", tags=["branding"])

_ALLOWED_LOGO_PREFIXES = (
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/svg+xml;base64,",
    "data:image/webp;base64,",
)


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
    return BrandingRead.model_validate(row)
