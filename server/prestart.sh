#!/bin/sh
set -e

echo "=== AI-PM prestart ==="

# Wait for PostgreSQL to be ready (up to 60 seconds)
echo "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
    if uv run python -c "
import asyncio
from app.config import settings
from sqlalchemy import text
from app.database import engine

async def check():
    async with engine.begin() as conn:
        await conn.execute(text('SELECT 1'))
    print('PostgreSQL is ready')

asyncio.run(check())
" 2>/dev/null; then
        break
    fi
    echo "  attempt $i/30..."
    sleep 2
done

# Apply database migrations
echo "Applying database migrations..."
uv run alembic upgrade head

# Seed initial data (skip DDL since migrations handle schema)
echo "Seeding initial data..."
SKIP_DDL=1 uv run python seed.py

echo "=== prestart complete ==="
