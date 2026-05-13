# syntax=docker/dockerfile:1.7
# ============================================================
# Stage 1: builder — npm ci + vite build (with cached node_modules).
# ============================================================
FROM node:20-alpine AS builder

# NB: do NOT set NODE_ENV=production here — `npm ci` would then skip
# devDependencies, and `vite` lives in devDependencies. Build runs in dev mode;
# the runtime image is nginx, so node + sources are dropped anyway.
ENV CI=true \
    npm_config_update_notifier=false \
    npm_config_fund=false

WORKDIR /app

COPY package.json package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi

COPY . .

RUN npm run build

# ============================================================
# Stage 2: runtime — nginx serves the static SPA + proxies /api.
# ============================================================
FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache curl \
    && rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
    CMD curl -fsS http://localhost/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
