-- ═══════════════════════════════════════════════════════════════
-- AI-PM schema 补齐脚本
-- 对照 init_pg.py 与当前 DB（alembic baseline 1f6b768891a9 + 9f0caa3a724c）
-- 仅补齐缺失的 DEFAULT 约束 / 索引 / 表（幂等）
-- ═══════════════════════════════════════════════════════════════

-- ─── departments ───
ALTER TABLE departments ALTER COLUMN path SET DEFAULT '';
ALTER TABLE departments ALTER COLUMN sort_order SET DEFAULT 0;

-- ─── roles ───
ALTER TABLE roles ALTER COLUMN data_scope SET DEFAULT 'SELF';

-- ─── workspaces ───
ALTER TABLE workspaces ALTER COLUMN type SET DEFAULT 'PROJECT';
ALTER TABLE workspaces ALTER COLUMN status SET DEFAULT 'ACTIVE';
ALTER TABLE workspaces ALTER COLUMN phase SET DEFAULT 'PLANNING';
ALTER TABLE workspaces ALTER COLUMN visibility SET DEFAULT 'PRIVATE';
ALTER TABLE workspaces ALTER COLUMN strict_gate SET DEFAULT TRUE;

-- ─── iterations ───
ALTER TABLE iterations ALTER COLUMN capacity_points SET DEFAULT 0;
ALTER TABLE iterations ALTER COLUMN committed_points SET DEFAULT 0;
ALTER TABLE iterations ALTER COLUMN status SET DEFAULT 'PLANNING';

-- ─── milestones ───
ALTER TABLE milestones ALTER COLUMN phase SET DEFAULT 'PLANNING';
ALTER TABLE milestones ALTER COLUMN sort_order SET DEFAULT 0;

-- ─── workspace_members ───
ALTER TABLE workspace_members ALTER COLUMN role SET DEFAULT 'MEMBER';

-- ─── tasks ───
ALTER TABLE tasks ALTER COLUMN task_type SET DEFAULT 'TASK';
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'TODO';
ALTER TABLE tasks ALTER COLUMN phase SET DEFAULT 'REQUIREMENTS';
ALTER TABLE tasks ALTER COLUMN priority SET DEFAULT 'MEDIUM';
ALTER TABLE tasks ALTER COLUMN sort_order SET DEFAULT 0;

-- ─── risks ───
ALTER TABLE risks ALTER COLUMN risk_type SET DEFAULT 'OTHER';
ALTER TABLE risks ALTER COLUMN probability SET DEFAULT 'MEDIUM';
ALTER TABLE risks ALTER COLUMN impact SET DEFAULT 'MEDIUM';
ALTER TABLE risks ALTER COLUMN status SET DEFAULT 'IDENTIFIED';

-- ─── notifications ───
ALTER TABLE notifications ALTER COLUMN category SET DEFAULT 'INFO';
ALTER TABLE notifications ALTER COLUMN is_read SET DEFAULT FALSE;

-- ─── requirement_inbox ───
ALTER TABLE requirement_inbox ALTER COLUMN source SET DEFAULT 'MANUAL';
ALTER TABLE requirement_inbox ALTER COLUMN status SET DEFAULT 'TRIAGE';

-- ─── meetings ───
ALTER TABLE meetings ALTER COLUMN dimension SET DEFAULT 'PROJECT';
ALTER TABLE meetings ALTER COLUMN meeting_type SET DEFAULT 'WEEKLY';
ALTER TABLE meetings ALTER COLUMN status SET DEFAULT 'ACTIVE';

-- ─── task_progress.created_at ───
ALTER TABLE task_progress ALTER COLUMN created_at SET DEFAULT now();

-- ═══════════════════════════════════════════════════════════════
-- 补齐可能缺失的索引（IF NOT EXISTS 幂等）
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS ix_tasks_epic_id ON tasks (epic_id);
CREATE INDEX IF NOT EXISTS ix_tasks_milestone_id ON tasks (milestone_id);
CREATE INDEX IF NOT EXISTS ix_tasks_workspace_id ON tasks (workspace_id);

-- ═══════════════════════════════════════════════════════════════
-- alembic_version 表（init_pg.py 中有，确保存在）
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL PRIMARY KEY
);

INSERT INTO alembic_version (version_num) VALUES ('9f0caa3a724c') ON CONFLICT DO NOTHING;
