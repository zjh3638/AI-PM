from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.risk import RiskCreate, RiskUpdate
from app.schemas.common import APIResponse
from app.services import risk as risk_service
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/workspaces/{workspace_id}/risks", tags=["risks"])


@router.post("", response_model=APIResponse)
async def create_risk(
    workspace_id: str,
    req: RiskCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    data = await risk_service.create_risk(
        db, workspace_id,
        milestone_id=req.milestone_id,
        title=req.title, description=req.description,
        risk_type=req.risk_type, probability=req.probability,
        impact=req.impact, mitigation=req.mitigation,
        owner_id=req.owner_id,
    )
    return {"code": 0, "message": "ok", "data": data}


@router.get("", response_model=APIResponse)
async def list_risks(
    workspace_id: str,
    status: Optional[str] = Query(None),
    risk_type: Optional[str] = Query(None),
    milestone_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    data = await risk_service.list_risks(db, workspace_id, status=status, risk_type=risk_type, milestone_id=milestone_id)
    return {"code": 0, "message": "ok", "data": data}


@router.get("/{risk_id}", response_model=APIResponse)
async def get_risk(
    workspace_id: str,
    risk_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    risk = await risk_service.get_risk(db, risk_id)
    if risk is None or risk.workspace_id != workspace_id:
        raise AppException(404, "风险不存在", 404)
    return {"code": 0, "message": "ok", "data": _risk_dict(risk)}


@router.patch("/{risk_id}", response_model=APIResponse)
async def update_risk(
    workspace_id: str,
    risk_id: str,
    req: RiskUpdate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    risk = await risk_service.get_risk(db, risk_id)
    if risk is None or risk.workspace_id != workspace_id:
        raise AppException(404, "风险不存在", 404)
    if risk.status == "CLOSED":
        raise AppException(400, "已关闭的风险不可编辑", 400)
    data = await risk_service.update_risk(
        db, risk,
        milestone_id=req.milestone_id,
        title=req.title, description=req.description,
        risk_type=req.risk_type, probability=req.probability,
        impact=req.impact, mitigation=req.mitigation,
        owner_id=req.owner_id,
    )
    return {"code": 0, "message": "ok", "data": data}


@router.post("/{risk_id}/close", response_model=APIResponse)
async def close_risk(
    workspace_id: str,
    risk_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    risk = await risk_service.get_risk(db, risk_id)
    if risk is None or risk.workspace_id != workspace_id:
        raise AppException(404, "风险不存在", 404)
    if risk.status == "CLOSED":
        raise AppException(400, "风险已关闭", 400)
    data = await risk_service.close_risk(db, risk)
    return {"code": 0, "message": "ok", "data": data}


@router.post("/{risk_id}/start-mitigation", response_model=APIResponse)
async def start_mitigation(
    workspace_id: str,
    risk_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    risk = await risk_service.get_risk(db, risk_id)
    if risk is None or risk.workspace_id != workspace_id:
        raise AppException(404, "风险不存在", 404)
    if risk.status != "IDENTIFIED":
        raise AppException(400, "只能在已识别状态下开始应对", 400)
    data = await risk_service.update_risk(db, risk, status="MITIGATING")
    return {"code": 0, "message": "ok", "data": data}


def _risk_dict(r):
    if isinstance(r, dict):
        return r
    from app.services.risk import _risk_to_dict
    return _risk_to_dict(r)
