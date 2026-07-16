"""
Import key projects from Excel into AI-PM workspaces.

Reads /app/import_org.json (generated from 云服务中心重点项目.xlsx)
and creates:
  - Workspaces (TOPIC type)
  - Milestones
  - Workspace members (PM as OWNER, others as MEMBER)

Usage (inside backend container):
    python /app/import_projects.py
"""

import asyncio
import json
from datetime import date
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session
from app.models.workspace import Workspace
from app.models.workspace_member import WorkspaceMember
from app.models.milestone import Milestone, MILESTONE_PHASE_LABELS
from app.models.user import User


def progress_to_status(progress: float, status_str: str) -> tuple[str, str]:
    """Map Excel progress/status to milestone status and phase."""
    if status_str == "完成":
        return "COMPLETED", "DONE"
    if progress > 0:
        return "IN_PROGRESS", "ACTIVE"
    if status_str == "未开始" or status_str == "未启动":
        return "UPCOMING", "PLANNING"
    return "UPCOMING", "PLANNING"


STATUS_LABELS = {
    "UPCOMING": "未开始",
    "IN_PROGRESS": "进行中",
    "COMPLETED": "已完成",
}

PROJECT_STATUS_MAP = {
    "完成": "COMPLETED",
    "进行中": "ACTIVE",
    "未开始": "PLANNING",
    "未启动": "PLANNING",
}


def get_project_status(milestones: list[dict]) -> str:
    """Determine overall project status from milestones."""
    if not milestones:
        return "PLANNING"
    statuses = [m.get("status", "") for m in milestones]
    completed = sum(1 for s in statuses if s == "完成")
    active = sum(1 for s in statuses if s in ("进行中",))
    if completed == len(statuses) and len(statuses) > 0:
        return "COMPLETED"
    if active > 0:
        return "ACTIVE"
    return "PLANNING"


async def ensure_users(session: AsyncSession, pm_name: str, member_names: list[str]) -> dict[str, str]:
    """Ensure all users exist and return display_name -> id map."""
    name_to_id: dict[str, str] = {}
    all_names = list(set([pm_name] + member_names))
    # Filter out special values
    all_names = [n for n in all_names if n and n not in ("数据库团队全员", "")]

    for name in all_names:
        result = await session.execute(select(User).where(User.display_name == name))
        user = result.scalar_one_or_none()
        if user:
            name_to_id[name] = str(user.id)
        else:
            print(f"    WARNING: User not found: {name}")
    return name_to_id


async def main():
    # First, check for and create missing users
    async with async_session() as session:
        missing_names = ["刘京瑞"]
        for name in missing_names:
            result = await session.execute(select(User).where(User.display_name == name))
            user = result.scalar_one_or_none()
            if user:
                print(f"  User exists: {name}")
                continue
            new_user = User(
                username=name.lower(),
                display_name=name,
                hashed_password="",
                source="LDAP",
                status="ACTIVE",
            )
            session.add(new_user)
            await session.flush()
            print(f"  Created user: {name} (id={str(new_user.id)[:8]})")
        await session.commit()

    # Load project data
    with open("/app/import_org.json") as f:
        data = json.load(f)

    print(f"Loading {len(data)} projects...")

    created_projects = 0
    total_milestones = 0
    total_members = 0

    async with async_session() as session:
        for proj in data:
            proj_name = proj["name"]
            pm_name = proj["pm"]
            milestones_data = proj["milestones"]

            # Check if workspace already exists
            result = await session.execute(
                select(Workspace).where(Workspace.name == proj_name)
            )
            workspace = result.scalar_one_or_none()

            if workspace:
                print(f"\nSKIP (exists): {proj_name}")
                continue

            # Collect all member names
            member_names = []
            for m in milestones_data:
                if m["members"]:
                    for person in m["members"].split("、"):
                        person = person.strip()
                        if person and person not in member_names:
                            member_names.append(person)

            # Ensure users exist
            name_to_id = await ensure_users(session, pm_name, member_names)

            # Determine project status
            proj_status = get_project_status(milestones_data)

            # Create workspace
            # Generate a simple key from name (remove special chars)
            key = "".join(c.lower() if c.isalnum() or c == "-" else "-" for c in proj_name).strip("-")
            key = key[:50]

            # If key already exists, append a suffix
            existing = await session.execute(
                select(Workspace).where(Workspace.key == key)
            )
            if existing.scalar_one_or_none():
                key = f"proj-{created_projects + 1:04d}"

            pm_id = name_to_id.get(pm_name)
            desc_parts = []
            for m in milestones_data[:3]:
                desc_parts.append(f"- {m['name']}")
            description = f"{proj_name}\n里程碑:\n" + "\n".join(desc_parts) + ("\n..." if len(milestones_data) > 3 else "")

            workspace = Workspace(
                name=proj_name,
                key=key,
                description=description,
                type="TOPIC",
                status=proj_status,
                phase="PLANNING",
                visibility="PRIVATE",
                owner_id=pm_id,
                strict_gate=True,
            )
            session.add(workspace)
            await session.flush()
            workspace_id = str(workspace.id)

            print(f"\nCREATE: {proj_name} (key={key}, id={workspace_id[:8]})")
            print(f"  PM: {pm_name}" + (f" (id={pm_id[:8]})" if pm_id else ""))
            print(f"  Members: {len(name_to_id) - 1}" + (f" | Status: {proj_status}" if pm_id else ""))

            # Add members
            if pm_id:
                pm_member = WorkspaceMember(
                    workspace_id=workspace_id,
                    user_id=pm_id,
                    role="OWNER",
                )
                session.add(pm_member)
                total_members += 1
                print(f"  - {pm_name} -> OWNER")

            for m_name in member_names:
                uid = name_to_id.get(m_name)
                if uid and uid != pm_id:
                    wm = WorkspaceMember(
                        workspace_id=workspace_id,
                        user_id=uid,
                        role="MEMBER",
                    )
                    session.add(wm)
                    total_members += 1
            print(f"  +{len(member_names) - 1} MEMBER(s)")

            # Create milestones
            for i, m_data in enumerate(milestones_data):
                m_status, m_phase = progress_to_status(
                    m_data.get("progress", 0),
                    m_data.get("status", ""),
                )

                m_owner_id = None
                if m_data["members"]:
                    for person in m_data["members"].split("、"):
                        person = person.strip()
                        if person and person in name_to_id:
                            m_owner_id = name_to_id[person]
                            break

                # Parse date string back to date object
                m_date = m_data.get("date")
                if isinstance(m_date, str):
                    m_date = date.fromisoformat(m_date.split("T")[0])

                milestone = Milestone(
                    workspace_id=workspace_id,
                    name=m_data["name"],
                    description=m_data.get("desc", ""),
                    owner_id=m_owner_id,
                    start_date=m_date,
                    end_date=m_date,
                    status=m_status,
                    phase=m_phase,
                    sort_order=i + 1,
                )
                session.add(milestone)
                total_milestones += 1

            await session.flush()
            created_projects += 1

        await session.commit()

    print(f"\n=== Done ===")
    print(f"  Created projects: {created_projects}")
    print(f"  Created milestones: {total_milestones}")
    print(f"  Created members: {total_members}")


if __name__ == "__main__":
    asyncio.run(main())
