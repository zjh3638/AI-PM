"""Seed initial data: admin user, default department, roles, two workspace types."""
import asyncio
import os
import sys
sys.path.insert(0, ".")

from datetime import date, timedelta

from app.database import engine, async_session
from app.models.user import User
from app.models.department import Department
from app.models.role import Role
from app.models.workspace import Workspace
from app.models.workspace_member import WorkspaceMember
from app.models.workflow import WorkflowTemplate, WorkflowState, WorkflowTransition
from app.models.milestone import Milestone
from app.models.iteration import Iteration
from app.models.task import Task
from app.security import hash_password

SKIP_DDL = os.environ.get("SKIP_DDL", "").lower() in ("1", "true", "yes")


async def seed():
    # DDL is handled by Alembic migrations
    async with async_session() as db:
        dept = Department(id="dept-001", name="默认部门", path="/默认部门")
        db.add(dept)

        admin = User(
            username="admin",
            email="admin@ai-pm.local",
            hashed_password=hash_password("admin123"),
            display_name="超级管理员",
            department_id="dept-001",
            system_role="SUPER_ADMIN",
            status="ACTIVE",
            source="LOCAL",
        )
        db.add(admin)

        roles = [
            Role(id="role-admin", name="系统管理员", code="admin", level="SYSTEM", permissions={"all": True}),
            Role(id="role-pm", name="项目经理", code="pm", level="WORKSPACE", permissions={"project": "manage", "task": "manage"}),
            Role(id="role-dev", name="开发工程师", code="dev", level="WORKSPACE", permissions={"task": "edit", "doc": "edit"}),
        ]
        db.add_all(roles)

        await db.flush()

        # ═══ Workflow Templates ═══
        tmpl_full = WorkflowTemplate(name="完整研发流程", description="6阶段SDLC：需求池→规划→设计→开发→测试→发布", is_builtin=True)
        tmpl_lite = WorkflowTemplate(name="轻量专题流程", description="4阶段轻量流程：计划→执行→审核→完成", is_builtin=True)
        db.add_all([tmpl_full, tmpl_lite])
        await db.flush()

        # Full SDLC states
        full_states = [
            WorkflowState(template_id=tmpl_full.id, name="需求池", order=0, category="TODO"),
            WorkflowState(template_id=tmpl_full.id, name="需求规划", order=1, category="TODO"),
            WorkflowState(template_id=tmpl_full.id, name="方案设计", order=2, category="IN_PROGRESS"),
            WorkflowState(template_id=tmpl_full.id, name="开发实现", order=3, category="IN_PROGRESS"),
            WorkflowState(template_id=tmpl_full.id, name="测试验证", order=4, category="IN_REVIEW"),
            WorkflowState(template_id=tmpl_full.id, name="发布上线", order=5, category="DONE"),
        ]
        db.add_all(full_states)
        await db.flush()

        # Full SDLC transitions
        for i in range(len(full_states) - 1):
            db.add(WorkflowTransition(template_id=tmpl_full.id, from_state_id=full_states[i].id, to_state_id=full_states[i+1].id, name=f"{full_states[i].name}→{full_states[i+1].name}"))

        # Lite topic states
        lite_states = [
            WorkflowState(template_id=tmpl_lite.id, name="计划", order=0, category="TODO"),
            WorkflowState(template_id=tmpl_lite.id, name="执行中", order=1, category="IN_PROGRESS"),
            WorkflowState(template_id=tmpl_lite.id, name="审核中", order=2, category="IN_REVIEW"),
            WorkflowState(template_id=tmpl_lite.id, name="已完成", order=3, category="DONE"),
        ]
        db.add_all(lite_states)
        await db.flush()

        for i in range(len(lite_states) - 1):
            db.add(WorkflowTransition(template_id=tmpl_lite.id, from_state_id=lite_states[i].id, to_state_id=lite_states[i+1].id, name=f"{lite_states[i].name}→{lite_states[i+1].name}"))

        await db.flush()

        # ═══ Workspace 1: R&D project (PROJECT type) — iterations only, no milestones ═══
        ws_rd = Workspace(
            name="AI-PM 平台开发",
            key="AI-PM-PLATFORM",
            description="AI 驱动的项目管理平台研发",
            type="PROJECT",
            status="ACTIVE",
            visibility="PRIVATE",
            template_id=tmpl_full.id,
        )
        db.add(ws_rd)
        await db.flush()

        member = WorkspaceMember(workspace_id=ws_rd.id, user_id=admin.id, role="OWNER")
        db.add(member)

        # Create iterations for R&D project
        today = date.today()
        iterations = []
        iter_defs = [
            ("Sprint 1", "核心框架搭建：用户认证、工作空间CRUD、RBAC权限", today + timedelta(days=-7), today + timedelta(days=7), 32),
            ("Sprint 2", "任务看板、里程碑管理、6阶段SDLC门控", today + timedelta(days=8), today + timedelta(days=21), 40),
            ("Sprint 3", "AI Agent 集成、知识库、附件上传", today + timedelta(days=22), today + timedelta(days=35), 36),
        ]
        for name, goal, start, end, cap in iter_defs:
            it = Iteration(
                workspace_id=ws_rd.id, name=name, goal=goal,
                start_date=start, end_date=end, capacity_points=cap,
                status="ACTIVE" if start <= today <= end else "PLANNING",
            )
            iterations.append(it)
            db.add(it)
        await db.flush()

        # Backlog stories (unplanned, no iteration_id)
        backlog_stories = [
            ("AI Agent 需求分析自动生成", "利用 LLM 从自然语言描述自动生成 PRD 文档和用户故事", 5),
            ("多语言国际化支持", "支持中英文双语界面切换，包括所有表单和错误提示", 8),
        ]
        backlog_s_ids = []
        for title, desc, est in backlog_stories:
            bs = Task(
                workspace_id=ws_rd.id,
                task_type="STORY", title=title, description=desc,
                status="DONE", phase="PLAN", priority="HIGH",
                assignee_id=admin.id, proposer_id=admin.id, qa_owner_id=admin.id, estimation=est,
                requirement_review_status="APPROVED",
            )
            backlog_s_ids.append(bs.id)
            db.add(bs)
        await db.flush()

        # Create Story + Tasks under Sprint 1
        story1 = Task(
            workspace_id=ws_rd.id, iteration_id=iterations[0].id,
            task_type="STORY", title="用户注册登录模块",
            description="实现用户注册、登录、密码找回功能",
            status="IN_PROGRESS", phase="DEVELOPMENT", priority="HIGH",
            assignee_id=admin.id, proposer_id=admin.id, qa_owner_id=admin.id,
            analyst_id=admin.id,
            requirement_review_status="APPROVED", requirement_reviewer_id=admin.id,
            requirement_review_note="已评审通过",
            design_review_status="APPROVED", design_reviewer_id=admin.id,
            design_review_note="技术方案评审通过，可以拆分开发任务",
        )
        db.add(story1)
        await db.flush()

        task_defs_rd = [
            ("注册页面 UI", "设计注册表单页面并前端实现", 3, 2),
            ("登录 API 接口", "实现JWT登录验证接口", 2, 3),
            ("密码加密存储", "使用bcrypt加密存储用户密码", 2, 2),
            ("Token 签发与验证", "实现JWT token签发和刷新逻辑", 3, 4),
            ("找回密码邮件发送", "实现密码重置邮件发送功能", 2, 5),
        ]
        for i, (title, desc, est, days) in enumerate(task_defs_rd):
            task = Task(
                workspace_id=ws_rd.id, iteration_id=iterations[1].id,  # Sprint 2
                parent_id=story1.id,
                task_type="TASK", title=title, description=desc,
                status="TODO", phase="DEVELOPMENT",
                assignee_id=admin.id, sort_order=i,
                estimation=est,
                due_date=today + timedelta(days=days),
            )
            db.add(task)

        bug1 = Task(
            workspace_id=ws_rd.id, iteration_id=iterations[0].id,
            task_type="BUG", title="登录页密码框明文显示",
            description="密码输入时未做掩码处理",
            status="TODO", phase="DEVELOPMENT", priority="CRITICAL",
            proposer_id=admin.id, assignee_id=admin.id,
            due_date=today + timedelta(days=1),
        )
        db.add(bug1)

        await db.flush()

        # ═══ Workspace 2: Topic project (TOPIC type) — milestones only, no iterations ═══
        ws_topic = Workspace(
            name="技术调研专项",
            key="TECH-RESEARCH",
            description="新技术预研、竞品分析、技术方案评审",
            type="TOPIC",
            status="ACTIVE",
            visibility="PRIVATE",
            template_id=tmpl_lite.id,
        )
        db.add(ws_topic)
        await db.flush()

        member2 = WorkspaceMember(workspace_id=ws_topic.id, user_id=admin.id, role="OWNER")
        db.add(member2)

        milestone_names = [
            ("竞品调研", "调研Jira/Linear/TAPD等竞品功能差异"),
            ("技术选型", "确定前端框架、后端架构、AI模型方案"),
            ("原型设计", "输出8个页面的高保真原型"),
            ("可行性评审", "技术可行性评审与风险评估"),
        ]
        milestones = []
        for i, (name, desc) in enumerate(milestone_names):
            ms = Milestone(
                workspace_id=ws_topic.id, name=name, description=desc,
                phase="ACTIVE" if i == 0 else ("DONE" if i < 1 else "PLANNING"),
                sort_order=i,
                start_date=today + timedelta(days=i * 7 - 7 if i > 0 else -7),
                end_date=today + timedelta(days=(i + 1) * 7 - 7),
            )
            milestones.append(ms)
            db.add(ms)
        await db.flush()
        # Set milestone dependency chain
        for i in range(1, len(milestones)):
            milestones[i].depends_on_id = milestones[i - 1].id

        topic_task_defs = [
            ("Jira功能对比", 5, 0),
            ("Linear体验分析", 3, 0),
            ("TAPD优劣势总结", 2, 1),
            ("React vs Vue决策矩阵", 4, 1),
            ("FastAPI vs Django对比", 3, 2),
            ("LOGO设计方案", 1, 2),
        ]
        for i, (title, est, ms_idx) in enumerate(topic_task_defs):
            task = Task(
                workspace_id=ws_topic.id, milestone_id=milestones[ms_idx].id,
                task_type="TASK", title=title,
                status="TODO", phase="DEVELOPMENT",
                assignee_id=admin.id, sort_order=i,
                estimation=est,
                due_date=today + timedelta(days=(ms_idx + 1) * 7),
            )
            db.add(task)

        await db.commit()
        print(f"Seed data created: admin/admin123")
        print(f"  [PROJECT] R&D workspace={ws_rd.id} | Iterations: {len(iterations)} | Backlog: {len(backlog_stories)} Stories | Planned: 1 Story + {len(task_defs_rd)} Tasks + 1 Bug")
        print(f"  [TOPIC]  Topic workspace={ws_topic.id} | Milestones: {len(milestones)} | Tasks: {len(topic_task_defs)} Tasks")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
