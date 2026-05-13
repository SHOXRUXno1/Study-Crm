from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.api.v1.router import api_router
from app.services.admin_settings_service import get_or_create_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncSessionLocal() as db:
        await get_or_create_settings(db, settings.ADMIN_PASSWORD)
    yield


app = FastAPI(
    title="IELTS Imperia API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

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
