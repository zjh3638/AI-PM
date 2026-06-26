# ── Builder stage: install Python dependencies ──
FROM python:3.11-slim AS builder

# Install uv
RUN pip install --no-cache-dir uv

WORKDIR /app

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Install all deps (asyncpg is pure-Python wheel, no C compiler needed)
RUN uv sync --frozen --no-dev


# ── Runtime stage: minimal production image ──
FROM python:3.11-slim

# Install runtime system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
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

# Settings file is mounted as a volume at runtime
RUN echo '{"llm_gateway_url": "https://api.deepseek.com/v1"}' > /app/settings.json

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Prestart (migrations + seed), then start server
CMD ["sh", "-c", "/usr/local/bin/prestart.sh && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
