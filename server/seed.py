"""Seed initial data: admin user, default department, roles, two workspace types."""
import asyncio
import os
import sys
sys.path.insert(0, ".")

from datetime import date, timedelta, datetime

from app.database import engine, async_session
from sqlalchemy import select as sa_select, update as sa_update
from app.models.user import User
from app.models.chat_history import ChatHistory
from app.models.user_role import UserRole
from app.models.workspace_member import WorkspaceMember
from app.models.notification import Notification
from app.models.activity_log import ActivityLog
from app.models.comment import Comment
from app.models.document import Document
from app.models.workspace import Workspace
from app.models.milestone import Milestone
from app.models.risk import Risk
from app.models.attachment import Attachment
from app.models.requirement_inbox import RequirementInbox
from app.models.task_progress import TaskProgress
from app.models.meeting import Meeting
from app.models.department import Department
from app.models.role import Role
from app.models.workflow import WorkflowTemplate, WorkflowState, WorkflowTransition
from app.models.iteration import Iteration
from app.models.task import Task
from app.models.project_group import ProjectGroup, ProjectGroupItem
from app.security import hash_password

SKIP_DDL = os.environ.get("SKIP_DDL", "").lower() in ("1", "true", "yes")


async def seed():
    async with async_session() as db:
        # Fix any previously corrupted rows where parent_id was set to empty string
        result = await db.execute(sa_update(Department).where(Department.parent_id == '').values(parent_id=None))
        if result.rowcount:
            await db.commit()
        # Fix users with empty department_id
        result = await db.execute(sa_update(User).where(User.department_id == '').values(department_id=None))
        if result.rowcount:
            await db.commit()

        # Idempotent: if admin user already exists, skip seeding.
        # This handles all partial-run and re-seed scenarios without FK issues.
        existing = await db.execute(sa_select(User).where(User.username == "admin"))
        if existing.first() is not None:
            print("Seed data already exists, skipping...")
            await engine.dispose()
            return

        # Clean slate: delete all seed-created records.
        # Collect user IDs in dept-001 first, since many tables reference users.id
        # without ondelete="CASCADE".
        user_result = await db.execute(
            sa_select(User).where(User.department_id == "dept-001")
        )
        dept_user_ids = [row.id for row in user_result]

        # Delete child records that reference users.id (no CASCADE on these FKs)
        for uid in dept_user_ids:
            await db.execute(ChatHistory.__table__.delete().where(ChatHistory.user_id == uid))
            await db.execute(UserRole.__table__.delete().where(UserRole.user_id == uid))
            await db.execute(WorkspaceMember.__table__.delete().where(WorkspaceMember.user_id == uid))
            await db.execute(Notification.__table__.delete().where(Notification.user_id == uid))
            await db.execute(ActivityLog.__table__.delete().where(ActivityLog.user_id == uid))
            await db.execute(Comment.__table__.delete().where(Comment.author_id == uid))
            await db.execute(Document.__table__.delete().where(Document.author_id == uid))
            await db.execute(Milestone.__table__.delete().where(Milestone.owner_id == uid))
            await db.execute(Risk.__table__.delete().where(Risk.owner_id == uid))
            await db.execute(Attachment.__table__.delete().where(Attachment.uploaded_by == uid))
            await db.execute(RequirementInbox.__table__.delete().where(RequirementInbox.submitter_id == uid))
            await db.execute(TaskProgress.__table__.delete().where(TaskProgress.created_by == uid))
            await db.execute(Meeting.__table__.delete().where(Meeting.host_id == uid))

        # Delete tasks that reference users.id via assignee, reviewer, proposer, etc.
        for uid in dept_user_ids:
            await db.execute(
                Task.__table__.delete().where(
                    Task.assignee_id == uid
                )
            )
            await db.execute(
                Task.__table__.delete().where(
                    Task.reviewer_id == uid
                )
            )
            await db.execute(
                Task.__table__.delete().where(
                    Task.proposer_id == uid
                )
            )
            await db.execute(
                Task.__table__.delete().where(
                    Task.analyst_id == uid
                )
            )
            await db.execute(
                Task.__table__.delete().where(
                    Task.qa_owner_id == uid
                )
            )
            await db.execute(
                Task.__table__.delete().where(
                    Task.requirement_reviewer_id == uid
                )
            )
            await db.execute(
                Task.__table__.delete().where(
                    Task.design_reviewer_id == uid
                )
            )

        await db.execute(Milestone.__table__.delete())
        await db.execute(Iteration.__table__.delete())
        await db.execute(Task.__table__.delete())
        await db.execute(ProjectGroupItem.__table__.delete())
        await db.execute(ProjectGroup.__table__.delete())
        await db.execute(WorkflowTransition.__table__.delete())
        await db.execute(WorkflowState.__table__.delete())
        await db.execute(WorkflowTemplate.__table__.delete())
        await db.execute(WorkspaceMember.__table__.delete())
        await db.execute(Workspace.__table__.delete())
        await db.execute(Role.__table__.delete())
        # demo members live in sub-departments; remove them + the whole seed org subtree
        await db.execute(User.__table__.delete().where(User.username.in_(["lisi", "wangwu", "zhangsan", "zhaoliu"])))
        await db.execute(User.__table__.delete().where(User.department_id == "dept-001"))
        # delete child departments (parent_id set) before the root to satisfy FK
        await db.execute(Department.__table__.delete().where(Department.parent_id.isnot(None)))
        await db.execute(Department.__table__.delete().where(Department.id == "dept-001"))
        await db.flush()

        dept = Department(id="dept-001", name="默认部门", path="/默认部门")
        db.add(dept)

        admin = User(
            username="admin",
            email="admin@ai-pm.local",
            hashed_password=hash_password("AiPm@2026#Secure"),
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

        # ═══ Meeting big-screen demo: project group with multi-project timeline ═══
        # Org tree (multi-level) so "按组织架构全选项目" and 看板分组 are demonstrable:
        #   技术中心 → { 后端组, 前端组 } ; 产品中心
        tech_center = Department(name="技术中心", parent_id="dept-001", path="/默认部门/技术中心", sort_order=1)
        prod_center = Department(name="产品中心", parent_id="dept-001", path="/默认部门/产品中心", sort_order=2)
        db.add_all([tech_center, prod_center])
        await db.flush()
        be_group = Department(name="后端组", parent_id=tech_center.id, path="/默认部门/技术中心/后端组", sort_order=1)
        fe_group = Department(name="前端组", parent_id=tech_center.id, path="/默认部门/技术中心/前端组", sort_order=2)
        db.add_all([be_group, fe_group])
        await db.flush()

        # Extra members so key-person lanes show multiple people with varied load.
        # Each demo lead sits in a different (sub)department.
        demo_user_defs = [
            ("lisi", "李四", fe_group.id),      # 前端组
            ("wangwu", "王五", be_group.id),    # 后端组
            ("zhangsan", "张三", tech_center.id),  # 技术中心（直属）
            ("zhaoliu", "赵六", prod_center.id),   # 产品中心
        ]
        demo_users = []
        for uname, dname, dept_id in demo_user_defs:
            u = User(
                username=uname, email=f"{uname}@ai-pm.local",
                hashed_password=hash_password("AiPm@2026#Secure"),
                display_name=dname, department_id=dept_id,
                system_role="MEMBER", status="ACTIVE", source="LOCAL",
            )
            db.add(u)
            demo_users.append(u)
        await db.flush()
        li, wang, zhang, zhao = demo_users

        # 3 demo workspaces, each owned by a different lead (→ different departments)
        demo_ws_defs = [
            ("Q3大版本改版", "Q3-REVAMP", zhang),
            ("数据平台2.0", "DATA-PLAT", wang),
            ("运营中台", "OPS-MID", zhang),
        ]
        demo_workspaces = []
        for name, key, lead in demo_ws_defs:
            ws = Workspace(
                name=name, key=key, description=f"{name} 演示项目",
                type="PROJECT", status="ACTIVE", visibility="PRIVATE",
                template_id=tmpl_full.id, owner_id=lead.id,
            )
            db.add(ws)
            demo_workspaces.append(ws)
        await db.flush()
        for ws, (_, _, lead) in zip(demo_workspaces, demo_ws_defs):
            db.add(WorkspaceMember(workspace_id=ws.id, user_id=lead.id, role="OWNER"))

        # Milestone plans per workspace: (name, phase, start_offset, end_offset, owner)
        # offsets are days relative to today → spread across done/late/risk/upcoming.
        ws_q3, ws_data, ws_ops = demo_workspaces
        ms_plans = {
            ws_q3.id: [
                ("需求分析", "DONE", -45, -35, zhang),
                ("核心开发", "ACTIVE", -34, -3, li),       # end in past, not done → late
                ("UI Review", "ACTIVE", -2, 5, li),        # end within 7d → risk
                ("上线", "PLANNING", 25, 35, zhang),        # future → upcoming
            ],
            ws_data.id: [
                ("数据清洗", "DONE", -40, -25, wang),
                ("核心开发", "ACTIVE", -24, 10, wang),      # active
                ("测试", "PLANNING", 20, 30, zhao),         # upcoming
            ],
            ws_ops.id: [
                ("需求与设计", "ACTIVE", -10, 6, zhang),     # risk (end within 7d)
                ("开发", "PLANNING", 18, 40, zhang),        # upcoming
                ("上线", "PLANNING", 45, 55, zhang),        # upcoming
            ],
        }
        demo_ms_ids = {}  # ws_id -> [milestone,...]
        for ws in demo_workspaces:
            chain = []
            for i, (name, phase, so, eo, owner) in enumerate(ms_plans[ws.id]):
                ms = Milestone(
                    workspace_id=ws.id, name=name, phase=phase, sort_order=i,
                    start_date=today + timedelta(days=so),
                    end_date=today + timedelta(days=eo),
                    owner_id=owner.id,
                )
                db.add(ms)
                chain.append(ms)
            await db.flush()
            for i in range(1, len(chain)):
                chain[i].depends_on_id = chain[i - 1].id
            demo_ms_ids[ws.id] = chain

        # Tasks per milestone: enough to exercise done / overdue / in-progress + key persons.
        def _add_task(ws, ms, title, status, assignee, due_off=None, done_off=None):
            db.add(Task(
                workspace_id=ws.id, milestone_id=ms.id, task_type="TASK",
                title=title, status=status, phase="DEVELOPMENT",
                assignee_id=assignee.id,
                due_date=(today + timedelta(days=due_off)) if due_off is not None else None,
                completed_at=(datetime.combine(today + timedelta(days=done_off), datetime.min.time())) if done_off is not None else None,
            ))

        q3 = demo_ms_ids[ws_q3.id]
        _add_task(ws_q3, q3[0], "PRD 编写", "DONE", zhang, done_off=-38)
        _add_task(ws_q3, q3[1], "接口开发", "IN_PROGRESS", li, due_off=-3)   # overdue → li blocked
        _add_task(ws_q3, q3[1], "数据迁移", "DONE", wang, done_off=-5)
        _add_task(ws_q3, q3[2], "前端首页重构", "TODO", li, due_off=4)
        _add_task(ws_q3, q3[2], "线框图评审", "DONE", zhao, done_off=-1)

        dp = demo_ms_ids[ws_data.id]
        _add_task(ws_data, dp[0], "清洗管道", "DONE", wang, done_off=-28)
        _add_task(ws_data, dp[1], "特征工程", "IN_PROGRESS", wang, due_off=8)
        _add_task(ws_data, dp[1], "离线调度", "IN_PROGRESS", zhao, due_off=9)

        op = demo_ms_ids[ws_ops.id]
        _add_task(ws_ops, op[0], "用户模块重构", "IN_PROGRESS", zhang, due_off=-5)  # overdue
        _add_task(ws_ops, op[0], "权限设计", "TODO", zhang, due_off=6)

        # Risks (non-closed) linked to milestones, with mitigation.
        db.add(Risk(
            workspace_id=ws_q3.id, milestone_id=q3[1].id, title="前端重构延期，阻塞 UI Review",
            risk_type="SCHEDULE", impact="HIGH", probability="HIGH", status="IDENTIFIED",
            owner_id=li.id, mitigation="协调李四负载，或拆分任务并行推进",
        ))
        db.add(Risk(
            workspace_id=ws_ops.id, milestone_id=op[0].id, title="用户模块重构 5 天无更新",
            risk_type="SCHEDULE", impact="MEDIUM", probability="MEDIUM", status="MITIGATING",
            owner_id=zhang.id, mitigation="跟进负责人确认进展，评估是否需要支援",
        ))

        # Project group + meeting over the 3 workspaces
        group = ProjectGroup(name="公司重点项目群", description="季度重点项目汇报", creator_id=admin.id)
        db.add(group)
        await db.flush()
        for ws in demo_workspaces:
            db.add(ProjectGroupItem(group_id=group.id, workspace_id=ws.id))
        demo_meeting = Meeting(
            title="Q3 项目群周会", dimension="PROJECT_GROUP", dimension_id=group.id,
            meeting_type="WEEKLY", status="ACTIVE", host_id=admin.id,
        )
        db.add(demo_meeting)

        await db.commit()
        print(f"Seed data created: admin/admin123")
        print(f"  [PROJECT] R&D workspace={ws_rd.id} | Iterations: {len(iterations)} | Backlog: {len(backlog_stories)} Stories | Planned: 1 Story + {len(task_defs_rd)} Tasks + 1 Bug")
        print(f"  [TOPIC]  Topic workspace={ws_topic.id} | Milestones: {len(milestones)} | Tasks: {len(topic_task_defs)} Tasks")
        print(f"  [GROUP]  项目群={group.id} | 3 workspaces | Meeting(timeline)={demo_meeting.id}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
