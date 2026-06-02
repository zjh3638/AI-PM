"""Seed initial data: admin user, default department, roles, workspace with milestones."""
import asyncio
import sys
sys.path.insert(0, ".")

from app.database import engine, async_session, Base
from app.models.user import User
from app.models.department import Department
from app.models.role import Role
from app.models.workspace import Workspace
from app.models.workspace_member import WorkspaceMember
from app.models.milestone import Milestone
from app.models.task import Task
from app.security import hash_password


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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

        # Create a demo workspace
        ws = Workspace(
            name="AI-PM 平台开发",
            key="AI-PM-PLATFORM",
            description="AI 驱动的项目管理平台研发",
            type="PROJECT",
            status="ACTIVE",
            visibility="PRIVATE",
        )
        db.add(ws)
        await db.flush()

        # Add admin as owner
        member = WorkspaceMember(workspace_id=ws.id, user_id=admin.id, role="OWNER")
        db.add(member)

        # Create milestones
        milestone_names = [
            "需求分析阶段", "UI交互设计", "后端核心开发",
            "API联调", "集成测试", "Beta发布", "正式上线",
        ]
        milestones = []
        for name in milestone_names:
            ms = Milestone(workspace_id=ws.id, name=name, status="UPCOMING", sort_order=len(milestones))
            milestones.append(ms)
            db.add(ms)
        await db.flush()

        # Create a sample Story with some tasks
        story = Task(
            workspace_id=ws.id, milestone_id=milestones[0].id,
            task_type="STORY", title="用户注册登录模块",
            description="实现用户注册、登录、密码找回功能",
            status="TODO", phase="REQUIREMENTS", priority="HIGH",
            assignee_id=admin.id, proposer_id=admin.id,
        )
        db.add(story)
        await db.flush()

        task_titles = [
            "注册页面 UI", "登录 API 接口", "密码加密存储",
            "Token 签发与验证", "找回密码邮件发送",
        ]
        for i, title in enumerate(task_titles):
            task = Task(
                workspace_id=ws.id, milestone_id=milestones[0].id,
                parent_id=story.id,
                task_type="TASK", title=title,
                status="TODO", phase="REQUIREMENTS",
                assignee_id=admin.id, sort_order=i,
            )
            db.add(task)

        # Sample Bug
        bug = Task(
            workspace_id=ws.id, milestone_id=milestones[0].id,
            task_type="BUG", title="登录页密码框明文显示",
            description="密码输入时未做掩码处理",
            status="TODO", priority="CRITICAL",
            proposer_id=admin.id, assignee_id=admin.id,
        )
        db.add(bug)

        await db.commit()
        print(f"Seed data created: admin/admin123 | workspace={ws.id}")
        print(f"  Milestones: {len(milestones)} | Tasks: 1 Story + {len(task_titles)} Tasks + 1 Bug")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
