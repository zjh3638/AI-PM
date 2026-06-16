from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.task_progress import TaskProgressCreate
from app.schemas.common import APIResponse
from app.services import task_progress as tp_service
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/tasks/{task_id}/progress", tags=["task-progress"])


@router.post("", response_model=APIResponse)
async def create_progress(
    task_id: str,
    req: TaskProgressCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    from app.models.task import Task
    from app.services.task import get_task

    task = await get_task(db, task_id)
    if not task:
        raise AppException(404, "任务不存在", 404)
    await pc.require_workspace_role(task.workspace_id, "OWNER", "MANAGER", "MEMBER")

    tp = await tp_service.create_progress(db, task_id, user.id, req.progress, req.note)
    data = {
        "id": tp.id, "task_id": tp.task_id,
        "progress": tp.progress, "note": tp.note,
        "created_by": tp.created_by,
        "creator_name": user.display_name,
        "created_at": tp.created_at.isoformat() if tp.created_at else "",
    }
    return {"code": 0, "message": "ok", "data": data}


@router.get("", response_model=APIResponse)
async def list_progress(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    from app.models.task import Task
    from app.services.task import get_task

    task = await get_task(db, task_id)
    if not task:
        raise AppException(404, "任务不存在", 404)
    await pc.require_workspace_role(task.workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")

    data = await tp_service.list_progress(db, task_id)
    return {"code": 0, "message": "ok", "data": data}
