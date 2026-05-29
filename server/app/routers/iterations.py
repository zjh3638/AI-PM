from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.iteration import IterationCreate, IterationUpdate
from app.schemas.common import APIResponse
from app.services import iteration as it_service
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/workspaces/{workspace_id}/iterations", tags=["iterations"])


@router.post("", response_model=APIResponse)
async def create_iteration(
    workspace_id: str,
    req: IterationCreate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    it = await it_service.create_iteration(
        db, workspace_id,
        name=req.name, goal=req.goal, start_date=req.start_date,
        end_date=req.end_date, capacity_points=req.capacity_points,
    )
    data = {
        "id": it.id, "workspace_id": it.workspace_id,
        "name": it.name, "goal": it.goal,
        "start_date": it.start_date.isoformat() if it.start_date else "",
        "end_date": it.end_date.isoformat() if it.end_date else "",
        "capacity_points": it.capacity_points, "committed_points": 0,
        "status": it.status, "task_count": 0,
        "created_at": it.created_at.isoformat() if it.created_at else "",
        "updated_at": it.updated_at.isoformat() if it.updated_at else "",
    }
    return {"code": 0, "message": "ok", "data": data}


@router.get("", response_model=APIResponse)
async def list_iterations(
    workspace_id: str,
    status: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    iterations = await it_service.list_iterations(db, workspace_id, status=status or None)
    return {"code": 0, "message": "ok", "data": iterations}


@router.get("/{iteration_id}", response_model=APIResponse)
async def get_iteration(
    workspace_id: str,
    iteration_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    it = await it_service.get_iteration(db, iteration_id)
    if it is None or it.workspace_id != workspace_id:
        raise AppException(404, "迭代不存在", 404)
    from sqlalchemy import select, func
    from app.models.task import Task
    tc_result = await db.execute(select(func.count(Task.id)).where(Task.iteration_id == it.id))
    pts_result = await db.execute(
        select(func.coalesce(func.sum(Task.estimation), 0)).where(Task.iteration_id == it.id)
    )
    data = {
        "id": it.id, "workspace_id": it.workspace_id,
        "name": it.name, "goal": it.goal,
        "start_date": it.start_date.isoformat() if it.start_date else "",
        "end_date": it.end_date.isoformat() if it.end_date else "",
        "capacity_points": it.capacity_points,
        "committed_points": float(pts_result.scalar() or 0),
        "status": it.status, "task_count": tc_result.scalar() or 0,
        "created_at": it.created_at.isoformat() if it.created_at else "",
        "updated_at": it.updated_at.isoformat() if it.updated_at else "",
    }
    return {"code": 0, "message": "ok", "data": data}


@router.patch("/{iteration_id}", response_model=APIResponse)
async def update_iteration(
    workspace_id: str,
    iteration_id: str,
    req: IterationUpdate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    it = await it_service.get_iteration(db, iteration_id)
    if it is None or it.workspace_id != workspace_id:
        raise AppException(404, "迭代不存在", 404)
    it = await it_service.update_iteration(
        db, it, name=req.name, goal=req.goal,
        start_date=req.start_date, end_date=req.end_date,
        capacity_points=req.capacity_points,
    )
    from sqlalchemy import select, func
    from app.models.task import Task
    tc_result = await db.execute(select(func.count(Task.id)).where(Task.iteration_id == it.id))
    data = {
        "id": it.id, "workspace_id": it.workspace_id,
        "name": it.name, "goal": it.goal,
        "start_date": it.start_date.isoformat() if it.start_date else "",
        "end_date": it.end_date.isoformat() if it.end_date else "",
        "capacity_points": it.capacity_points, "committed_points": it.committed_points,
        "status": it.status, "task_count": tc_result.scalar() or 0,
        "created_at": it.created_at.isoformat() if it.created_at else "",
        "updated_at": it.updated_at.isoformat() if it.updated_at else "",
    }
    return {"code": 0, "message": "ok", "data": data}


@router.post("/{iteration_id}/start", response_model=APIResponse)
async def start_iteration(
    workspace_id: str,
    iteration_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    it = await it_service.get_iteration(db, iteration_id)
    if it is None or it.workspace_id != workspace_id:
        raise AppException(404, "迭代不存在", 404)
    if it.status != "PLANNING":
        raise AppException(400, "只能启动规划中的迭代")
    await it_service.update_iteration(db, it, status="ACTIVE")
    return {"code": 0, "message": "ok", "data": None}


@router.post("/{iteration_id}/close", response_model=APIResponse)
async def close_iteration(
    workspace_id: str,
    iteration_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    it = await it_service.get_iteration(db, iteration_id)
    if it is None or it.workspace_id != workspace_id:
        raise AppException(404, "迭代不存在", 404)
    if it.status != "ACTIVE":
        raise AppException(400, "只能关闭进行中的迭代")
    # Move incomplete tasks out of iteration
    from app.models.task import Task
    from sqlalchemy import select
    result = await db.execute(
        select(Task).where(Task.iteration_id == iteration_id, Task.status != "DONE")
    )
    for task in result.scalars().all():
        task.iteration_id = None
    await it_service.update_iteration(db, it, status="CLOSED")
    return {"code": 0, "message": "ok", "data": None}


@router.get("/{iteration_id}/burndown", response_model=APIResponse)
async def burndown(
    workspace_id: str,
    iteration_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    data = await it_service.get_burndown_data(db, iteration_id)
    return {"code": 0, "message": "ok", "data": data}
