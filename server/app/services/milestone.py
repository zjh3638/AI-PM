from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.milestone import Milestone
from app.models.task import Task


async def create_milestone(db: AsyncSession, workspace_id: str, **kwargs) -> Milestone:
    ms = Milestone(workspace_id=workspace_id, **kwargs)
    db.add(ms)
    await db.commit()
    await db.refresh(ms)
    return ms


async def get_milestone(db: AsyncSession, milestone_id: str) -> Optional[Milestone]:
    return await db.get(Milestone, milestone_id, options=[selectinload(Milestone.owner)])


async def list_milestones(db: AsyncSession, workspace_id: str) -> list[dict]:
    query = (
        select(Milestone)
        .options(selectinload(Milestone.owner))
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
            "status": ms.status, "sort_order": ms.sort_order, "color": ms.color,
            "task_count": task_count, "done_count": done_count,
            "created_at": ms.created_at.isoformat() if ms.created_at else "",
            "updated_at": ms.updated_at.isoformat() if ms.updated_at else "",
        })
    return data


async def update_milestone(db: AsyncSession, ms: Milestone, **kwargs) -> Milestone:
    for field, value in kwargs.items():
        if value is not None:
            setattr(ms, field, value)
    await db.commit()
    await db.refresh(ms)
    return ms


async def delete_milestone(db: AsyncSession, ms: Milestone) -> None:
    task_count = await db.scalar(select(func.count(Task.id)).where(Task.milestone_id == ms.id))
    if task_count and task_count > 0:
        from app.exceptions import AppException
        raise AppException(400, f"无法删除：该里程碑下有 {task_count} 个任务，请先将任务移至其他里程碑或删除任务", 400)
    await db.delete(ms)
    await db.commit()
