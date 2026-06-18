from typing import Optional
from datetime import date
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project_group import ProjectGroup, ProjectGroupItem
from app.models.workspace import Workspace
from app.models.user import User
from app.exceptions import AppException


async def create_group(
    db: AsyncSession, creator_id: str, name: str, description: Optional[str] = None
) -> ProjectGroup:
    group = ProjectGroup(name=name, description=description, creator_id=creator_id)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


async def get_group(db: AsyncSession, group_id: str) -> Optional[ProjectGroup]:
    result = await db.execute(
        select(ProjectGroup)
        .where(ProjectGroup.id == group_id)
        .options(selectinload(ProjectGroup.items))
    )
    return result.scalar_one_or_none()


async def list_groups(
    db: AsyncSession, keyword: Optional[str] = None, page: int = 1, page_size: int = 20
) -> tuple[list[ProjectGroup], int]:
    query = select(ProjectGroup).order_by(ProjectGroup.created_at.desc())
    if keyword:
        query = query.where(ProjectGroup.name.ilike(f"%{keyword}%"))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows_q = query.offset((page - 1) * page_size).limit(page_size)
    groups = (await db.execute(rows_q)).scalars().all()
    return list(groups), total


async def update_group(
    db: AsyncSession, group: ProjectGroup,
    name: Optional[str] = None, description: Optional[str] = None,
) -> ProjectGroup:
    if name is not None:
        group.name = name
    if description is not None:
        group.description = description
    await db.commit()
    await db.refresh(group)
    return group


async def delete_group(db: AsyncSession, group: ProjectGroup) -> None:
    await db.delete(group)
    await db.commit()


async def add_workspace(db: AsyncSession, group_id: str, workspace_id: str) -> ProjectGroupItem:
    # 校验 workspace 存在
    ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
    if ws is None:
        raise AppException(404, "工作空间不存在", 404)

    # 校验未重复加入
    existing = (
        await db.execute(
            select(ProjectGroupItem).where(
                ProjectGroupItem.group_id == group_id,
                ProjectGroupItem.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise AppException(400, "该项目已在群中", 400)

    item = ProjectGroupItem(group_id=group_id, workspace_id=workspace_id)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def remove_workspace(db: AsyncSession, group_id: str, workspace_id: str) -> None:
    result = await db.execute(
        delete(ProjectGroupItem).where(
            ProjectGroupItem.group_id == group_id,
            ProjectGroupItem.workspace_id == workspace_id,
        )
    )
    if result.rowcount == 0:
        raise AppException(404, "该项目不在群中", 404)
    await db.commit()


async def get_group_workspaces(db: AsyncSession, group_id: str) -> list[Workspace]:
    result = await db.execute(
        select(Workspace)
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == Workspace.id)
        .where(ProjectGroupItem.group_id == group_id)
    )
    return list(result.scalars().all())


async def get_creator_name(db: AsyncSession, creator_id: str) -> Optional[str]:
    result = await db.execute(select(User.display_name).where(User.id == creator_id))
    return result.scalar_one_or_none()


from app.models.task import Task
from app.models.workspace_member import WorkspaceMember
from app.models.milestone import Milestone
from app.models.iteration import Iteration
from app.models.activity_log import ActivityLog


async def aggregate_tasks(
    db: AsyncSession, group_id: str,
    status: Optional[str] = None, workspace_id: Optional[str] = None,
    assignee_id: Optional[str] = None, priority: Optional[str] = None,
    limit: int = 200,
) -> list[dict]:
    """聚合群内所有子项目的任务。"""
    query = (
        select(Task, Workspace.name.label("workspace_name"))
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == Task.workspace_id)
        .join(Workspace, Workspace.id == Task.workspace_id)
        .where(ProjectGroupItem.group_id == group_id)
    )
    if status:
        query = query.where(Task.status == status)
    if workspace_id:
        query = query.where(Task.workspace_id == workspace_id)
    if assignee_id:
        query = query.where(Task.assignee_id == assignee_id)
    if priority:
        query = query.where(Task.priority == priority)
    query = query.order_by(Task.created_at.desc()).limit(limit)

    result = await db.execute(query)
    rows = result.all()
    return [
        {
            "id": t.id, "title": t.title, "status": t.status, "phase": t.phase,
            "priority": t.priority, "task_type": t.task_type,
            "workspace_id": t.workspace_id, "workspace_name": ws_name,
            "assignee_id": t.assignee_id,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "created_at": t.created_at.isoformat() if t.created_at else "",
        }
        for t, ws_name in rows
    ]


async def aggregate_stats(db: AsyncSession, group_id: str) -> list[dict]:
    """按子项目统计任务数/完成数/逾期数。"""
    workspaces = await get_group_workspaces(db, group_id)
    stats = []
    for ws in workspaces:
        total_r = await db.execute(
            select(func.count(Task.id)).where(Task.workspace_id == ws.id)
        )
        total = total_r.scalar() or 0
        done_r = await db.execute(
            select(func.count(Task.id)).where(
                Task.workspace_id == ws.id, Task.status == "DONE"
            )
        )
        done = done_r.scalar() or 0
        overdue_r = await db.execute(
            select(func.count(Task.id)).where(
                Task.workspace_id == ws.id,
                Task.status != "DONE",
                Task.due_date < date.today(),
            )
        )
        overdue = overdue_r.scalar() or 0
        completion = round(done / total * 100, 1) if total else 0.0
        stats.append({
            "workspace_id": ws.id, "workspace_name": ws.name,
            "total": total, "done": done, "overdue": overdue,
            "completion": completion,
        })
    return stats


async def aggregate_members(db: AsyncSession, group_id: str) -> list[dict]:
    """群内所有子项目成员去重，标注参与哪些项目。"""
    result = await db.execute(
        select(
            User.id, User.display_name, User.avatar_url,
            WorkspaceMember.workspace_id, Workspace.name.label("workspace_name"),
        )
        .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == WorkspaceMember.workspace_id)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(ProjectGroupItem.group_id == group_id)
    )
    rows = result.all()

    members_map: dict[str, dict] = {}
    for uid, name, avatar, ws_id, ws_name in rows:
        if uid not in members_map:
            members_map[uid] = {
                "user_id": uid, "display_name": name, "avatar_url": avatar,
                "project_count": 0, "projects": [],
            }
        members_map[uid]["project_count"] += 1
        members_map[uid]["projects"].append({"workspace_id": ws_id, "workspace_name": ws_name})
    return list(members_map.values())


