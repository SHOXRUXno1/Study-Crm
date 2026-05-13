# Study Center

Monorepo: FastAPI backend + React (Vite) frontend, PostgreSQL.
Local development is a single `docker compose up` away.

## Stack

| Layer    | Tech                                                  |
| -------- | ----------------------------------------------------- |
| Frontend | React 18, Vite 5, TypeScript, Tailwind, shadcn/Radix  |
| Backend  | FastAPI, SQLAlchemy 2.0 (async), asyncpg, Alembic     |
| Database | PostgreSQL 16                                         |
| Runtime  | Docker (multi-stage, non-root), nginx, docker compose |
| CI       | GitHub Actions: lint + tests + GHCR image publish     |

## Quick start (local, with Docker)

```bash
cp .env.example .env       # edit if you want
docker compose up --build  # builds images and starts the stack
```

Then open:

- App: http://localhost:8080
- API health: http://localhost:8080/api/health (proxied through nginx) and http://localhost:8000/health (direct)
- API docs: http://localhost:8000/docs

The first run takes a couple of minutes (npm install + pip install). Subsequent runs are cached.

## What runs

```
frontend (nginx, :8080) ──/api──▶ backend (uvicorn, :8000) ──▶ db (postgres:16, :5432)
                                       │
                                       └── named volumes: uploads/, pgdata/
```

- `db` — Postgres with healthcheck, data persisted in the `pgdata` volume.
- `backend` — runs `alembic upgrade head` on startup, then `uvicorn`. Has `/health`. Files persisted in `uploads` volume.
- `frontend` — built with Vite, served by nginx. Proxies `/api/*` to `backend:8000`.

## Local development without Docker

If you prefer venv/npm directly, see [`backend/README.md`](backend/README.md) and run `npm run dev` in `frontend/` (Vite proxies `/api` to `http://127.0.0.1:8000`).

## CI / images

- On every push / PR — `.github/workflows/ci.yml` runs frontend lint + tests + build, and backend pytest.
- On push to `main` — `.github/workflows/release.yml` builds and publishes images to GHCR:
  - `ghcr.io/<owner>/<repo>/backend:latest` and `:sha-<short>`
  - `ghcr.io/<owner>/<repo>/frontend:latest` and `:sha-<short>`

## Production notes

- Set `ENV=production`, real `SECRET_KEY`, real `ADMIN_PASSWORD`, real `DATABASE_URL` — backend refuses to start with dev defaults (see [`backend/app/core/config.py`](backend/app/core/config.py)).
- Put a TLS reverse proxy (Caddy / Traefik / nginx) in front of port `8080`.
- Mount real volumes for `pgdata` and `uploads` (or use a managed Postgres).
