# syntax=docker/dockerfile:1

# ---- 1. Build the dashboard -------------------------------------------------
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. API + static files ----------------------------------------------------
FROM python:3.12-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    NUMBA_CACHE_DIR=/tmp/numba \
    MPLCONFIGDIR=/tmp/matplotlib \
    PORT=7860

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/cardiolens ./cardiolens
COPY backend/config ./config
COPY backend/data ./data
COPY backend/artifacts ./artifacts
COPY --from=web /web/dist /app/frontend/dist

# Hugging Face Spaces runs containers as uid 1000.
RUN useradd --create-home --uid 1000 cardiolens && chown -R cardiolens /app
USER cardiolens

EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"7860\")}/api/health', timeout=4)"
CMD ["sh", "-c", "uvicorn cardiolens.api.main:app --host 0.0.0.0 --port ${PORT:-7860} --workers 1"]
