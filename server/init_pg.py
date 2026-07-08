#!/usr/bin/env python3
"""
AI-PM 数据库完整初始化脚本（独立版）
======================================

完全不依赖项目代码，只需 psycopg2。修改下方的数据库连接配置后直接运行。

用法:
    python init_pg.py              # 创建所有表（幂等，已有表不重复创建）
    python init_pg.py --reset      # 先删除所有表再重建（⚠️ 清空全部数据）
    python init_pg.py --seed       # 创建表 + 加载种子数据

依赖:
    pip install psycopg2-binary
"""

import sys
import argparse

# ═══════════════════════════════════════════════════════════════════════════════
# 数据库连接配置（修改为你的内网 PG 实际配置）
# ═══════════════════════════════════════════════════════════════════════════════
DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "ai_pm",
    "user": "postgres",
    "password": "postgres",
}

# ═══════════════════════════════════════════════════════════════════════════════
# 以下为所有表的 DDL，按照外键依赖顺序排列
# ═══════════════════════════════════════════════════════════════════════════════

ALL_TABLES = [
    # ────────────────────────────────────────────────────────────────────────
    # 1. departments — 部门
    # ────────────────────────────────────────────────────────────────────────
    ("departments", """
        CREATE TABLE IF NOT EXISTS departments (
            id          VARCHAR(36)  PRIMARY KEY,
            name        VARCHAR(100) NOT NULL,
            parent_id   VARCHAR(36)  REFERENCES departments(id),
            path        VARCHAR(500) NOT NULL DEFAULT '',
            sort_order  INTEGER      NOT NULL DEFAULT 0,
            ldap_dn     VARCHAR(500) UNIQUE,
            created_at  TIMESTAMP    NOT NULL DEFAULT now(),
            updated_at  TIMESTAMP    NOT NULL DEFAULT now()
        )
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 2. roles — 角色
    # ────────────────────────────────────────────────────────────────────────
    ("roles", """
        CREATE TABLE IF NOT EXISTS roles (
            id          VARCHAR(36)  PRIMARY KEY,
            code        VARCHAR(50)  NOT NULL UNIQUE,
            name        VARCHAR(100) NOT NULL,
            level       VARCHAR(20)  NOT NULL,
            data_scope  VARCHAR(20)  NOT NULL DEFAULT 'SELF',
            permissions JSON,
            description VARCHAR(500)
        )
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 3. workflow_templates — 工作流模板
    # ────────────────────────────────────────────────────────────────────────
    ("workflow_templates", """
        CREATE TABLE IF NOT EXISTS workflow_templates (
            id          VARCHAR(36)  PRIMARY KEY,
            name        VARCHAR(200) NOT NULL,
            description TEXT,
            is_builtin  BOOLEAN      NOT NULL DEFAULT FALSE
        )
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 4. users — 用户
    # ────────────────────────────────────────────────────────────────────────
    ("users", """
        CREATE TABLE IF NOT EXISTS users (
            id              VARCHAR(36)  PRIMARY KEY,
            username        VARCHAR(100) NOT NULL,
            email           VARCHAR(200),
            hashed_password VARCHAR(200) NOT NULL,
            display_name    VARCHAR(100) NOT NULL,
            avatar_url      VARCHAR(500),
            department_id   VARCHAR(36)  REFERENCES departments(id),
            system_role     VARCHAR(20)  NOT NULL DEFAULT 'MEMBER',
            status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
            source          VARCHAR(20)  NOT NULL DEFAULT 'LOCAL',
            llm_api_key     VARCHAR(500),
            llm_model       VARCHAR(100),
            created_at      TIMESTAMP    NOT NULL DEFAULT now(),
            updated_at      TIMESTAMP    NOT NULL DEFAULT now()
        )
    """),
    ("ix_users_username", """
        CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 5. workflow_states — 工作流状态
    # ────────────────────────────────────────────────────────────────────────
    ("workflow_states", """
        CREATE TABLE IF NOT EXISTS workflow_states (
            id          VARCHAR(36) PRIMARY KEY,
            template_id VARCHAR(36) NOT NULL REFERENCES workflow_templates(id),
            name        VARCHAR(50) NOT NULL,
            "order"     INTEGER     NOT NULL DEFAULT 0,
            category    VARCHAR(20) NOT NULL
        )
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 6. workflow_transitions — 工作流迁移
    # ────────────────────────────────────────────────────────────────────────
    ("workflow_transitions", """
        CREATE TABLE IF NOT EXISTS workflow_transitions (
            id            VARCHAR(36) PRIMARY KEY,
            template_id   VARCHAR(36) NOT NULL REFERENCES workflow_templates(id),
            from_state_id VARCHAR(36) NOT NULL REFERENCES workflow_states(id),
            to_state_id   VARCHAR(36) NOT NULL REFERENCES workflow_states(id),
            name          VARCHAR(50) NOT NULL
        )
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 7. workspaces — 工作空间
    # ────────────────────────────────────────────────────────────────────────
    ("workspaces", """
        CREATE TABLE IF NOT EXISTS workspaces (
            id             VARCHAR(36)  PRIMARY KEY,
            name           VARCHAR(200) NOT NULL,
            key            VARCHAR(50)  NOT NULL,
            description    VARCHAR(1000),
            type           VARCHAR(20)  NOT NULL DEFAULT 'PROJECT',
            status         VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
            phase          VARCHAR(20)  NOT NULL DEFAULT 'PLANNING',
            visibility     VARCHAR(20)  NOT NULL DEFAULT 'PRIVATE',
            department_id  VARCHAR(36)  REFERENCES departments(id),
            owner_id       VARCHAR(36)  REFERENCES users(id),
            template_id    VARCHAR(36),
            strict_gate    BOOLEAN      NOT NULL DEFAULT TRUE,
            git_repo_path  VARCHAR(500),
            created_at     TIMESTAMP    NOT NULL DEFAULT now(),
            updated_at     TIMESTAMP    NOT NULL DEFAULT now()
        )
    """),
    ("ix_workspaces_key", """
        CREATE UNIQUE INDEX IF NOT EXISTS ix_workspaces_key ON workspaces (key)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 8. project_groups — 项目群
    # ────────────────────────────────────────────────────────────────────────
    ("project_groups", """
        CREATE TABLE IF NOT EXISTS project_groups (
            id          VARCHAR(36)  PRIMARY KEY,
            name        VARCHAR(200) NOT NULL,
            description TEXT,
            creator_id  VARCHAR(36)  NOT NULL REFERENCES users(id),
            created_at  TIMESTAMP    NOT NULL DEFAULT now(),
            updated_at  TIMESTAMP    NOT NULL DEFAULT now()
        )
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 9. project_group_items — 项目群成员
    # ────────────────────────────────────────────────────────────────────────
    ("project_group_items", """
        CREATE TABLE IF NOT EXISTS project_group_items (
            id           VARCHAR(36) PRIMARY KEY,
            group_id     VARCHAR(36) NOT NULL REFERENCES project_groups(id) ON DELETE CASCADE,
            workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            UNIQUE (group_id, workspace_id)
        )
    """),
    ("ix_project_group_items_group_id", """
        CREATE INDEX IF NOT EXISTS ix_project_group_items_group_id ON project_group_items (group_id)
    """),
    ("ix_project_group_items_workspace_id", """
        CREATE INDEX IF NOT EXISTS ix_project_group_items_workspace_id ON project_group_items (workspace_id)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 10. documents — 文档
    # ────────────────────────────────────────────────────────────────────────
    ("documents", """
        CREATE TABLE IF NOT EXISTS documents (
            id           VARCHAR(36)  PRIMARY KEY,
            workspace_id VARCHAR(36)  NOT NULL REFERENCES workspaces(id),
            path         VARCHAR(500) NOT NULL,
            title        VARCHAR(500) NOT NULL,
            content      TEXT,
            doc_type     VARCHAR(20)  NOT NULL DEFAULT 'MARKDOWN',
            tags         JSON,
            author_id    VARCHAR(36)  REFERENCES users(id),
            version      INTEGER      NOT NULL DEFAULT 1,
            created_at   TIMESTAMP    NOT NULL DEFAULT now(),
            updated_at   TIMESTAMP    NOT NULL DEFAULT now()
        )
    """),
    ("ix_documents_workspace_id", """
        CREATE INDEX IF NOT EXISTS ix_documents_workspace_id ON documents (workspace_id)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 11. iterations — 迭代
    # ────────────────────────────────────────────────────────────────────────
    ("iterations", """
        CREATE TABLE IF NOT EXISTS iterations (
            id               VARCHAR(36) NOT NULL PRIMARY KEY,
            workspace_id     VARCHAR(36) NOT NULL REFERENCES workspaces(id),
            name             VARCHAR(200) NOT NULL,
            goal             TEXT,
            start_date       DATE        NOT NULL,
            end_date         DATE        NOT NULL,
            capacity_points  FLOAT       NOT NULL DEFAULT 0,
            committed_points FLOAT       NOT NULL DEFAULT 0,
            status           VARCHAR(20) NOT NULL DEFAULT 'PLANNING',
            created_at       TIMESTAMP   NOT NULL DEFAULT now(),
            updated_at       TIMESTAMP   NOT NULL DEFAULT now()
        )
    """),
    ("ix_iterations_workspace_id", """
        CREATE INDEX IF NOT EXISTS ix_iterations_workspace_id ON iterations (workspace_id)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 12. milestones — 里程碑
    # ────────────────────────────────────────────────────────────────────────
    ("milestones", """
        CREATE TABLE IF NOT EXISTS milestones (
            id            VARCHAR(36)  PRIMARY KEY,
            workspace_id  VARCHAR(36)  NOT NULL REFERENCES workspaces(id),
            name          VARCHAR(200) NOT NULL,
            description   TEXT,
            plan          TEXT,
            owner_id      VARCHAR(36)  REFERENCES users(id),
            start_date    DATE,
            end_date      DATE,
            status        VARCHAR(20)  NOT NULL DEFAULT 'UPCOMING',
            phase         VARCHAR(20)  NOT NULL DEFAULT 'PLANNING',
            sort_order    INTEGER      NOT NULL DEFAULT 0,
            color         VARCHAR(20),
            depends_on_id VARCHAR(36)  REFERENCES milestones(id),
            created_at    TIMESTAMP    NOT NULL DEFAULT now(),
            updated_at    TIMESTAMP    NOT NULL DEFAULT now()
        )
    """),
    ("ix_milestones_workspace_id", """
        CREATE INDEX IF NOT EXISTS ix_milestones_workspace_id ON milestones (workspace_id)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 13. user_roles — 用户-角色关联
    # ────────────────────────────────────────────────────────────────────────
    ("user_roles", """
        CREATE TABLE IF NOT EXISTS user_roles (
            id           VARCHAR(36) PRIMARY KEY,
            user_id      VARCHAR(36) NOT NULL REFERENCES users(id),
            role_id      VARCHAR(36) NOT NULL REFERENCES roles(id),
            workspace_id VARCHAR(36) REFERENCES workspaces(id)
        )
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 14. workspace_members — 工作空间成员
    # ────────────────────────────────────────────────────────────────────────
    ("workspace_members", """
        CREATE TABLE IF NOT EXISTS workspace_members (
            id           VARCHAR(36) PRIMARY KEY,
            workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
            user_id      VARCHAR(36) REFERENCES users(id),
            ai_agent_id  VARCHAR(36),
            role         VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
            created_at   TIMESTAMP   NOT NULL DEFAULT now(),
            updated_at   TIMESTAMP   NOT NULL DEFAULT now()
        )
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 15. tasks — 任务（字段最多、外键最多的核心表）
    # ────────────────────────────────────────────────────────────────────────
    ("tasks", """
        CREATE TABLE IF NOT EXISTS tasks (
            id                       VARCHAR(36)  PRIMARY KEY,
            workspace_id             VARCHAR(36)  NOT NULL REFERENCES workspaces(id),
            parent_id                VARCHAR(36)  REFERENCES tasks(id),
            epic_id                  VARCHAR(36)  REFERENCES tasks(id),
            iteration_id             VARCHAR(36)  REFERENCES iterations(id),
            milestone_id             VARCHAR(36)  REFERENCES milestones(id),
            task_type                VARCHAR(20)  NOT NULL DEFAULT 'TASK',
            title                    VARCHAR(500) NOT NULL,
            description              TEXT,
            status                   VARCHAR(20)  NOT NULL DEFAULT 'TODO',
            phase                    VARCHAR(30)  NOT NULL DEFAULT 'REQUIREMENTS',
            priority                 VARCHAR(20)  NOT NULL DEFAULT 'MEDIUM',
            severity                 VARCHAR(20),
            assignee_id              VARCHAR(36)  REFERENCES users(id),
            reviewer_id              VARCHAR(36)  REFERENCES users(id),
            proposer_id              VARCHAR(36)  REFERENCES users(id),
            analyst_id               VARCHAR(36)  REFERENCES users(id),
            qa_owner_id              VARCHAR(36)  REFERENCES users(id),
            acceptance_owner_id      VARCHAR(36)  REFERENCES users(id),
            verifier_id              VARCHAR(36)  REFERENCES users(id),
            reviewer_ids             JSON,
            requirement_review_status VARCHAR(20),
            requirement_reviewer_id  VARCHAR(36)  REFERENCES users(id),
            requirement_review_note  TEXT,
            design_review_status     VARCHAR(20),
            design_reviewer_id       VARCHAR(36)  REFERENCES users(id),
            design_review_note       TEXT,
            prd_doc                  TEXT,
            design_doc               TEXT,
            self_test_report         TEXT,
            test_report              TEXT,
            rating                   INTEGER,
            evaluation               TEXT,
            estimation               FLOAT,
            estimation_unit          VARCHAR(20),
            sort_order               INTEGER      NOT NULL DEFAULT 0,
            due_date                 DATE,
            started_at               TIMESTAMP,
            completed_at             TIMESTAMP,
            created_at               TIMESTAMP    NOT NULL DEFAULT now(),
            updated_at               TIMESTAMP    NOT NULL DEFAULT now()
        )
    """),
    ("ix_tasks_workspace_id", """
        CREATE INDEX IF NOT EXISTS ix_tasks_workspace_id ON tasks (workspace_id)
    """),
    ("ix_tasks_epic_id", """
        CREATE INDEX IF NOT EXISTS ix_tasks_epic_id ON tasks (epic_id)
    """),
    ("ix_tasks_milestone_id", """
        CREATE INDEX IF NOT EXISTS ix_tasks_milestone_id ON tasks (milestone_id)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 16. activity_logs — 活动日志
    # ────────────────────────────────────────────────────────────────────────
    ("activity_logs", """
        CREATE TABLE IF NOT EXISTS activity_logs (
            id          VARCHAR(36)  PRIMARY KEY,
            task_id     VARCHAR(36)  NOT NULL REFERENCES tasks(id),
            user_id     VARCHAR(36)  NOT NULL REFERENCES users(id),
            action_type VARCHAR(50)  NOT NULL,
            field_name  VARCHAR(100),
            old_value   TEXT,
            new_value   TEXT,
            created_at  TIMESTAMP    NOT NULL DEFAULT now(),
            updated_at  TIMESTAMP    NOT NULL DEFAULT now()
        )
    """),
    ("ix_activity_logs_task_id", """
        CREATE INDEX IF NOT EXISTS ix_activity_logs_task_id ON activity_logs (task_id)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 17. attachments — 附件
    # ────────────────────────────────────────────────────────────────────────
    ("attachments", """
        CREATE TABLE IF NOT EXISTS attachments (
            id          VARCHAR(36)   PRIMARY KEY,
            task_id     VARCHAR(36)   NOT NULL REFERENCES tasks(id),
            filename    VARCHAR(500)  NOT NULL,
            file_path   VARCHAR(1000) NOT NULL,
            file_size   INTEGER       NOT NULL DEFAULT 0,
            mime_type   VARCHAR(100)  NOT NULL DEFAULT 'application/octet-stream',
            uploaded_by VARCHAR(36)   NOT NULL REFERENCES users(id),
            created_at  TIMESTAMP     NOT NULL DEFAULT now(),
            updated_at  TIMESTAMP     NOT NULL DEFAULT now()
        )
    """),
    ("ix_attachments_task_id", """
        CREATE INDEX IF NOT EXISTS ix_attachments_task_id ON attachments (task_id)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 18. comments — 评论
    # ────────────────────────────────────────────────────────────────────────
    ("comments", """
        CREATE TABLE IF NOT EXISTS comments (
            id                VARCHAR(36)  PRIMARY KEY,
            task_id           VARCHAR(36)  REFERENCES tasks(id),
            document_id       VARCHAR(36)  REFERENCES documents(id),
            author_id         VARCHAR(36)  NOT NULL REFERENCES users(id),
            parent_comment_id VARCHAR(36)  REFERENCES comments(id),
            content           TEXT         NOT NULL,
            mentions          JSON,
            created_at        TIMESTAMP    NOT NULL DEFAULT now(),
            updated_at        TIMESTAMP    NOT NULL DEFAULT now()
        )
    """),
    ("ix_comments_task_id", """
        CREATE INDEX IF NOT EXISTS ix_comments_task_id ON comments (task_id)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 19. notifications — 通知
    # ────────────────────────────────────────────────────────────────────────
    ("notifications", """
        CREATE TABLE IF NOT EXISTS notifications (
            id           VARCHAR(36)  PRIMARY KEY,
            user_id      VARCHAR(36)  NOT NULL REFERENCES users(id),
            workspace_id VARCHAR(36)  REFERENCES workspaces(id),
            task_id      VARCHAR(36)  REFERENCES tasks(id),
            title        VARCHAR(500) NOT NULL,
            content      TEXT,
            category     VARCHAR(50)  NOT NULL DEFAULT 'INFO',
            is_read      BOOLEAN      NOT NULL DEFAULT FALSE,
            read_at      VARCHAR(30)
        )
    """),
    ("ix_notifications_user_id", """
        CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications (user_id)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 20. requirement_inbox — 需求收件箱
    # ────────────────────────────────────────────────────────────────────────
    ("requirement_inbox", """
        CREATE TABLE IF NOT EXISTS requirement_inbox (
            id               VARCHAR(36)  PRIMARY KEY,
            workspace_id     VARCHAR(36)  NOT NULL REFERENCES workspaces(id),
            title            VARCHAR(500) NOT NULL,
            description      TEXT,
            source           VARCHAR(20)  NOT NULL DEFAULT 'MANUAL',
            submitter_id     VARCHAR(36)  NOT NULL REFERENCES users(id),
            status           VARCHAR(20)  NOT NULL DEFAULT 'TRIAGE',
            converted_task_id VARCHAR(36) REFERENCES tasks(id),
            triage_note      TEXT,
            created_at       TIMESTAMP    NOT NULL DEFAULT now(),
            updated_at       TIMESTAMP    NOT NULL DEFAULT now()
        )
    """),
    ("ix_requirement_inbox_workspace_id", """
        CREATE INDEX IF NOT EXISTS ix_requirement_inbox_workspace_id ON requirement_inbox (workspace_id)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 21. task_progress — 任务进度记录
    # ────────────────────────────────────────────────────────────────────────
    ("task_progress", """
        CREATE TABLE IF NOT EXISTS task_progress (
            id         VARCHAR(36) PRIMARY KEY,
            task_id    VARCHAR(36) NOT NULL REFERENCES tasks(id),
            progress   INTEGER     NOT NULL,
            note       TEXT,
            created_by VARCHAR(36) NOT NULL REFERENCES users(id),
            created_at TIMESTAMP   NOT NULL
        )
    """),
    ("ix_task_progress_task_id", """
        CREATE INDEX IF NOT EXISTS ix_task_progress_task_id ON task_progress (task_id)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 22. risks — 风险
    # ────────────────────────────────────────────────────────────────────────
    ("risks", """
        CREATE TABLE IF NOT EXISTS risks (
            id           VARCHAR(36)  PRIMARY KEY,
            workspace_id VARCHAR(36)  NOT NULL REFERENCES workspaces(id),
            milestone_id VARCHAR(36)  REFERENCES milestones(id),
            title        VARCHAR(500) NOT NULL,
            description  TEXT,
            risk_type    VARCHAR(20)  NOT NULL DEFAULT 'OTHER',
            probability  VARCHAR(20)  NOT NULL DEFAULT 'MEDIUM',
            impact       VARCHAR(20)  NOT NULL DEFAULT 'MEDIUM',
            status       VARCHAR(20)  NOT NULL DEFAULT 'IDENTIFIED',
            mitigation   TEXT,
            owner_id     VARCHAR(36)  REFERENCES users(id),
            closed_at    TIMESTAMP,
            created_at   TIMESTAMP    NOT NULL DEFAULT now(),
            updated_at   TIMESTAMP    NOT NULL DEFAULT now()
        )
    """),
    ("ix_risks_workspace_id", """
        CREATE INDEX IF NOT EXISTS ix_risks_workspace_id ON risks (workspace_id)
    """),
    ("ix_risks_milestone_id", """
        CREATE INDEX IF NOT EXISTS ix_risks_milestone_id ON risks (milestone_id)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 23. chat_history — AI 对话历史
    # ────────────────────────────────────────────────────────────────────────
    ("chat_history", """
        CREATE TABLE IF NOT EXISTS chat_history (
            id                 VARCHAR(36) PRIMARY KEY,
            user_id            VARCHAR(36) NOT NULL REFERENCES users(id),
            role               VARCHAR(16) NOT NULL,
            content            TEXT        NOT NULL,
            agent              VARCHAR(32),
            tool_actions       JSON,
            tool_calls         JSON,
            tool_call_id       VARCHAR(64),
            conversation_id    VARCHAR(36),
            workspace_id       VARCHAR(36),
            conversation_title VARCHAR(64),
            created_at         TIMESTAMP   NOT NULL DEFAULT now()
        )
    """),
    ("ix_chat_history_user_id", """
        CREATE INDEX IF NOT EXISTS ix_chat_history_user_id ON chat_history (user_id)
    """),
    ("ix_chat_history_conversation_id", """
        CREATE INDEX IF NOT EXISTS ix_chat_history_conversation_id ON chat_history (conversation_id)
    """),
    ("ix_chat_history_user_ws_created", """
        CREATE INDEX IF NOT EXISTS ix_chat_history_user_ws_created ON chat_history (user_id, workspace_id, created_at)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 24. meetings — 会议
    # ────────────────────────────────────────────────────────────────────────
    ("meetings", """
        CREATE TABLE IF NOT EXISTS meetings (
            id           VARCHAR(36)  PRIMARY KEY,
            title        VARCHAR(200) NOT NULL,
            dimension    VARCHAR(20)  NOT NULL DEFAULT 'PROJECT',
            dimension_id VARCHAR(36)  NOT NULL,
            meeting_type VARCHAR(20)  NOT NULL DEFAULT 'WEEKLY',
            status       VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
            summary      TEXT,
            notes        JSON,
            host_id      VARCHAR(36)  NOT NULL REFERENCES users(id),
            created_at   TIMESTAMP    NOT NULL DEFAULT now(),
            updated_at   TIMESTAMP    NOT NULL DEFAULT now()
        )
    """),
    ("ix_meetings_dimension_id", """
        CREATE INDEX IF NOT EXISTS ix_meetings_dimension_id ON meetings (dimension_id)
    """),

    # ────────────────────────────────────────────────────────────────────────
    # 25. alembic_version — Alembic 迁移版本记录
    # ────────────────────────────────────────────────────────────────────────
    ("alembic_version", """
        CREATE TABLE IF NOT EXISTS alembic_version (
            version_num VARCHAR(32) NOT NULL PRIMARY KEY
        )
    """),
]

# ═══════════════════════════════════════════════════════════════════════════════
# 种子数据
# ═══════════════════════════════════════════════════════════════════════════════

def _make_seed_statements(admin_password: str = "admin123"):
    """生成种子数据 SQL，管理员密码在运行时用 bcrypt 哈希。"""
    try:
        import bcrypt
        pwd_hash = bcrypt.hashpw(admin_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    except ImportError:
        # 如果 bcrypt 未安装，用固定哈希（密码仍为 admin123）
        pwd_hash = "$2b$12$LJ3m4ys3LkBCVxJGqOjPkevGzQZtM5UfHXNMq0Qmz0kqHcVpPxOXq"
        print("  ⚠  bcrypt 未安装，使用预置密码哈希（用户名: admin, 密码: admin123）")

    return [
        # 默认部门
        ("INSERT INTO departments (id, name, path) VALUES ('dept-001', '默认部门', '/默认部门') "
         "ON CONFLICT (id) DO NOTHING"),

        # 管理员用户
        ("INSERT INTO users (id, username, email, hashed_password, display_name, department_id, system_role, status, source) "
         f"VALUES ('admin-001', 'admin', 'admin@ai-pm.local', '{pwd_hash}', "
         "'超级管理员', 'dept-001', 'SUPER_ADMIN', 'ACTIVE', 'LOCAL') "
         "ON CONFLICT (id) DO NOTHING"),

        # 默认角色
        ("INSERT INTO roles (id, code, name, level, permissions) VALUES "
         "('role-admin', 'admin', '系统管理员', 'SYSTEM', '{\"all\": true}') "
         "ON CONFLICT (id) DO NOTHING"),
        ("INSERT INTO roles (id, code, name, level, permissions) VALUES "
         "('role-pm', 'pm', '项目经理', 'WORKSPACE', '{\"project\": \"manage\", \"task\": \"manage\"}') "
         "ON CONFLICT (id) DO NOTHING"),
        ("INSERT INTO roles (id, code, name, level, permissions) VALUES "
         "('role-dev', 'dev', '开发工程师', 'WORKSPACE', '{\"task\": \"edit\", \"doc\": \"edit\"}') "
         "ON CONFLICT (id) DO NOTHING"),

        # 工作流模板
        ("INSERT INTO workflow_templates (id, name, description, is_builtin) VALUES "
         "('tmpl-full', '完整研发流程', '6阶段SDLC：需求池→规划→设计→开发→测试→发布', TRUE) "
         "ON CONFLICT (id) DO NOTHING"),
        ("INSERT INTO workflow_templates (id, name, description, is_builtin) VALUES "
         "('tmpl-lite', '轻量专题流程', '4阶段轻量流程：计划→执行→审核→完成', TRUE) "
         "ON CONFLICT (id) DO NOTHING"),
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# 主逻辑
# ═══════════════════════════════════════════════════════════════════════════════

def get_conn():
    """创建数据库连接。"""
    try:
        import psycopg2
    except ImportError:
        sys.exit("请先安装 psycopg2: pip install psycopg2-binary")

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True  # DDL 需要自动提交
        return conn
    except psycopg2.OperationalError as e:
        sys.exit(f"数据库连接失败: {e}\n请检查 DB_CONFIG 配置是否正确。")


def drop_all_tables(cur):
    """删除所有 AI-PM 相关表（CASCADE 删除依赖）。"""
    # 从 ALL_TABLES 中提取所有表名，倒序删除（避免外键依赖问题）
    table_names = [name for name, _ in ALL_TABLES if not name.startswith("ix_")]
    for name in reversed(table_names):
        cur.execute(f"DROP TABLE IF EXISTS {name} CASCADE")
        print(f"  🗑  已删除: {name}")


def create_all_tables(cur):
    """按依赖顺序创建所有表和索引。"""
    ok = fail = 0
    for name, sql in ALL_TABLES:
        try:
            cur.execute(sql)
            if name.startswith("ix_"):
                print(f"  📌 索引: {name}")
            else:
                print(f"  ✅ 建表: {name}")
            ok += 1
        except Exception as e:
            print(f"  ❌ 失败: {name} — {e}")
            fail += 1
    return ok, fail


def load_seed_data(cur):
    """加载种子数据。"""
    ok = fail = 0
    for sql in _make_seed_statements():
        try:
            cur.execute(sql)
            ok += 1
        except Exception as e:
            print(f"  ⚠ 种子数据插入失败: {e}")
            fail += 1
    if ok:
        print(f"  ✅ 种子数据: {ok} 条已处理")


def main():
    parser = argparse.ArgumentParser(
        description="AI-PM 数据库完整初始化（独立版，仅依赖 psycopg2）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python init_pg.py              # 创建所有表（幂等，已有表不重复创建）
  python init_pg.py --reset      # 先删除再重建（⚠️ 清空全部数据）
  python init_pg.py --seed       # 创建表 + 加载种子数据
        """,
    )
    parser.add_argument("--reset", action="store_true",
                        help="先删除所有表再重建（⚠️ 清空全部数据）")
    parser.add_argument("--seed", action="store_true",
                        help="加载种子数据（管理员、角色、工作流模板）")
    args = parser.parse_args()

    conn_str = f"postgresql://{DB_CONFIG['user']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}"
    print(f"数据库: {conn_str}")
    print(f"模式: {'删除重建' if args.reset else '幂等创建（已有表不重复）'}")
    print("━" * 50)

    conn = get_conn()
    cur = conn.cursor()

    if args.reset:
        print("\n[1/2] 删除现有表…")
        drop_all_tables(cur)

        print("\n[2/2] 创建所有表…")
        ok, fail = create_all_tables(cur)
    else:
        print("\n创建所有表（IF NOT EXISTS）…")
        ok, fail = create_all_tables(cur)

    print(f"\n表创建: {ok} 成功, {fail} 失败")

    if args.seed:
        print("\n加载种子数据…")
        load_seed_data(cur)

    cur.close()
    conn.close()

    print("━" * 50)
    if fail == 0:
        print("数据库初始化完成 ✓")
    else:
        print(f"数据库初始化完成（{fail} 项失败，请检查上方错误）")


if __name__ == "__main__":
    main()
