from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.milestone import Milestone, MILESTONE_PHASES
from app.models.task import Task
from app.exceptions import AppException


async def create_milestone(db: AsyncSession, workspace_id: str, **kwargs) -> Milestone:
    ms = Milestone(workspace_id=workspace_id, **kwargs)
    db.add(ms)
    await db.commit()
    await db.refresh(ms)
    return ms


async def get_milestone(db: AsyncSession, milestone_id: str) -> Optional[Milestone]:
    return await db.get(Milestone, milestone_id, options=[selectinload(Milestone.owner), selectinload(Milestone.depends_on)])


async def list_milestones(db: AsyncSession, workspace_id: str) -> list[dict]:
    query = (
        select(Milestone)
        .options(selectinload(Milestone.owner), selectinload(Milestone.depends_on))
        .where(Milestone.workspace_id == workspace_id)
        .order_by(Milestone.sort_order, Milestone.start_date)
    )
    result = await db.execute(query)
    milestones = result.scalars().all()

    data = []
    for ms in milestones:
        tc_result = await db.execute(select(func.count(Task.id)).where(Task.milestone_id == ms.id))
        done_result = await db.execute(
            select(func.count(Task.id)).where(Task.milestone_id == ms.id, Task.status == "DONE")
        )
        task_count = tc_result.scalar() or 0
        done_count = done_result.scalar() or 0

        data.append({
            "id": ms.id, "workspace_id": ms.workspace_id,
            "name": ms.name, "description": ms.description,
            "plan": ms.plan,
            "owner_id": ms.owner_id,
            "owner_name": ms.owner.display_name if ms.owner else None,
            "start_date": ms.start_date.isoformat() if ms.start_date else "",
            "end_date": ms.end_date.isoformat() if ms.end_date else "",
            "status": ms.status, "phase": ms.phase, "sort_order": ms.sort_order, "color": ms.color,
            "depends_on_id": ms.depends_on_id,
            "depends_on_name": ms.depends_on.name if ms.depends_on else None,
            "task_count": task_count, "done_count": done_count,
            "created_at": ms.created_at.isoformat() if ms.created_at else "",
            "updated_at": ms.updated_at.isoformat() if ms.updated_at else "",
        })
    return data


async def update_milestone(db: AsyncSession, ms: Milestone, **kwargs) -> Milestone:
    if "depends_on_id" in kwargs and kwargs["depends_on_id"]:
        valid = await check_circular_dependency(db, ms.id, kwargs["depends_on_id"])
        if not valid:
            raise AppException(400, "不能设置循环依赖关系", 400)
    for field, value in kwargs.items():
        if value is not None:
            setattr(ms, field, value)
    await db.commit()
    await db.refresh(ms)
    return ms


async def delete_milestone(db: AsyncSession, ms: Milestone) -> None:
    task_count = await db.scalar(select(func.count(Task.id)).where(Task.milestone_id == ms.id))
    if task_count and task_count > 0:
        raise AppException(400, f"无法删除：该里程碑下有 {task_count} 个任务，请先将任务移至其他里程碑或删除任务", 400)
    # Check if other milestones depend on this one
    dep_count = await db.scalar(select(func.count(Milestone.id)).where(Milestone.depends_on_id == ms.id))
    if dep_count and dep_count > 0:
        raise AppException(400, f"无法删除：有 {dep_count} 个里程碑依赖此里程碑，请先解除依赖关系", 400)
    await db.delete(ms)
    await db.commit()


async def check_circular_dependency(db: AsyncSession, milestone_id: str, proposed_depends_on_id: str) -> bool:
    if milestone_id == proposed_depends_on_id:
        return False
    visited = set()
    current = proposed_depends_on_id
    while current:
        if current in visited:
            return False
        if current == milestone_id:
            return False
        visited.add(current)
        ms = await db.get(Milestone, current)
        if ms and ms.depends_on_id:
            current = ms.depends_on_id
        else:
            break
    return True


async def advance_milestone_phase(db: AsyncSession, ms: Milestone) -> Milestone:
    phases = MILESTONE_PHASES
    current_phase = ms.phase or "PLANNING"
    if current_phase not in phases:
        raise AppException(400, f"未知阶段: {current_phase}", 400)
    idx = phases.index(current_phase)
    if idx >= len(phases) - 1:
        raise AppException(400, "已是最后一个阶段", 400)
    # If advancing to ACTIVE, check dependency
    next_phase = phases[idx + 1]
    if next_phase == "ACTIVE" and ms.depends_on_id:
        pred = await db.get(Milestone, ms.depends_on_id)
        if pred and pred.phase != "DONE":
            raise AppException(400, f"依赖的里程碑「{pred.name}」尚未完成，无法启动", 400)
    ms.phase = next_phase
    if next_phase == "ACTIVE":
        ms.status = "ACTIVE"
    elif next_phase == "DONE":
        ms.status = "DONE"
    await db.commit()
    await db.refresh(ms)
    return ms
