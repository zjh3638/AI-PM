# ── Builder stage: install Python dependencies ───────────
FROM 7.24.4.68:28085/1ms/python:3.12-slim AS builder

# Build args for intranet mirrors (pip/uv use intranet source, no proxy needed)
ARG PIP_INDEX_URL=""
ARG PIP_TRUSTED_HOST=""
ARG UV_INDEX_URL=""

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

# Install all deps using intranet pypi mirror.
# Without --frozen, uv resolves from UV_INDEX_URL instead of public PyPI URLs in lockfile.
ENV UV_INDEX_URL=${UV_INDEX_URL}
RUN if [ -n "$UV_INDEX_URL" ]; then \
      uv sync --no-dev; \
    else \
      uv sync --frozen --no-dev; \
    fi


# ── Runtime stage: minimal production image ──────────────
FROM 7.24.4.68:28085/1ms/python:3.12-slim

# Install runtime system deps.
# Use a sh subshell to unset proxy vars so apt connects directly to mirror.
RUN (unset http_proxy && unset https_proxy && unset HTTP_PROXY && unset HTTPS_PROXY && rm -f /etc/apt/sources.list.d/debian.sources && echo "deb http://mirrors.aliyun.com/debian/ trixie main contrib non-free non-free-firmware" > /etc/apt/sources.list && echo "deb http://mirrors.aliyun.com/debian/ trixie-updates main contrib non-free non-free-firmware" >> /etc/apt/sources.list && echo "deb http://mirrors.aliyun.com/debian-security/ trixie-security main contrib non-free non-free-firmware" >> /etc/apt/sources.list && apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git && rm -rf /var/lib/apt/lists/*)

WORKDIR /app

# Copy venv and uv binary from builder
COPY --from=builder /app/.venv ./.venv
COPY --from=builder /usr/local/bin/uv /usr/local/bin/uv

ENV PATH="/app/.venv/bin:${PATH}"

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

# Prestart (wait for PG + migrations + seed), then start server
CMD ["sh", "-c", "prestart.sh && exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
