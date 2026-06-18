from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.milestone import MilestoneCreate, MilestoneUpdate
from app.schemas.common import APIResponse
from app.services import milestone as ms_service
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/workspaces/{workspace_id}/milestones", tags=["milestones"])


@router.post("", response_model=APIResponse)
async def create_milestone(
    workspace_id: str,
    req: MilestoneCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    ms = await ms_service.create_milestone(
        db, workspace_id,
        name=req.name, description=req.description, plan=req.plan,
        owner_id=req.owner_id,
        start_date=req.start_date, end_date=req.end_date,
        sort_order=req.sort_order, color=req.color,
        phase=req.phase, depends_on_id=req.depends_on_id,
    )
    data_list = await ms_service.list_milestones(db, workspace_id)
    created = next((m for m in data_list if m["id"] == ms.id), None)
    return {"code": 0, "message": "ok", "data": created}


@router.get("", response_model=APIResponse)
async def list_milestones(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    data = await ms_service.list_milestones(db, workspace_id)
    return {"code": 0, "message": "ok", "data": data}


@router.get("/{milestone_id}", response_model=APIResponse)
async def get_milestone(
    workspace_id: str,
    milestone_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    ms = await ms_service.get_milestone(db, milestone_id)
    if ms is None or ms.workspace_id != workspace_id:
        raise AppException(404, "里程碑不存在", 404)
    data_list = await ms_service.list_milestones(db, workspace_id)
    m = next((x for x in data_list if x["id"] == milestone_id), None)
    return {"code": 0, "message": "ok", "data": m}


@router.patch("/{milestone_id}", response_model=APIResponse)
async def update_milestone(
    workspace_id: str,
    milestone_id: str,
    req: MilestoneUpdate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    ms = await ms_service.get_milestone(db, milestone_id)
    if ms is None or ms.workspace_id != workspace_id:
        raise AppException(404, "里程碑不存在", 404)
    await ms_service.update_milestone(
        db, ms,
        name=req.name, description=req.description, plan=req.plan,
        owner_id=req.owner_id,
        start_date=req.start_date, end_date=req.end_date,
        phase=req.phase, sort_order=req.sort_order, color=req.color,
        depends_on_id=req.depends_on_id,
    )
    data_list = await ms_service.list_milestones(db, workspace_id)
    updated = next((m for m in data_list if m["id"] == milestone_id), None)
    return {"code": 0, "message": "ok", "data": updated}


@router.delete("/{milestone_id}", response_model=APIResponse)
async def delete_milestone(
    workspace_id: str,
    milestone_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    ms = await ms_service.get_milestone(db, milestone_id)
    if ms is None or ms.workspace_id != workspace_id:
        raise AppException(404, "里程碑不存在", 404)
    await ms_service.delete_milestone(db, ms)
    return {"code": 0, "message": "ok", "data": None}


@router.post("/{milestone_id}/advance-phase", response_model=APIResponse)
async def advance_milestone_phase(
    workspace_id: str,
    milestone_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    ms = await ms_service.get_milestone(db, milestone_id)
    if ms is None or ms.workspace_id != workspace_id:
        raise AppException(404, "里程碑不存在", 404)
    ms = await ms_service.advance_milestone_phase(db, ms)
    data_list = await ms_service.list_milestones(db, workspace_id)
    updated = next((m for m in data_list if m["id"] == milestone_id), None)
    return {"code": 0, "message": "ok", "data": updated}
