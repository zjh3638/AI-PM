-- ============================================================
-- 项目周报/月报功能 — 数据库变更脚本 (PostgreSQL)
-- 对应 Alembic 迁移: c3d4e5f6a7b8_add_project_reports_table
-- 上游 revision: b2c3d4e5f6a7
-- 生成日期: 2026-07-09
--
-- 说明: 本次变更仅【新增】一张表 project_reports，
--       不修改 / 不删除任何现有表，对存量数据零影响。
--       该表通过 dimension(PROJECT/PROJECT_GROUP) + dimension_id
--       同时承载「项目」与「项目群」两种维度的周报/月报，
--       对齐 meetings 表的既有范式。
-- ============================================================

-- ---------- 升级 (upgrade) ----------
BEGIN;

CREATE TABLE project_reports (
    id            VARCHAR(36)  NOT NULL,
    dimension     VARCHAR(20)  NOT NULL,           -- PROJECT / PROJECT_GROUP
    dimension_id  VARCHAR(36)  NOT NULL,           -- workspace.id 或 project_group.id
    report_type   VARCHAR(20)  NOT NULL,           -- WEEKLY / MONTHLY
    period_start  DATE         NOT NULL,
    period_end    DATE         NOT NULL,
    title         VARCHAR(200) NOT NULL,
    content       TEXT,                            -- Markdown 正文
    summary_data  JSON,                            -- 聚合数据快照
    status        VARCHAR(20)  NOT NULL,           -- DRAFT / PUBLISHED
    created_by    VARCHAR(36)  NOT NULL,
    published_at  TIMESTAMP,
    created_at    TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT pk_project_reports PRIMARY KEY (id),
    CONSTRAINT fk_project_reports_created_by FOREIGN KEY (created_by) REFERENCES users (id)
);

-- 说明: dimension_id 不设物理外键（因其可指向 workspaces 或 project_groups 两张表），
--       与 meetings 表的 dimension_id 处理方式一致。
CREATE INDEX ix_project_reports_dimension_id ON project_reports (dimension_id);

-- 记录迁移版本（若用 Alembic 管理，应用迁移时会自动写入；手动执行本 SQL 时同步更新）
UPDATE alembic_version SET version_num = 'c3d4e5f6a7b8' WHERE version_num = 'b2c3d4e5f6a7';

COMMIT;


-- ---------- 回滚 (downgrade) ----------
-- BEGIN;
-- DROP INDEX IF EXISTS ix_project_reports_dimension_id;
-- DROP TABLE IF EXISTS project_reports;
-- UPDATE alembic_version SET version_num = 'b2c3d4e5f6a7' WHERE version_num = 'c3d4e5f6a7b8';
-- COMMIT;
