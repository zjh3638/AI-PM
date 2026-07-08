#!/usr/bin/env python3
"""数据库初始化脚本

一键修复所有数据库表结构问题：缺表、缺字段。

用法:
    uv run python init_db.py              # 仅修复表结构
    uv run python init_db.py --seed       # 修复表结构 + 加载种子数据
    uv run python init_db.py --stamp      # 修复表结构 + 标记 Alembic head
    uv run python init_db.py --seed --stamp  # 全部：修复 + 种子 + 标记
    uv run python init_db.py -v           # 详细日志模式

环境变量:
    AI_PM_DATABASE_URL  — 数据库连接（默认: postgresql+asyncpg://postgres:postgres@localhost:5432/ai_pm）
"""
import argparse
import asyncio
import logging
import os
import sys

# 确保当前目录在 sys.path 中（支持从任意目录运行）
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.sql.schema import DefaultClause

from app.database import engine, Base
from app.config import settings

# 导入所有模型，确保 Base.metadata 包含全部表定义
import app.models  # noqa: E402,F401

logger = logging.getLogger("init_db")


# ═══════════════════════════════════════════════════════════════════════════════
# 日志
# ═══════════════════════════════════════════════════════════════════════════════

def setup_logging(verbose: bool) -> None:
    """配置日志格式和级别。"""
    level = logging.DEBUG if verbose else logging.INFO
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)-5s] %(message)s",
        datefmt="%H:%M:%S",
    ))
    logger.setLevel(level)
    logger.addHandler(handler)
    # 也设置 root logger，以便 alembic / sqlalchemy 的日志也能输出
    logging.getLogger().setLevel(logging.WARNING)


# ═══════════════════════════════════════════════════════════════════════════════
# 阶段 1：创建缺失的表
# ═══════════════════════════════════════════════════════════════════════════════

def _get_missing_tables(conn: Connection) -> list[str]:
    """对比模型定义与数据库，返回数据库中不存在的表名列表。"""
    inspector = inspect(conn)
    existing = set(inspector.get_table_names())
    model_tables = {t.name for t in Base.metadata.sorted_tables}
    return sorted(model_tables - existing)


async def ensure_tables(conn: AsyncConnection) -> None:
    """对比模型与数据库，为缺失的表生成 CREATE TABLE 并执行。

    先用 inspector 找出缺失的表名和列数，再用 create_all 一次性创建
    （create_all 内部使用 CREATE TABLE IF NOT EXISTS，已存在的表不会重复创建）。
    verbose 模式下会额外输出每张缺失表的完整 DDL。
    """
    # 找出缺失的表
    missing_tables = await conn.run_sync(_get_missing_tables)

    if not missing_tables:
        logger.info("所有表已存在，无需创建")
        return

    # 打印缺失表及其列信息
    model_by_name = {t.name: t for t in Base.metadata.sorted_tables}
    logger.info("发现 %d 张缺失的表:", len(missing_tables))
    for name in missing_tables:
        table = model_by_name.get(name)
        if table is not None:
            cols = [c.name for c in table.columns]
            logger.info("  📄 %s (%d 列): %s", name, len(cols), ", ".join(cols[:6]) + ("…" if len(cols) > 6 else ""))

            # verbose 模式：输出完整 CREATE TABLE DDL
            if logger.isEnabledFor(logging.DEBUG):
                from sqlalchemy.schema import CreateTable
                ddl = str(CreateTable(table).compile(dialect=engine.sync_engine.dialect))
                logger.debug("── %s ──\n%s\n──", name, ddl)

    # 创建所有缺失的表（已存在的表不受影响）
    await conn.run_sync(Base.metadata.create_all)
    logger.info("表创建完成 (%d 张新增)", len(missing_tables))


# ═══════════════════════════════════════════════════════════════════════════════
# 阶段 2：补全缺失的字段
# ═══════════════════════════════════════════════════════════════════════════════

def _get_db_columns(conn: Connection, table_name: str) -> set[str]:
    """获取数据库中某张表当前的所有列名。"""
    inspector = inspect(conn)
    return {col["name"] for col in inspector.get_columns(table_name)}


def _get_server_default_sql(col) -> str | None:
    """从 SQLAlchemy Column 的 server_default 提取 SQL 文本。"""
    sd = col.server_default
    if sd is None:
        return None

    # DefaultClause: server_default=func.now() → arg 是 Function 对象
    #                server_default="UPCOMING" → arg 是字符串
    #                server_default=text("...") → arg 是 TextClause
    if isinstance(sd, DefaultClause) and sd.arg is not None:
        arg = sd.arg
        if isinstance(arg, str):
            return f"'{arg}'" if not arg.startswith("'") else arg
        # Function / TextClause → 尝试获取文本
        try:
            return str(arg)
        except Exception:
            return None

    return str(sd)


