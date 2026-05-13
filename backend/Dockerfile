# syntax=docker/dockerfile:1.7
# ============================================================
# Stage 1: builder — compiles wheels, keeps build tools out of
# the final image. Uses BuildKit cache mounts for fast rebuilds.
# ============================================================
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt .

RUN --mount=type=cache,target=/root/.cache/pip \
    pip wheel --wheel-dir /wheels -r requirements.txt

# ============================================================
# Stage 2: runtime — slim, non-root, healthcheck, signal-safe.
# ============================================================
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    ENV=production \
    UPLOAD_DIR=/app/uploads

# tini = proper PID 1 (zombie reaping, SIGTERM passthrough).
# curl  = used by HEALTHCHECK to hit /health.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 app \
    && useradd --system --uid 1001 --gid app --home /app --shell /usr/sbin/nologin app

WORKDIR /app

COPY --from=builder /wheels /wheels
COPY requirements.txt ./
RUN pip install --no-deps /wheels/* && rm -rf /wheels

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint
# Defensive: strip CRLF so the script runs even if checked out on Windows
# without our .gitattributes normalization (env would otherwise look for "sh\r").
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint \
    && chmod +x /usr/local/bin/docker-entrypoint \
    && mkdir -p /app/uploads \
    && chown -R app:app /app

USER app

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
    CMD curl -fsS http://localhost:8000/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
