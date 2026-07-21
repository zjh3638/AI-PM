from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.exceptions import AppException
from app.models.user import User
from app.models.workspace import Workspace
from app.models.task import Task
from app.schemas.common import APIResponse

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def _require_super_admin(user: User) -> None:
    if user.system_role != "SUPER_ADMIN":
        raise AppException(403, "仅超级管理员可访问", 403)


@router.get("/stats", response_model=APIResponse)
async def admin_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """系统级统计：用户数、项目数、任务数、近7天活跃用户数。"""
    await _require_super_admin(user)

    total_users = (await db.execute(
        select(func.count(User.id)).where(User.status == "ACTIVE")
    )).scalar() or 0

    total_workspaces = (await db.execute(
        select(func.count(Workspace.id))
    )).scalar() or 0

    total_tasks = (await db.execute(
        select(func.count(Task.id))
    )).scalar() or 0

    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    active_users = (await db.execute(
        select(func.count(User.id)).where(
            User.status == "ACTIVE",
            User.updated_at >= seven_days_ago,
        )
    )).scalar() or 0

    return {
        "code": 0, "message": "ok",
        "data": {
            "total_users": total_users,
            "total_workspaces": total_workspaces,
            "total_tasks": total_tasks,
            "active_users": active_users,
        },
    }
