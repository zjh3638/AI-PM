-- ============================================================================
-- 会议大屏改造 · 数据库变更脚本（PostgreSQL）
-- ============================================================================
-- 覆盖两次改造的全部 DDL 变更。
--
-- 第一次改造（会议里程碑时间轴）：
--   复用 milestones 表已有字段（start_date / end_date / depends_on_id /
--   owner_id / phase / sort_order），无新增表或列 → 无 DDL。
--
-- 第二次改造（会议按组织架构多选项目）：
--   1) 新增 meeting_workspaces 表（CUSTOM 维度会议的项目快照）
--   2) meetings.dimension 新增取值 'CUSTOM'（VARCHAR 无需改结构，仅枚举语义）
--   3) 复用 departments.parent_id / path（多层组织架构，已在基线）
--      与 workspaces.department_id / owner_id（已在基线）→ 无 DDL。
--
-- 对应 Alembic 迁移：d4e5f6a7b8c9_add_meeting_workspaces
-- 可重复执行（IF NOT EXISTS 幂等）。
-- ============================================================================

-- 会议-项目关联表：dimension='CUSTOM' 的会议，其覆盖的项目集合以快照形式存此表
CREATE TABLE IF NOT EXISTS meeting_workspaces (
    id           VARCHAR(36) PRIMARY KEY,
    meeting_id   VARCHAR(36) NOT NULL REFERENCES meetings(id)   ON DELETE CASCADE,
    workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    CONSTRAINT uq_meeting_workspace UNIQUE (meeting_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS ix_meeting_workspaces_meeting_id
    ON meeting_workspaces (meeting_id);

CREATE INDEX IF NOT EXISTS ix_meeting_workspaces_workspace_id
    ON meeting_workspaces (workspace_id);

-- ============================================================================
-- 回滚（如需）
-- ============================================================================
-- DROP TABLE IF EXISTS meeting_workspaces;