def _build_add_column_sql(
    table_name: str,
    col,
    dialect_name: str,
) -> str | None:
    """为缺失的列生成 ALTER TABLE ADD COLUMN DDL。

    返回 SQL 字符串，或 None（跳过此列）。
    """
    # 对于 PostgreSQL: VARCHAR(n), TEXT, INTEGER, BOOLEAN, DATE, FLOAT, JSON 等
    # str(col.type) 直接返回类型名+参数，兼容所有方言
    type_sql = str(col.type).upper()

    # --- 可空性 ---
    if col.nullable:
        nullable_sql = ""
    else:
        nullable_sql = " NOT NULL"

    # --- Server Default ---
    default_sql = ""
    if col.server_default is not None:
        default_text = _get_server_default_sql(col)
        if default_text:
            default_sql = f" DEFAULT {default_text}"

    # --- Foreign Key ---
    fk_sql = ""
    if col.foreign_keys:
        fks = list(col.foreign_keys)
        if len(fks) == 1:
            fk = fks[0]
            ref_table = fk.column.table.name
            ref_col = fk.column.name
            fk_sql = f" REFERENCES {ref_table}({ref_col})"
        # 多个 FK 极少见，跳过自动处理

    # --- SQLite 约束降级 ---
    if dialect_name == "sqlite":
        # SQLite ALTER TABLE ADD COLUMN 不支持 NOT NULL（除非有 DEFAULT）、FK、UNIQUE
        if col.nullable is False and col.server_default is None:
            nullable_sql = ""
            logger.warning(
                "  ⚠ SQLite: %s.%s NOT NULL 降级为 NULLABLE（需 DEFAULT 约束）",
                table_name, col.name,
            )
        if fk_sql:
            logger.warning(
                "  ⚠ SQLite: %s.%s 外键约束已跳过（ALTER TABLE 不支持）",
                table_name, col.name,
            )
            fk_sql = ""

    sql = f'ALTER TABLE {table_name} ADD COLUMN "{col.name}" {type_sql}{default_sql}{nullable_sql}{fk_sql}'
    return sql


async def ensure_columns(conn: AsyncConnection) -> list[str]:
    """检查每张表，补全模型中定义了但数据库中缺失的字段。

    返回已执行的 DDL 语句列表（用于日志）。
    """
    dialect_name = engine.dialect.name
    executed: list[str] = []

    # 获取数据库中已存在的表
    def _get_existing_tables(c):
        return set(inspect(c).get_table_names())

    existing_tables = await conn.run_sync(_get_existing_tables)

    model_tables = Base.metadata.sorted_tables

    total_missing = 0
    total_ok = 0
    total_skipped = 0

    for table in model_tables:
        if table.name not in existing_tables:
            total_skipped += 1
            continue  # 表不存在，由 ensure_tables 处理

        db_columns = await conn.run_sync(lambda c: _get_db_columns(c, table.name))
        model_columns = set(table.columns.keys())

        missing_cols = model_columns - db_columns

        if not missing_cols:
            total_ok += 1
            logger.debug("  ✓ %s: %d 列完整", table.name, len(db_columns))
            continue

        logger.info("  📋 %s: 缺 %d 列 → %s", table.name, len(missing_cols), ", ".join(sorted(missing_cols)))

        for col_name in sorted(missing_cols):
            col = table.columns[col_name]
            sql = _build_add_column_sql(table.name, col, dialect_name)
            if sql is None:
                logger.warning("  ⚠ 无法生成 %s.%s 的 DDL，跳过", table.name, col_name)
                continue

            try:
                await conn.execute(text(sql))
                executed.append(sql)
                total_missing += 1
                logger.info("    ✅ 已添加 %s (%s)", col_name, str(col.type))
            except Exception as e:
                logger.error("    ❌ 添加 %s 失败: %s", col_name, e)
                logger.debug("       SQL: %s", sql)

    # 汇总
    logger.info(
        "字段检查完成: %d 表完整, %d 列新增, %d 表不存在(跳过)",
        total_ok, total_missing, total_skipped,
    )

    return executed


# ═══════════════════════════════════════════════════════════════════════════════
# 阶段 3：标记 Alembic head
# ═══════════════════════════════════════════════════════════════════════════════

