from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate, TaskMoveRequest
from app.schemas.common import APIResponse, PaginatedResponse
from app.services import task as task_service
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/workspaces/{workspace_id}", tags=["tasks"])


def _task_to_dict(task) -> dict:
    return {
        "id": task.id, "workspace_id": task.workspace_id,
        "parent_id": task.parent_id, "epic_id": task.epic_id,
        "iteration_id": task.iteration_id, "task_type": task.task_type,
        "title": task.title, "description": task.description,
        "status": task.status, "priority": task.priority,
        "severity": task.severity, "assignee_id": task.assignee_id,
        "assignee_name": task.assignee.display_name if task.assignee else None,
        "estimation": task.estimation, "estimation_unit": task.estimation_unit,
        "sort_order": task.sort_order,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "children_count": 0,
        "created_at": task.created_at.isoformat() if task.created_at else "",
        "updated_at": task.updated_at.isoformat() if task.updated_at else "",
    }


@router.post("/tasks", response_model=APIResponse)
async def create_task(
    workspace_id: str,
    req: TaskCreate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    task = await task_service.create_task(
        db, workspace_id,
        task_type=req.task_type, title=req.title, description=req.description,
        status=req.status, priority=req.priority, severity=req.severity,
        parent_id=req.parent_id, epic_id=req.epic_id, iteration_id=req.iteration_id,
        assignee_id=req.assignee_id, estimation=req.estimation,
        estimation_unit=req.estimation_unit, sort_order=req.sort_order,
        due_date=req.due_date,
    )
    return {"code": 0, "message": "ok", "data": _task_to_dict(task)}


@router.get("/tasks", response_model=PaginatedResponse)
async def list_tasks(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    task_type: str = Query(default=""),
    status: str = Query(default=""),
    priority: str = Query(default=""),
    assignee_id: str = Query(default=""),
    iteration_id: str = Query(default=""),
    epic_id: str = Query(default=""),
    parent_id: str = Query(default=""),
    keyword: str = Query(default=""),
    sort_by: str = Query(default="created_at"),
    sort_dir: str = Query(default="desc"),
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    tasks, total = await task_service.list_tasks(
        db, workspace_id, page=page, page_size=page_size,
        task_type=task_type or None, status=status or None,
        priority=priority or None, assignee_id=assignee_id or None,
        iteration_id=iteration_id or None, epic_id=epic_id or None,
        parent_id=parent_id or None, keyword=keyword or None,
        sort_by=sort_by, sort_dir=sort_dir,
    )
    data = [_task_to_dict(t) for t in tasks]
    return {"code": 0, "message": "ok", "data": data, "total": total, "page": page, "page_size": page_size}


@router.get("/epics", response_model=APIResponse)
async def list_epics(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    epics = await task_service.get_epics(db, workspace_id)
    return {"code": 0, "message": "ok", "data": epics}


@router.get("/kanban", response_model=APIResponse)
async def get_kanban(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    columns = await task_service.get_kanban(db, workspace_id)
    return {"code": 0, "message": "ok", "data": columns}


@router.get("/tasks/{task_id}", response_model=APIResponse)
async def get_task(
    workspace_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    task = await task_service.get_task(db, task_id)
    if task is None or task.workspace_id != workspace_id:
        raise AppException(404, "任务不存在", 404)
    children_count = await task_service.get_child_count(db, task_id)
    data = _task_to_dict(task)
    data["children_count"] = children_count
    return {"code": 0, "message": "ok", "data": data}


@router.patch("/tasks/{task_id}", response_model=APIResponse)
async def update_task(
    workspace_id: str,
    task_id: str,
    req: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    task = await task_service.get_task(db, task_id)
    if task is None or task.workspace_id != workspace_id:
        raise AppException(404, "任务不存在", 404)
    task = await task_service.update_task(
        db, task,
        title=req.title, description=req.description, status=req.status,
        priority=req.priority, severity=req.severity,
        parent_id=req.parent_id, epic_id=req.epic_id,
        iteration_id=req.iteration_id, assignee_id=req.assignee_id,
        estimation=req.estimation, estimation_unit=req.estimation_unit,
        sort_order=req.sort_order, due_date=req.due_date,
    )
    return {"code": 0, "message": "ok", "data": _task_to_dict(task)}


@router.delete("/tasks/{task_id}", response_model=APIResponse)
async def delete_task(
    workspace_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    task = await task_service.get_task(db, task_id)
    if task is None or task.workspace_id != workspace_id:
        raise AppException(404, "任务不存在", 404)
    await db.delete(task)
    await db.commit()
    return {"code": 0, "message": "ok", "data": None}


@router.get("/tasks/{task_id}/children", response_model=APIResponse)
async def get_task_children(
    workspace_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    children = await task_service.get_children(db, task_id)
    return {"code": 0, "message": "ok", "data": [_task_to_dict(c) for c in children]}


@router.patch("/tasks/{task_id}/move", response_model=APIResponse)
async def move_task(
    workspace_id: str,
    task_id: str,
    req: TaskMoveRequest,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    task = await task_service.get_task(db, task_id)
    if task is None or task.workspace_id != workspace_id:
        raise AppException(404, "任务不存在", 404)
    task = await task_service.move_task(db, task, req.new_status, req.sort_order)
    return {"code": 0, "message": "ok", "data": _task_to_dict(task)}
