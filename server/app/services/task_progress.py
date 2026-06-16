from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.task_progress import TaskProgress
from app.models.user import User


async def create_progress(db: AsyncSession, task_id: str, user_id: str, progress: int, note: str | None = None) -> TaskProgress:
    tp = TaskProgress(task_id=task_id, progress=progress, note=note, created_by=user_id)
    db.add(tp)
    await db.commit()
    await db.refresh(tp)
    return tp


async def list_progress(db: AsyncSession, task_id: str) -> list[dict]:
    result = await db.execute(
        select(TaskProgress)
        .options(selectinload(TaskProgress.creator))
        .where(TaskProgress.task_id == task_id)
        .order_by(desc(TaskProgress.created_at))
    )
    items = result.scalars().all()
    return [
        {
            "id": p.id, "task_id": p.task_id,
            "progress": p.progress, "note": p.note,
            "created_by": p.created_by,
            "creator_name": p.creator.display_name if p.creator else None,
            "created_at": p.created_at.isoformat() if p.created_at else "",
        }
        for p in items
    ]


async def get_latest_progress(db: AsyncSession, task_id: str) -> dict | None:
    result = await db.execute(
        select(TaskProgress)
        .where(TaskProgress.task_id == task_id)
        .order_by(desc(TaskProgress.created_at))
        .limit(1)
    )
    p = result.scalar_one_or_none()
    if not p:
        return None
    return {"progress": p.progress, "note": p.note, "created_at": p.created_at.isoformat() if p.created_at else ""}
