# MySQL → PostgreSQL 迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI-PM 项目数据库从 MySQL 8 + SQLite(测试) 整体迁移到 PostgreSQL 16 + asyncpg 驱动

**Architecture:** 纯配置/依赖替换迁移。Model 层使用 SQLAlchemy 标准类型，无需改动。删除旧 Alembic 迁移，重新生成 PG baseline。

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0 (async), asyncpg, Alembic, PostgreSQL 16

---

### Task 1: 更新 Python 依赖

**Files:**
- Modify: `server/pyproject.toml`

- [ ] **Step 1: 替换数据库驱动依赖**

```toml
dependencies = [
    "fastapi>=0.111.0",
    "uvicorn[standard]>=0.30.0",
    "sqlalchemy[asyncio]>=2.0.30",
    "asyncpg>=0.30.0",
    "alembic>=1.13.0",
    "pydantic>=2.7.0",
    "pydantic-settings>=2.3.0",
    "python-jose[cryptography]>=3.3.0",
    "passlib[bcrypt]>=1.7.4",
    "python-multipart>=0.0.9",
    "httpx>=0.27.0",
    "gitpython>=3.1.43",
    "ldap3>=2.9.1",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.2.0",
    "pytest-asyncio>=0.23.0",
    "httpx>=0.27.0",
]
```

- [ ] **Step 2: 运行 uv sync 安装新依赖**

```bash
cd server && uv sync
```

- [ ] **Step 3: Commit**

```bash
git add server/pyproject.toml server/uv.lock
git commit -m "chore: replace asyncmy+aiosqlite with asyncpg for PostgreSQL migration"
```

---

### Task 2: 更新默认数据库配置

**Files:**
- Modify: `server/app/config.py`
- Modify: `server/alembic.ini`
- Modify: `.env.example`

- [ ] **Step 1: 更新 config.py 默认 URL**

```python
# server/app/config.py 第6行
database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_pm"
```

- [ ] **Step 2: 更新 alembic.ini 默认 URL**

```ini
# server/alembic.ini 第3行
sqlalchemy.url = postgresql+asyncpg://postgres:postgres@localhost:5432/ai_pm
```

- [ ] **Step 3: 更新 .env.example**

```bash
# .env.example 第2-3行
# PostgreSQL 连接字符串（格式: postgresql+asyncpg://user:pass@host:5432/dbname）
AI_PM_DATABASE_URL=postgresql+asyncpg://ai_pm:change_me@postgres:5432/ai_pm
```

- [ ] **Step 4: Commit**

```bash
git add server/app/config.py server/alembic.ini .env.example
git commit -m "chore: update default database URLs for PostgreSQL"
```

---

### Task 3: 更新 Docker 编排

**Files:**
- Modify: `docker-compose.yml`
- Modify: `server/Dockerfile`
- Modify: `server/prestart.sh`

- [ ] **Step 1: 替换 MySQL 服务为 PostgreSQL**

```yaml
# docker-compose.yml 完整替换内容
version: "3.8"

services:
  # ═══ PostgreSQL 16 ════════════════════════════════════
  postgres:
    image: postgres:16-alpine
    container_name: ai-pm-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ai_pm
      POSTGRES_PASSWORD: ai_pm_pass
      POSTGRES_DB: ai_pm
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ai_pm -d ai_pm"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 10s

  # ═══ Redis（可选，代码暂未使用，后续用于缓存/会话/任务队列）═══
  redis:
    image: redis:7-alpine
    container_name: ai-pm-redis
    restart: unless-stopped
    profiles:
      - full  # 仅在 docker compose --profile full up 时启动
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # ═══ Backend (FastAPI) ═══════════════════════════════════
  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: ai-pm-backend
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - AI_PM_DATABASE_URL=postgresql+asyncpg://ai_pm:ai_pm_pass@postgres:5432/ai_pm
      - AI_PM_REDIS_URL=redis://redis:6379/0
    ports:
      - "8000:8000"
    volumes:
      - ./server/settings.json:/app/settings.json
      - backend_uploads:/app/uploads
      - backend_repos:/app/repos
    depends_on:
      postgres:
        condition: service_healthy

  # ═══ Frontend (Nginx + React SPA) ══════════════════════
  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    container_name: ai-pm-frontend
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  postgres_data:
  redis_data:
  backend_uploads:
  backend_repos:
```

- [ ] **Step 2: 更新 Dockerfile**

```dockerfile
# server/Dockerfile — 替换为以下内容
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
```

- [ ] **Step 3: 更新 prestart.sh**

```bash
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
    echo "  attempt \$i/30..."
    sleep 2
done

# Apply database migrations
echo "Applying database migrations..."
uv run alembic upgrade head

# Seed initial data (skip DDL since migrations handle schema)
echo "Seeding initial data..."
SKIP_DDL=1 uv run python seed.py

echo "=== prestart complete ==="
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml server/Dockerfile server/prestart.sh
git commit -m "chore: update Docker infrastructure for PostgreSQL"
```

