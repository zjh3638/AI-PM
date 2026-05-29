from typing import Optional
from datetime import date

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.iteration import Iteration
from app.models.task import Task
from app.exceptions import AppException


async def create_iteration(db: AsyncSession, workspace_id: str, **kwargs) -> Iteration:
    it = Iteration(workspace_id=workspace_id, **kwargs)
    db.add(it)
    await db.commit()
    await db.refresh(it)
    return it


async def get_iteration(db: AsyncSession, iteration_id: str) -> Optional[Iteration]:
    return await db.get(Iteration, iteration_id)


async def list_iterations(
    db: AsyncSession,
    workspace_id: str,
    status: Optional[str] = None,
) -> list[dict]:
    query = select(Iteration).where(Iteration.workspace_id == workspace_id)
    if status:
        query = query.where(Iteration.status == status)
    query = query.order_by(Iteration.start_date.desc())
    result = await db.execute(query)
    iterations = result.scalars().all()

    data = []
    for it in iterations:
        tc_result = await db.execute(
            select(func.count(Task.id)).where(Task.iteration_id == it.id)
        )
        pts_result = await db.execute(
            select(func.coalesce(func.sum(Task.estimation), 0)).where(
                Task.iteration_id == it.id
            )
        )
        data.append({
            "id": it.id, "workspace_id": it.workspace_id,
            "name": it.name, "goal": it.goal,
            "start_date": it.start_date.isoformat() if it.start_date else "",
            "end_date": it.end_date.isoformat() if it.end_date else "",
            "capacity_points": it.capacity_points,
            "committed_points": float(pts_result.scalar() or 0),
            "status": it.status, "task_count": tc_result.scalar() or 0,
            "created_at": it.created_at.isoformat() if it.created_at else "",
            "updated_at": it.updated_at.isoformat() if it.updated_at else "",
        })
    return data


async def update_iteration(db: AsyncSession, it: Iteration, **kwargs) -> Iteration:
    for field, value in kwargs.items():
        if value is not None:
            setattr(it, field, value)
    await db.commit()
    await db.refresh(it)
    return it


async def get_burndown_data(db: AsyncSession, iteration_id: str) -> list[dict]:
    """Daily burndown: remaining points per day from start to end."""
    it = await db.get(Iteration, iteration_id)
    if not it:
        return []

    result = await db.execute(
        select(Task).where(Task.iteration_id == iteration_id)
    )
    tasks = result.scalars().all()
    total_points = sum(t.estimation or 0 for t in tasks)
    if total_points == 0:
        return []

    data = []
    current = it.start_date
    while current <= it.end_date:
        done_points = sum(
            t.estimation or 0 for t in tasks
            if t.completed_at and t.completed_at.date() <= current
        )
        remaining = total_points - done_points
        data.append({
            "date": current.isoformat(),
            "remaining": remaining,
            "ideal": total_points * (1 - (current - it.start_date).days / max((it.end_date - it.start_date).days, 1)),
        })
        from datetime import timedelta
        current += timedelta(days=1)
    return data
