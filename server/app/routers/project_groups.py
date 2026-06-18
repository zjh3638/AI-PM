from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.common import APIResponse
from app.schemas.project_group import (
    ProjectGroupCreate, ProjectGroupUpdate, ProjectGroupItemAdd,
)
from app.services import project_group_svc as svc
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/project-groups", tags=["project-groups"])


def _group_to_dict(group, creator_name=None, workspaces=None, workspace_count=None):
    return {
        "id": group.id, "name": group.name, "description": group.description,
        "creator_id": group.creator_id, "creator_name": creator_name,
        "workspace_count": workspace_count if workspace_count is not None else 0,
        "workspaces": workspaces or [],
        "created_at": group.created_at.isoformat() if group.created_at else "",
        "updated_at": group.updated_at.isoformat() if group.updated_at else "",
    }


async def _require_manage(pc: PermissionChecker, group, user: User):
    """管理权限：创建者 或 SUPER_ADMIN。"""
    if user.system_role == "SUPER_ADMIN":
        return
    if group.creator_id != user.id:
        raise AppException(403, "无权管理此项目群", 403)


@router.get("", response_model=APIResponse)
async def list_groups(
    keyword: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    groups, total = await svc.list_groups(db, keyword=keyword, page=page, page_size=page_size)
    data = []
    for g in groups:
        ws_list = await svc.get_group_workspaces(db, g.id)
        creator_name = await svc.get_creator_name(db, g.creator_id)
        data.append(_group_to_dict(
            g, creator_name=creator_name,
            workspaces=[{"id": w.id, "name": w.name} for w in ws_list],
            workspace_count=len(ws_list),
        ))
    return {"code": 0, "message": "ok", "data": data, "total": total}


@router.post("", response_model=APIResponse)
async def create_group(
    req: ProjectGroupCreate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    user: User = Depends(get_current_user),
):
    await pc.require_system_role("SUPER_ADMIN", "ADMIN")
    group = await svc.create_group(db, creator_id=user.id, name=req.name, description=req.description)
    return {"code": 0, "message": "ok", "data": _group_to_dict(group, creator_name=user.display_name)}


@router.get("/{group_id}", response_model=APIResponse)
async def get_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    ws_list = await svc.get_group_workspaces(db, group_id)
    creator_name = await svc.get_creator_name(db, group.creator_id)
    return {"code": 0, "message": "ok", "data": _group_to_dict(
        group, creator_name=creator_name,
        workspaces=[{"id": w.id, "name": w.name, "key": w.key} for w in ws_list],
        workspace_count=len(ws_list),
    )}


@router.patch("/{group_id}", response_model=APIResponse)
async def update_group(
    group_id: str,
    req: ProjectGroupUpdate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    await _require_manage(pc, group, user)
    group = await svc.update_group(db, group, name=req.name, description=req.description)
    return {"code": 0, "message": "ok", "data": _group_to_dict(group)}


@router.delete("/{group_id}", response_model=APIResponse)
async def delete_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    await _require_manage(pc, group, user)
    await svc.delete_group(db, group)
    return {"code": 0, "message": "ok", "data": None}


@router.post("/{group_id}/workspaces", response_model=APIResponse)
async def add_workspace(
    group_id: str,
    req: ProjectGroupItemAdd,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    await _require_manage(pc, group, user)
    await svc.add_workspace(db, group_id, req.workspace_id)
    return {"code": 0, "message": "ok", "data": None}


@router.delete("/{group_id}/workspaces/{workspace_id}", response_model=APIResponse)
async def remove_workspace(
    group_id: str,
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    await _require_manage(pc, group, user)
    await svc.remove_workspace(db, group_id, workspace_id)
    return {"code": 0, "message": "ok", "data": None}


@router.get("/{group_id}/tasks", response_model=APIResponse)
async def get_tasks(
    group_id: str,
    status: Optional[str] = Query(default=None),
    workspace_id: Optional[str] = Query(default=None),
    assignee_id: Optional[str] = Query(default=None),
    priority: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    tasks = await svc.aggregate_tasks(
        db, group_id, status=status, workspace_id=workspace_id,
        assignee_id=assignee_id, priority=priority,
    )
    return {"code": 0, "message": "ok", "data": tasks}


@router.get("/{group_id}/stats", response_model=APIResponse)
async def get_stats(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    stats = await svc.aggregate_stats(db, group_id)
    return {"code": 0, "message": "ok", "data": stats}


@router.get("/{group_id}/members", response_model=APIResponse)
async def get_members(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    members = await svc.aggregate_members(db, group_id)
    return {"code": 0, "message": "ok", "data": members}


@router.get("/{group_id}/milestones", response_model=APIResponse)
async def get_milestones(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    milestones = await svc.aggregate_milestones(db, group_id)
    return {"code": 0, "message": "ok", "data": milestones}


@router.get("/{group_id}/activity", response_model=APIResponse)
async def get_activity(
    group_id: str,
    limit: int = Query(default=30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    activity = await svc.aggregate_activity(db, group_id, limit=limit)
    return {"code": 0, "message": "ok", "data": activity}