async def aggregate_milestones(db: AsyncSession, group_id: str) -> list[dict]:
    """跨项目聚合里程碑与迭代。"""
    # 里程碑
    ms_result = await db.execute(
        select(Milestone, Workspace.name.label("workspace_name"))
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == Milestone.workspace_id)
        .join(Workspace, Workspace.id == Milestone.workspace_id)
        .where(ProjectGroupItem.group_id == group_id)
        .order_by(Milestone.due_date.asc())
    )
    milestones = [
        {
            "type": "milestone", "id": m.id, "name": m.name,
            "workspace_id": m.workspace_id, "workspace_name": ws_name,
            "due_date": m.due_date.isoformat() if m.due_date else None,
            "status": getattr(m, "status", None),
        }
        for m, ws_name in ms_result.all()
    ]

    # 迭代
    it_result = await db.execute(
        select(Iteration, Workspace.name.label("workspace_name"))
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == Iteration.workspace_id)
        .join(Workspace, Workspace.id == Iteration.workspace_id)
        .where(ProjectGroupItem.group_id == group_id)
        .order_by(Iteration.start_date.asc())
    )
    iterations = [
        {
            "type": "iteration", "id": it.id, "name": it.name,
            "workspace_id": it.workspace_id, "workspace_name": ws_name,
            "start_date": it.start_date.isoformat() if it.start_date else None,
            "end_date": it.end_date.isoformat() if it.end_date else None,
            "status": it.status,
        }
        for it, ws_name in it_result.all()
    ]
    return milestones + iterations


async def aggregate_activity(db: AsyncSession, group_id: str, limit: int = 30) -> list[dict]:
    """跨项目活动流。"""
    result = await db.execute(
        select(ActivityLog, User.display_name.label("user_name"), Workspace.name.label("workspace_name"))
        .join(Task, Task.id == ActivityLog.task_id)
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == Task.workspace_id)
        .join(Workspace, Workspace.id == Task.workspace_id)
        .outerjoin(User, User.id == ActivityLog.user_id)
        .where(ProjectGroupItem.group_id == group_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "id": log.id, "task_id": log.task_id,
            "user_name": user_name or "系统",
            "workspace_name": ws_name,
            "action_type": log.action_type,
            "field_name": log.field_name,
            "old_value": log.old_value, "new_value": log.new_value,
            "created_at": log.created_at.isoformat() if log.created_at else "",
        }
        for log, user_name, ws_name in rows
    ]
