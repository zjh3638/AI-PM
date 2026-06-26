# ── Builder stage: install Python dependencies ───────────
FROM python:3.11-slim AS builder

# Build args for intranet mirrors (empty = use default public registries)
ARG APT_MIRROR=""
ARG APT_MIRROR_PROTOCOL="http"
ARG PIP_INDEX_URL=""
ARG PIP_TRUSTED_HOST=""
ARG UV_INDEX_URL=""

# Configure apt mirror if set
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|http://deb.debian.org|${APT_MIRROR_PROTOCOL}://${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    fi

# Install uv (with optional pip mirror)
RUN if [ -n "$PIP_INDEX_URL" ]; then \
      pip install --no-cache-dir \
        --index-url "$PIP_INDEX_URL" \
        ${PIP_TRUSTED_HOST:+--trusted-host "$PIP_TRUSTED_HOST"} \
        uv; \
    else \
      pip install --no-cache-dir uv; \
    fi

WORKDIR /app

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Install all deps (uv respects UV_INDEX_URL env var; asyncpg is pure-Python wheel, no C compiler needed)
ENV UV_INDEX_URL=${UV_INDEX_URL}
RUN uv sync --frozen --no-dev


# ── Runtime stage: minimal production image ──────────────
FROM python:3.11-slim

# Install runtime system deps (with optional apt mirror)
ARG APT_MIRROR=""
ARG APT_MIRROR_PROTOCOL="http"

RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|http://deb.debian.org|${APT_MIRROR_PROTOCOL}://${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy venv from builder
COPY --from=builder /app/.venv ./.venv

# Copy application source
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY app/ ./app/
COPY seed.py ./

# Copy prestart script
COPY prestart.sh /usr/local/bin/prestart.sh
RUN chmod +x /usr/local/bin/prestart.sh

# Create directories for runtime data
RUN mkdir -p /app/repos /app/uploads

# settings.json is mounted as a volume at runtime (see docker-compose.yml)
# If not mounted, the app reads config from environment variables

EXPOSE 8000

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:8000/api/health || exit 1

# Prestart (migrations + seed), then start server
# exec replaces the shell process for proper signal handling
CMD ["sh", "-c", "exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
