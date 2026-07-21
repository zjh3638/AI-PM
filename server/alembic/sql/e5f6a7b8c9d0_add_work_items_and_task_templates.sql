-- ============================================================
-- 子工作清单 (work_items) + 任务模板功能 — 数据库变更脚本 (PostgreSQL)
-- 对应 Alembic 迁移: e5f6a7b8c9d0_add_work_items_and_task_templates
-- 上游 revision: d4e5f6a7b8c9
-- 生成日期: 2026-07-21
--
-- 说明: 本次变更包含两部分，均为【新增】，对存量数据零影响：
--   1) tasks 表新增 3 列：
--      - work_items                 复杂任务的子工作清单（JSON 数组，扁平化，
--                                    每项含 id/title/assignee_id/due_date/completed 等，
--                                    不引入父子任务层级）
--      - created_from_template_id   记录该任务由哪个模板实例化而来
--      - created_from_template_name 冗余模板名，便于展示（模板删除后仍可追溯）
--   2) 新增 task_templates 表：项目内可复用的任务模板，
--      title_template 支持 {变量} 占位，work_items_template 定义工作项蓝本。
-- ============================================================

-- ---------- 升级 (upgrade) ----------
BEGIN;

-- 1. tasks 新增字段（全部可空 / 无默认值，不锁表重写）
ALTER TABLE tasks ADD COLUMN work_items                 JSON;
ALTER TABLE tasks ADD COLUMN created_from_template_id   VARCHAR(36);
ALTER TABLE tasks ADD COLUMN created_from_template_name VARCHAR(200);

-- 2. 任务模板表
CREATE TABLE task_templates (
    id                    VARCHAR(36)  NOT NULL,
    workspace_id          VARCHAR(36)  NOT NULL,
    name                  VARCHAR(200) NOT NULL,           -- 模板名称，如「Redis监控任务」
    description           TEXT,
    task_type             VARCHAR(20)  NOT NULL,           -- TASK / STORY / BUG 等
    title_template        VARCHAR(500) NOT NULL,           -- 支持 {变量}，如「{项目名称} - Redis监控」
    description_template  TEXT,
    priority              VARCHAR(20)  NOT NULL,           -- LOW / MEDIUM / HIGH
    phase                 VARCHAR(30)  NOT NULL,
    estimation            FLOAT,           -- PG 中等价于 double precision
    estimation_unit       VARCHAR(20),
    work_items_template   JSON,                            -- 工作项蓝本 [{title, description, sort_order}]
    category              VARCHAR(50),                     -- 分类，如「运维监控」
    tags                  JSON,                            -- 标签数组
    usage_count           INTEGER      NOT NULL DEFAULT 0, -- 使用次数
    creator_id            VARCHAR(36)  NOT NULL,
    created_at            TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at            TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT pk_task_templates PRIMARY KEY (id),
    CONSTRAINT fk_task_templates_workspace_id FOREIGN KEY (workspace_id) REFERENCES workspaces (id),
    CONSTRAINT fk_task_templates_creator_id   FOREIGN KEY (creator_id)   REFERENCES users (id)
);

CREATE INDEX ix_task_templates_workspace_id ON task_templates (workspace_id);

-- 记录迁移版本（若用 Alembic 管理，应用迁移时会自动写入；手动执行本 SQL 时同步更新）
UPDATE alembic_version SET version_num = 'e5f6a7b8c9d0' WHERE version_num = 'd4e5f6a7b8c9';

COMMIT;


-- ---------- 回滚 (downgrade) ----------
-- BEGIN;
-- DROP INDEX IF EXISTS ix_task_templates_workspace_id;
-- DROP TABLE IF EXISTS task_templates;
-- ALTER TABLE tasks DROP COLUMN IF EXISTS created_from_template_name;
-- ALTER TABLE tasks DROP COLUMN IF EXISTS created_from_template_id;
-- ALTER TABLE tasks DROP COLUMN IF EXISTS work_items;
-- UPDATE alembic_version SET version_num = 'd4e5f6a7b8c9' WHERE version_num = 'e5f6a7b8c9d0';
-- COMMIT;
