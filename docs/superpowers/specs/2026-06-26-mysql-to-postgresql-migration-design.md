# MySQL → PostgreSQL 迁移设计

## 目标

将 AI-PM 项目数据库从 MySQL 8 整体迁移到 PostgreSQL 16，测试数据库从 SQLite 统一到 PostgreSQL。

## 驱动选型

**asyncpg** — SQLAlchemy 官方推荐的 PostgreSQL 异步驱动，性能最优。

## 迁移策略

项目处于开发阶段，无生产数据，采用**替换式迁移**：
- 删除旧 Alembic migration 文件，重新生成 PG baseline
- 直接替换依赖、配置、Docker 编排
- 测试数据库从 SQLite 内存库切到独立 PG 测试库

## 影响文件清单（10 个文件）

### 依赖层
| 文件 | 变更 |
|------|------|
| `server/pyproject.toml` | 移除 `asyncmy`, `aiosqlite`；添加 `asyncpg` |

### 配置层
| 文件 | 变更 |
|------|------|
| `server/app/config.py` | 默认 URL 改为 `postgresql+asyncpg://` |
| `server/alembic.ini` | 默认 URL 改为 PG 连接串 |
| `.env.example` | 更新示例连接串和注释 |

### 基础设施层
| 文件 | 变更 |
|------|------|
| `docker-compose.yml` | MySQL 服务 → PostgreSQL 16，更新 healthcheck 和环境变量 |
| `server/Dockerfile` | 移除 gcc 编译依赖，更新注释 |
| `server/prestart.sh` | 连接等待逻辑适配 PG |

### 代码层
| 文件 | 变更 |
|------|------|
| `server/seed.py` | 删除 SQLite DDL fallback（约 60 行 ALTER TABLE） |
| `server/tests/conftest.py` | SQLite 内存库 → PG 测试库 |

### 迁移层
| 目录 | 变更 |
|------|------|
| `server/alembic/versions/` | 删除现有 6 个 migration，重新 autogenerate baseline |

## 不需要变更

- **所有 Model 文件** — 使用 SQLAlchemy 标准类型，零数据库耦合
- **所有 Service / Router** — 通过 ORM 抽象访问数据
- **`database.py`** — `create_async_engine(url)` 驱动无关

## 注意事项

1. UUID 主键保持 `String(36)`，不切换到 PG 原生 UUID（减少变更范围）
2. JSON 字段由 SQLAlchemy `JSON` 类型处理，PG 自动映射为 `JSONB`
3. `func.now()` 在 PG 中等效于 `NOW()`，跨数据库兼容
4. 测试数据库 URL 通过 `AI_PM_DATABASE_URL` 环境变量覆盖，或直接在 conftest 中硬编码测试库名
