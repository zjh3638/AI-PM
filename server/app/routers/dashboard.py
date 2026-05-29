from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.task import Task
from app.models.workspace_member import WorkspaceMember
from app.schemas.common import APIResponse

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=APIResponse)
async def dashboard_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Get user's workspace IDs
    ws_result = await db.execute(
        select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == user.id)
    )
    ws_ids = [r[0] for r in ws_result.all()]

    active_projects = len(ws_ids) if ws_ids else 0

    # My tasks
    todo_count = 0
    overdue_count = 0
    review_count = 0
    if ws_ids:
        todo_r = await db.execute(
            select(func.count(Task.id)).where(
                Task.workspace_id.in_(ws_ids),
                Task.assignee_id == user.id,
                Task.status.in_(["TODO", "IN_PROGRESS"]),
            )
        )
        todo_count = todo_r.scalar() or 0

        review_r = await db.execute(
            select(func.count(Task.id)).where(
                Task.workspace_id.in_(ws_ids),
                Task.status == "IN_REVIEW",
            )
        )
        review_count = review_r.scalar() or 0

    if ws_ids:
        from datetime import date
        overdue_r = await db.execute(
            select(func.count(Task.id)).where(
                Task.workspace_id.in_(ws_ids),
                Task.assignee_id == user.id,
                Task.status != "DONE",
                Task.due_date < date.today(),
            )
        )
        overdue_count = overdue_r.scalar() or 0

    return {
        "code": 0, "message": "ok",
        "data": {
            "active_projects": active_projects,
            "my_tasks": todo_count,
            "overdue_tasks": overdue_count,
            "review_tasks": review_count,
        },
    }


@router.get("/my-tasks", response_model=APIResponse)
async def my_tasks(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Task).where(
            Task.assignee_id == user.id,
            Task.status.in_(["TODO", "IN_PROGRESS"]),
        ).order_by(Task.priority.desc(), Task.due_date.asc()).limit(20)
    )
    tasks = result.scalars().all()
    data = [{"id": t.id, "title": t.title, "workspace_id": t.workspace_id,
             "status": t.status, "priority": t.priority, "task_type": t.task_type,
             "due_date": t.due_date.isoformat() if t.due_date else None} for t in tasks]
    return {"code": 0, "message": "ok", "data": data}


@router.get("/review-queue", response_model=APIResponse)
async def review_queue(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ws_result = await db.execute(
        select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == user.id)
    )
    ws_ids = [r[0] for r in ws_result.all()]
    if not ws_ids:
        return {"code": 0, "message": "ok", "data": []}

    result = await db.execute(
        select(Task).where(
            Task.workspace_id.in_(ws_ids),
            Task.status == "IN_REVIEW",
        ).order_by(Task.created_at.desc()).limit(20)
    )
    tasks = result.scalars().all()
    data = [{"id": t.id, "title": t.title, "workspace_id": t.workspace_id,
             "task_type": t.task_type, "priority": t.priority,
             "assignee_name": t.assignee.display_name if t.assignee else None} for t in tasks]
    return {"code": 0, "message": "ok", "data": data}