async def stamp_alembic_head() -> None:
    """使用 subprocess 调用 alembic stamp head，避免嵌套事件循环问题。

    在子进程中运行，自动设置 PYTHONPATH 确保 env.py 能找到 app 模块。
    """
    import subprocess

    alembic_ini = os.path.join(_SCRIPT_DIR, "alembic.ini")
    if not os.path.exists(alembic_ini):
        logger.warning("未找到 alembic.ini，跳过 stamp")
        return

    env = os.environ.copy()
    env["PYTHONPATH"] = _SCRIPT_DIR

    try:
        result = subprocess.run(
            ["uv", "run", "alembic", "stamp", "head"],
            cwd=_SCRIPT_DIR,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            logger.info("Alembic head 标记完成")
            if result.stdout.strip():
                logger.debug("  %s", result.stdout.strip())
        else:
            logger.warning(
                "Alembic stamp 失败 (exit=%d): %s",
                result.returncode,
                result.stderr.strip()[-200:] if result.stderr else "unknown",
            )
            logger.info("你可稍后手动运行: cd server && uv run alembic stamp head")
    except FileNotFoundError:
        logger.warning("uv 命令不可用，跳过 stamp")
        logger.info("你可稍后手动运行: cd server && uv run alembic stamp head")
    except subprocess.TimeoutExpired:
        logger.warning("Alembic stamp 超时，跳过")
    except Exception as e:
        logger.warning("Alembic stamp 失败: %s", e)


# ═══════════════════════════════════════════════════════════════════════════════
# 阶段 4：种子数据
# ═══════════════════════════════════════════════════════════════════════════════

async def run_seed() -> None:
    """调用 seed.py 加载初始数据。"""
    try:
        # seed.py 中的 seed() 使用自己的 async_session，直接导入调用
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "seed", os.path.join(_SCRIPT_DIR, "seed.py")
        )
        if spec is None or spec.loader is None:
            logger.error("无法加载 seed.py")
            return
        seed_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(seed_module)
        await seed_module.seed()
        logger.info("种子数据加载完成")
    except Exception as e:
        logger.error("种子数据加载失败: %s", e)
        raise


# ═══════════════════════════════════════════════════════════════════════════════
# 编排
# ═══════════════════════════════════════════════════════════════════════════════

async def init_db(args: argparse.Namespace) -> None:
    """主流程。"""
    dialect_name = engine.dialect.name

    # 隐藏密码信息
    safe_url = settings.database_url
    if "@" in safe_url:
        safe_url = safe_url[:safe_url.index("@")+1] + "***"

    logger.info("═" * 56)
    logger.info("AI-PM 数据库初始化")
    logger.info("数据库方言: %s", dialect_name)
    logger.debug("连接: %s", safe_url)
    logger.info("═" * 56)

    # ── 阶段 1 & 2：DDL（在同一个事务中执行） ──
    async with engine.begin() as conn:
        # 1. 创建缺失的表
        logger.info("[1/3] 检查缺失的表…")
        await ensure_tables(conn)
        logger.info("[1/3] ✓ 完成")

        # 2. 补全缺失的字段
        logger.info("[2/3] 检查缺失的字段…")
        await ensure_columns(conn)
        logger.info("[2/3] ✓ 完成")

    # ── 阶段 3 & 4：在事务外执行 ──
    # 3. 标记 Alembic
    if args.stamp:
        logger.info("[3/3] 标记 Alembic head…")
        await stamp_alembic_head()
    else:
        logger.info("[3/3] Alembic stamp 跳过（使用 --stamp 启用）")

    # 4. 种子数据
    if args.seed:
        logger.info("加载种子数据…")
        await run_seed()

    await engine.dispose()

    logger.info("═" * 56)
    logger.info("数据库初始化完成 ✓")
    logger.info("═" * 56)


# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(
        description="AI-PM 数据库初始化 — 一键修复缺表/缺字段问题",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  uv run python init_db.py               # 仅修复表结构
  uv run python init_db.py --seed        # 修复 + 加载种子数据
  uv run python init_db.py --seed --stamp   # 全部：修复 + 种子 + 迁移标记
  uv run python init_db.py -v            # 详细日志
        """,
    )
    parser.add_argument(
        "--seed", action="store_true",
        help="初始化后加载种子数据（管理员用户、角色、工作流模板等）",
    )
    parser.add_argument(
        "--stamp", action="store_true",
        help="将当前表结构标记为 Alembic head（建议与 --seed 一起使用）",
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true",
        help="输出详细调试日志",
    )

    args = parser.parse_args()
    setup_logging(args.verbose)

    asyncio.run(init_db(args))


if __name__ == "__main__":
    main()
