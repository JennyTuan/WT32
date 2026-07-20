# Build the Vite SPA and serve it from the same FastAPI origin as the API.
# This avoids cross-site session-cookie and WebSocket limitations on free hosts.
FROM node:22-bookworm-slim AS frontend-build

WORKDIR /build/ui-review
COPY ui-review/package.json ui-review/package-lock.json ./
RUN npm ci
COPY ui-review/ ./
RUN npm run build

FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WT32_FRONTEND_DIST_DIR=/app/ui-review/dist

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY alembic.ini ./
COPY backend/ ./backend/
COPY --from=frontend-build /build/ui-review/dist ./ui-review/dist/

# DATABASE_URL is supplied by the hosting provider. Applying Alembic on boot
# keeps an empty hosted PostgreSQL database at the required schema revision.
CMD ["sh", "-c", "python -m alembic upgrade head && exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
