from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.task_template import (
    TaskTemplateCreate, TaskTemplateUpdate, CreateTaskFromTemplate,
)
from app.schemas.common import APIResponse
from app.services import task_template as tpl_service
from app.services import task as task_service
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/workspaces/{workspace_id}", tags=["task-templates"])


@router.post("/task-templates", response_model=APIResponse)
async def create_template(
    workspace_id: str,
    req: TaskTemplateCreate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    current_user: User = Depends(get_current_user),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    wits = [wi.model_dump() for wi in req.work_items_template] if req.work_items_template else None
    tpl = await tpl_service.create_template(
        db, workspace_id, current_user.id,
        name=req.name, description=req.description, task_type=req.task_type,
        title_template=req.title_template, description_template=req.description_template,
        priority=req.priority, phase=req.phase,
        estimation=req.estimation, estimation_unit=req.estimation_unit,
        work_items_template=wits, category=req.category, tags=req.tags,
    )
    tpl = await tpl_service.get_template(db, tpl.id)
    return {"code": 0, "message": "ok", "data": tpl_service._template_to_dict(tpl)}


@router.get("/task-templates", response_model=APIResponse)
async def list_templates(
    workspace_id: str,
    category: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    templates = await tpl_service.list_templates(db, workspace_id, category=category or None)
    data = [tpl_service._template_to_dict(t) for t in templates]
    return {"code": 0, "message": "ok", "data": data}


@router.get("/task-templates/{template_id}", response_model=APIResponse)
async def get_template(
    workspace_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    tpl = await tpl_service.get_template(db, template_id)
    if tpl is None or tpl.workspace_id != workspace_id:
        raise AppException(404, "模板不存在", 404)
    return {"code": 0, "message": "ok", "data": tpl_service._template_to_dict(tpl)}


@router.patch("/task-templates/{template_id}", response_model=APIResponse)
async def update_template(
    workspace_id: str,
    template_id: str,
    req: TaskTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    tpl = await tpl_service.get_template(db, template_id)
    if tpl is None or tpl.workspace_id != workspace_id:
        raise AppException(404, "模板不存在", 404)
    wits = [wi.model_dump() for wi in req.work_items_template] if req.work_items_template is not None else None
    tpl = await tpl_service.update_template(
        db, tpl,
        name=req.name, description=req.description, task_type=req.task_type,
        title_template=req.title_template, description_template=req.description_template,
        priority=req.priority, phase=req.phase,
        estimation=req.estimation, estimation_unit=req.estimation_unit,
        work_items_template=wits, category=req.category, tags=req.tags,
    )
    tpl = await tpl_service.get_template(db, tpl.id)
    return {"code": 0, "message": "ok", "data": tpl_service._template_to_dict(tpl)}


@router.delete("/task-templates/{template_id}", response_model=APIResponse)
async def delete_template(
    workspace_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    tpl = await tpl_service.get_template(db, template_id)
    if tpl is None or tpl.workspace_id != workspace_id:
        raise AppException(404, "模板不存在", 404)
    await tpl_service.delete_template(db, tpl)
    return {"code": 0, "message": "ok", "data": None}


@router.post("/task-templates/{template_id}/create-task", response_model=APIResponse)
async def create_task_from_template(
    workspace_id: str,
    template_id: str,
    req: CreateTaskFromTemplate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    current_user: User = Depends(get_current_user),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    tpl = await tpl_service.get_template(db, template_id)
    if tpl is None or tpl.workspace_id != workspace_id:
        raise AppException(404, "模板不存在", 404)
    task = await tpl_service.create_task_from_template(
        db, tpl, workspace_id,
        variables=req.variables, milestone_id=req.milestone_id,
        iteration_id=req.iteration_id, assignee_id=req.assignee_id,
        due_date=req.due_date, work_item_overrides=req.work_item_overrides,
    )
    task = await task_service.get_task(db, task.id)
    return {"code": 0, "message": "ok", "data": task_service._task_to_dict(task)}
