import os
import warnings
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

# Sentinel values that must NEVER reach production. We treat them as "missing".
_INSECURE_SECRETS = {
    "change-me-to-random-string",
    "change-me",
    "secret",
    "",
}
_INSECURE_PASSWORDS = {"admin123", "admin", "password", ""}

RECEIPT_ALLOWED_MIMES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/heic",
    "image/gif",
    "application/pdf",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Dev defaults — convenient for local work, but rejected outside ENV=development.
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ielts_imperia"
    SECRET_KEY: str = "change-me-to-random-string"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    DEFAULT_PREPAY_HORIZON_MONTHS: int = 12
    CORS_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174,"
        "http://localhost:8080,http://127.0.0.1:8080"
    )
    ADMIN_LOGIN: str = "admin"
    ADMIN_PASSWORD: str = "admin123"
    UPLOAD_DIR: str = "uploads"
    RECEIPT_MAX_SIZE_MB: int = 10
    RECEIPT_MAX_FILES_PER_PAYMENT: int = 5

    # Tells the app whether dev defaults are tolerated.
    # Production / staging deployments must set ENV=production explicitly.
    ENV: str = "development"

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() in {"production", "prod", "staging"}

    def validate_security(self) -> None:
        """Fail-fast: in production reject insecure dev defaults.

        In development emit a warning so dev never thinks the defaults are safe.
        """
        problems: list[str] = []
        if self.SECRET_KEY in _INSECURE_SECRETS:
            problems.append("SECRET_KEY is set to an insecure default")
        if self.ADMIN_PASSWORD in _INSECURE_PASSWORDS:
            problems.append("ADMIN_PASSWORD is set to an insecure default")
        if not self.DATABASE_URL or "postgres:postgres@localhost" in self.DATABASE_URL:
            problems.append("DATABASE_URL is missing or uses local dev credentials")

        if not problems:
            return

        if self.is_production:
            joined = "; ".join(problems)
            raise RuntimeError(
                f"Refusing to start in production with insecure config: {joined}. "
                "Set SECRET_KEY, ADMIN_PASSWORD and DATABASE_URL via environment variables."
            )
        # Dev: just warn so it's visible in the uvicorn log.
        for p in problems:
            warnings.warn(f"[security] {p}", stacklevel=2)


settings = Settings()
# Reads ENV from os.environ first (BaseSettings already does), then validates.
settings.validate_security()
