# ── Production image: install deps + system tools in single stage ──
FROM 7.24.4.68:28085/1ms/python:3.12-slim

# Build args for intranet mirrors
ARG PIP_INDEX_URL=""
ARG PIP_TRUSTED_HOST=""
ARG UV_INDEX_URL=""
ARG HTTP_PROXY=""
ARG HTTPS_PROXY=""
ARG NO_PROXY=""
ENV http_proxy=$HTTP_PROXY \
    https_proxy=$HTTPS_PROXY \
    no_proxy=$NO_PROXY \
    HTTP_PROXY=$HTTP_PROXY \
    HTTPS_PROXY=$HTTPS_PROXY \
    NO_PROXY=$NO_PROXY

# Install uv (with optional pip mirror, no proxy)
RUN (unset http_proxy && unset https_proxy && unset HTTP_PROXY && unset HTTPS_PROXY && \
     if [ -n "$PIP_INDEX_URL" ]; then \
       pip install --no-cache-dir \
         --index-url "$PIP_INDEX_URL" \
         ${PIP_TRUSTED_HOST:+--trusted-host "$PIP_TRUSTED_HOST"} \
         uv; \
     else \
       pip install --no-cache-dir uv; \
     fi)

# Silence gitpython import warning when git binary is missing (DNS blocks apt-get)
ENV GIT_PYTHON_REFRESH=quiet

WORKDIR /app

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Install all Python deps
ENV UV_INDEX_URL=${UV_INDEX_URL}
RUN uv sync --no-dev

# Note: apt-get is skipped because DNS is blocked in this environment.
# System tools (git, pandoc, LaTeX) must be available externally or pre-installed.

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

EXPOSE 8000

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# Prestart (wait for PG + migrations + seed), then start server
CMD ["sh", "-c", "prestart.sh && exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
