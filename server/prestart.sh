#!/bin/sh
set -euo pipefail

echo "=== AI-PM prestart ==="

# ── Wait for PostgreSQL ──────────────────────────────────
# Timeout in seconds, configurable via env var
PRESTART_PG_TIMEOUT="${PRESTART_PG_TIMEOUT:-60}"
PG_RETRY_INTERVAL="${PG_RETRY_INTERVAL:-2}"

echo "Waiting for PostgreSQL (timeout=${PRESTART_PG_TIMEOUT}s)..."
elapsed=0
while [ "$elapsed" -lt "$PRESTART_PG_TIMEOUT" ]; do
    if uv run python -c "
import asyncio
from app.config import settings
from sqlalchemy import text
from app.database import engine

async def check():
    try:
        async with engine.begin() as conn:
            await conn.execute(text('SELECT 1'))
        print('ready')
        return True
    except Exception as e:
        return False

if not asyncio.run(check()):
    exit(1)
" 2>/dev/null; then
        echo "PostgreSQL is ready"
        break
    fi
    elapsed=$((elapsed + PG_RETRY_INTERVAL))
    echo "  waiting... (${elapsed}s/${PRESTART_PG_TIMEOUT}s)"
    sleep "$PG_RETRY_INTERVAL"
done

if [ "$elapsed" -ge "$PRESTART_PG_TIMEOUT" ]; then
    echo "ERROR: PostgreSQL not ready after ${PRESTART_PG_TIMEOUT}s"
    exit 1
fi

# ── Apply database migrations ────────────────────────────
echo "Applying database migrations..."
uv run alembic upgrade head

# ── Seed initial data ────────────────────────────────────
echo "Seeding initial data..."
SKIP_DDL=1 uv run python seed.py

echo "=== prestart complete ==="
