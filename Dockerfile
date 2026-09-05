# syntax=docker/dockerfile:1

# ---- stage 1: build the SPA -------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
RUN npm run build

# ---- stage 2: python runtime that serves the API and the built SPA ----------
FROM python:3.12-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.11.15 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/server/.venv \
    PATH=/app/server/.venv/bin:$PATH \
    DATA_DIR=/data \
    STATIC_DIR=/app/dist \
    PORT=8080

RUN apt-get update \
 && apt-get install -y --no-install-recommends gosu \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --create-home --uid 10001 panelist

WORKDIR /app/server
COPY server/pyproject.toml server/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY server/panelist ./panelist
RUN uv sync --frozen --no-dev

COPY --from=web /web/dist /app/dist

RUN mkdir -p /data && chown -R panelist:panelist /app /data \
 && printf '%s\n' \
      '#!/bin/sh' \
      'set -e' \
      'chown panelist:panelist /data 2>/dev/null || true' \
      'exec gosu panelist "$@"' \
      > /usr/local/bin/entrypoint.sh \
 && chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["python", "-m", "panelist"]
