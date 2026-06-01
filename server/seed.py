"""Seed initial data: admin user, default department, roles."""
import asyncio
import sys
sys.path.insert(0, ".")

from app.database import engine, async_session, Base
from app.models.user import User
from app.models.department import Department
from app.models.role import Role
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

        await db.commit()

    print("Seed data created: admin/admin123")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
