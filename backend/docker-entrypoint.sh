#!/usr/bin/env sh
# Run DB migrations before starting the app server.
# Fails fast if migrations fail so the container is restarted by Docker / k8s.
set -eu

echo "[entrypoint] alembic upgrade head"
alembic upgrade head

echo "[entrypoint] exec: $*"
exec "$@"
