"""Open Graph HTML rendering for SPA link previews (Telegram, WhatsApp, etc.)."""

from __future__ import annotations

import html
import time
from dataclasses import dataclass
from pathlib import Path

import httpx
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.admin_settings_service import get_branding

DEFAULT_TITLE = "Study Center"
DEFAULT_DESCRIPTION_SUFFIX = "система управления учебным центром"

# In-memory caches
_branding_cache: tuple[float, str | None] | None = None
_index_template: str | None = None
_index_template_loaded_at: float = 0.0

BRANDING_CACHE_TTL = 300  # 5 minutes
INDEX_TEMPLATE_TTL = 3600  # 1 hour — asset hashes change only on redeploy


@dataclass(frozen=True)
class OgMeta:
    title: str
    description: str
    image_url: str


def invalidate_branding_cache() -> None:
    global _branding_cache
    _branding_cache = None


def _public_base_url(request: Request) -> str:
    if settings.PUBLIC_BASE_URL:
        return settings.PUBLIC_BASE_URL.rstrip("/")
    forwarded_proto = request.headers.get("x-forwarded-proto")
    forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if forwarded_proto and forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}".rstrip("/")
    return str(request.base_url).rstrip("/")


async def _load_index_template() -> str:
    """Fetch built index.html from the frontend container (or local fallback)."""
    global _index_template, _index_template_loaded_at

    now = time.time()
    if _index_template and (now - _index_template_loaded_at) < INDEX_TEMPLATE_TTL:
        return _index_template

    sources: list[str] = []
    if settings.FRONTEND_INTERNAL_URL:
        sources.append(f"{settings.FRONTEND_INTERNAL_URL.rstrip('/')}/index.html")

    local_path = Path(settings.STATIC_INDEX_PATH)
    if local_path.is_file():
        _index_template = local_path.read_text(encoding="utf-8")
        _index_template_loaded_at = now
        return _index_template

    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=10.0) as client:
        for url in sources:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                _index_template = resp.text
                _index_template_loaded_at = now
                return _index_template
            except Exception as exc:  # noqa: BLE001 — try next source
                last_error = exc

    if _index_template:
        return _index_template

    raise RuntimeError(
        f"Could not load SPA index.html template (tried: {sources!r})"
    ) from last_error


async def preload_index_template() -> None:
    """Called on app startup so the first user/crawler request is fast."""
    try:
        await _load_index_template()
    except Exception:
        # Non-fatal — template may load on first SPA request after frontend is up.
        pass


async def _get_brand_name(db: AsyncSession) -> str | None:
    global _branding_cache

    now = time.time()
    if _branding_cache and (now - _branding_cache[0]) < BRANDING_CACHE_TTL:
        return _branding_cache[1]

    row = await get_branding(db)
    name = (row.brand_name or "").strip() or None
    _branding_cache = (now, name)
    return name


async def build_og_meta(db: AsyncSession, request: Request) -> OgMeta:
    brand_name = await _get_brand_name(db)
    title = brand_name or DEFAULT_TITLE
    description = f"{title} — {DEFAULT_DESCRIPTION_SUFFIX}"
    base = _public_base_url(request)
    image_url = f"{base}/api/v1/branding/logo"
    return OgMeta(title=title, description=description, image_url=image_url)


def _substitute_placeholders(template: str, og: OgMeta) -> str:
    return (
        template.replace("__OG_TITLE__", html.escape(og.title, quote=True))
        .replace("__OG_DESCRIPTION__", html.escape(og.description, quote=True))
        .replace("__OG_IMAGE__", html.escape(og.image_url, quote=True))
    )


async def render_spa_index(db: AsyncSession, request: Request) -> str:
    template = await _load_index_template()
    og = await build_og_meta(db, request)
    return _substitute_placeholders(template, og)