---

### Task 4: 清理 seed.py

**Files:**
- Modify: `server/seed.py`

- [ ] **Step 1: 删除 SQLite DDL fallback 代码**

删除 `seed.py` 第 26-85 行的 `if not SKIP_DDL:` 块（`create_all` 和所有 `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS` fallback）。

保留 `SKIP_DDL` 变量定义和第 87 行之后的种子数据插入逻辑。

修改后的 `seed()` 函数开头：

```python
async def seed():
    # DDL is handled by Alembic migrations — skip in all environments
    async with async_session() as db:
        dept = Department(id="dept-001", name="默认部门", path="/默认部门")
        db.add(dept)
        # ... 其余种子数据不变
```

- [ ] **Step 2: Commit**

```bash
git add server/seed.py
git commit -m "refactor: remove SQLite DDL fallbacks from seed.py"
```

---

### Task 5: 更新测试配置

**Files:**
- Modify: `server/tests/conftest.py`

> **前提:** 本地需有一个可用的 PostgreSQL，且已创建 `ai_pm_test` 数据库：
> ```bash
> createdb ai_pm_test
> ```

- [ ] **Step 1: 更新 conftest.py — 仅替换数据库 URL 和移除 SQLite 特有参数**

只改 3 处，其余代码不变。将 `server/tests/conftest.py` 第 17-23 行：

```python
# 原代码（删除）：
# TEST_DATABASE_URL = "sqlite+aiosqlite://"
# test_engine = create_async_engine(
#     TEST_DATABASE_URL,
#     echo=False,
#     connect_args={"check_same_thread": False},
#     poolclass=StaticPool,
# )

# 替换为：
import os

TEST_DATABASE_URL = os.getenv(
    "AI_PM_TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_pm_test",
)
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
```

同时移除第 9 行不再需要的 import：
```python
# 删除这行
from sqlalchemy.pool import StaticPool
```

其余 fixture（`setup_db`, `override_get_db`, `client`, `db_session`, `app`, `super_admin`, `member_user`, `workspace`, `auth_headers`, `member_headers`）保持不变，`create_all`/`drop_all` 模式在 PG 下同样生效。

- [ ] **Step 2: Commit**

```bash
git add server/tests/conftest.py
git commit -m "chore: switch test database from SQLite to PostgreSQL"
```

---

### Task 6: 重新生成 Alembic 迁移

**Files:**
- Delete: `server/alembic/versions/*.py`（所有 6 个旧 migration）
- Create: `server/alembic/versions/<new_baseline>.py`（PG baseline）

- [ ] **Step 1: 删除旧迁移文件**

```bash
rm server/alembic/versions/*.py
```

- [ ] **Step 2: 确保本地 PostgreSQL 运行中且有 ai_pm 数据库**

```bash
# 如果还没创建数据库：
createdb ai_pm
```

- [ ] **Step 3: 生成新 PG baseline 迁移**

```bash
cd server && uv run alembic revision --autogenerate -m "baseline_postgresql"
```

- [ ] **Step 4: 验证迁移可以正常执行**

```bash
cd server && uv run alembic upgrade head
```
Expected: 所有表创建成功，无报错。

- [ ] **Step 5: 运行 seed 验证**

```bash
cd server && SKIP_DDL=1 uv run python seed.py
```
Expected: 种子数据成功写入。

- [ ] **Step 6: Commit**

```bash
git add server/alembic/versions/
git commit -m "chore: regenerate Alembic baseline for PostgreSQL"
```

---

### Task 7: 运行测试验证

- [ ] **Step 1: 创建测试数据库**

```bash
createdb ai_pm_test
```

- [ ] **Step 2: 运行全部测试**

```bash
cd server && uv run pytest tests/ -v
```
Expected: 全部测试通过。

- [ ] **Step 3: 如有失败，根据错误信息修复后重新运行**

常见问题：
- 连接被拒 → 确认 PG 运行中，连接字符串正确
- 数据库不存在 → `createdb ai_pm_test`
- 表已存在 → `dropdb ai_pm_test && createdb ai_pm_test`

- [ ] **Step 4: 验证后 Commit（如有修复）**

```bash
git add -A && git commit -m "fix: test adjustments for PostgreSQL migration"
```

---

## 完成验证

全部 Task 完成后，运行一次端到端验证：

```bash
# 1. Docker Compose 启动
docker compose down -v
docker compose up -d

# 2. 检查后端健康
curl http://localhost:8000/api/health
# Expected: {"code":0,"message":"ok","data":{"status":"ok"}}

# 3. 运行测试套件
cd server && uv run pytest tests/ -v
# Expected: ALL PASS
```
