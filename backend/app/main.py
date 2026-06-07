from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.limiter import limiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, get_db
from app.api.v1.router import api_router
from app.services.admin_settings_service import get_or_create_settings
from app.services.og_service import preload_index_template, render_spa_index


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncSessionLocal() as db:
        await get_or_create_settings(db, settings.ADMIN_PASSWORD)
    await preload_index_template()
    yield


app = FastAPI(
    title="IELTS Imperia API",
    version="0.1.0",
    # Disable interactive docs in production — they expose the full API surface
    # to anyone who can reach the host. In development they remain available at
    # /docs and /redoc as usual.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "ok"}


# SPA shell with dynamic Open Graph tags for link previews.
# Nginx proxies non-static routes here; /assets stay on nginx.
@app.get("/{full_path:path}", include_in_schema=False, response_class=HTMLResponse)
async def spa_index(
    full_path: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if full_path.startswith("api/") or full_path in {"health", "docs", "redoc", "openapi.json"}:
        raise HTTPException(status_code=404, detail="Not Found")

    try:
        html = await render_spa_index(db, request)
    except RuntimeError:
        raise HTTPException(
            status_code=503,
            detail="SPA index template is not available yet",
        ) from None
    return HTMLResponse(
        content=html,
        headers={"Cache-Control": "no-cache"},
    )
