from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.workspace_member import WorkspaceMember
from app.schemas.workspace import (
    WorkspaceCreate, WorkspaceUpdate,
    MemberCreate, MemberUpdate,
)
from app.schemas.common import APIResponse, PaginatedResponse
from app.services import workspace as ws_service
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


async def _load_owner_info(db, ws):
    """Load owner display_name and department_name onto workspace object."""
    if ws.owner_id:
        owner_result = await db.execute(
            select(User).where(User.id == ws.owner_id)
        )
        owner = owner_result.scalar_one_or_none()
        if owner:
            ws._owner_name = owner.display_name
            if owner.department_id:
                from app.models.department import Department
                dept_result = await db.execute(
                    select(Department).where(Department.id == owner.department_id)
                )
                dept = dept_result.scalar_one_or_none()
                ws._department_name = dept.name if dept else None
            else:
                ws._department_name = None
        else:
            ws._owner_name = None
            ws._department_name = None
    else:
        ws._owner_name = None
        ws._department_name = None


def _ws_to_dict(ws, member_count: int = 0) -> dict:
    return {
        "id": ws.id, "name": ws.name, "key": ws.key,
        "description": ws.description, "type": ws.type,
        "status": ws.status, "visibility": ws.visibility,
        "owner_id": ws.owner_id, "owner_name": getattr(ws, '_owner_name', None),
        "department_id": ws.department_id, "department_name": getattr(ws, '_department_name', None),
        "git_repo_path": ws.git_repo_path,
        "template_name": getattr(ws, '_template_name', None),
        "strict_gate": getattr(ws, 'strict_gate', True),
        "member_count": member_count,
        "created_at": ws.created_at.isoformat() if ws.created_at else "",
        "updated_at": ws.updated_at.isoformat() if ws.updated_at else "",
    }


async def _count_members(db, workspace_id: str) -> int:
    result = await db.execute(
        select(func.count(WorkspaceMember.id)).where(
            WorkspaceMember.workspace_id == workspace_id
        )
    )
    return result.scalar() or 0


@router.post("", response_model=APIResponse)
async def create_workspace(
    req: WorkspaceCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ws = await ws_service.create_workspace(
        db, user,
        name=req.name, key=req.key, description=req.description,
        type=req.type, visibility=req.visibility, department_id=req.department_id,
    )
    return {"code": 0, "message": "ok", "data": _ws_to_dict(ws, 1)}


@router.get("", response_model=PaginatedResponse)
async def list_workspaces(
    page: int = 1,
    page_size: int = 20,
    keyword: str = "",
    status: str = "",
    type: str = "",
    owner_id: str = "",
    department_id: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data, total = await ws_service.list_workspaces(
        db, user, page=page, page_size=page_size,
        keyword=keyword or None, status=status or None, ws_type=type or None,
        owner_id=owner_id or None, department_id=department_id or None,
    )
    return {"code": 0, "message": "ok", "data": data, "total": total, "page": page, "page_size": page_size}


@router.get("/{workspace_id}/available-users", response_model=APIResponse)
async def available_users(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    from app.models.department import Department
    member_user_ids = (
        await db.execute(
            select(WorkspaceMember.user_id).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id.isnot(None),
            )
        )
    ).scalars().all()
    query = select(User).where(User.status == "ACTIVE")
    if member_user_ids:
        query = query.where(User.id.notin_(member_user_ids))
    query = query.order_by(User.display_name)
    result = await db.execute(query)
    users = result.scalars().all()
    data = []
    for u in users:
        dept_name = None
        if u.department_id:
            dept = await db.get(Department, u.department_id)
            if dept:
                dept_name = dept.name
        data.append({
            "id": u.id, "username": u.username,
            "display_name": u.display_name, "email": u.email,
            "department_name": dept_name,
        })
    return {"code": 0, "message": "ok", "data": data}


async def _load_template_name(db, ws):
    if ws.template_id:
        from app.models.workflow import WorkflowTemplate
        tmpl = await db.get(WorkflowTemplate, ws.template_id)
        ws._template_name = tmpl.name if tmpl else None


@router.get("/{workspace_id}", response_model=APIResponse)
async def get_workspace(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    ws = await ws_service.get_workspace(db, workspace_id)
    if ws is None:
        raise AppException(404, "工作空间不存在", 404)
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    await _load_template_name(db, ws)
    await _load_owner_info(db, ws)
    mc = await _count_members(db, workspace_id)
    return {"code": 0, "message": "ok", "data": _ws_to_dict(ws, mc)}


@router.patch("/{workspace_id}", response_model=APIResponse)
async def update_workspace(
    workspace_id: str,
    req: WorkspaceUpdate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    ws = await ws_service.get_workspace(db, workspace_id)
    if ws is None:
        raise AppException(404, "工作空间不存在", 404)
    ws = await ws_service.update_workspace(db, ws, name=req.name, description=req.description, type=req.type, visibility=req.visibility, strict_gate=req.strict_gate, owner_id=req.owner_id)
    await _load_template_name(db, ws)
    await _load_owner_info(db, ws)
    mc = await _count_members(db, workspace_id)
    return {"code": 0, "message": "ok", "data": _ws_to_dict(ws, mc)}


@router.post("/{workspace_id}/archive", response_model=APIResponse)
async def archive_workspace(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER")
    ws = await ws_service.get_workspace(db, workspace_id)
    if ws is None:
        raise AppException(404, "工作空间不存在", 404)
    await ws_service.update_workspace(db, ws, status="ARCHIVED")
    return {"code": 0, "message": "ok", "data": None}


# --- Member endpoints ---

@router.get("/{workspace_id}/members", response_model=APIResponse)
async def list_members(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    members = await ws_service.get_members(db, workspace_id)
    return {"code": 0, "message": "ok", "data": members}


@router.post("/{workspace_id}/members", response_model=APIResponse)
async def add_member(
    workspace_id: str,
    req: MemberCreate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    member = await ws_service.add_member(db, workspace_id, req.user_id, req.role)
    data = {
        "id": member.id, "workspace_id": member.workspace_id,
        "user_id": member.user_id, "user_name": member.user.display_name if member.user else None,
        "user_avatar": member.user.avatar_url if member.user else None,
        "ai_agent_id": member.ai_agent_id, "role": member.role,
        "created_at": member.created_at.isoformat() if member.created_at else "",
    }
    return {"code": 0, "message": "ok", "data": data}


@router.patch("/{workspace_id}/members/{member_id}", response_model=APIResponse)
async def update_member(
    workspace_id: str,
    member_id: str,
    req: MemberUpdate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER")
    member = await ws_service.get_member(db, workspace_id, member_id)
    if member is None:
        raise AppException(404, "成员不存在", 404)
    member = await ws_service.update_member_role(db, member, req.role)
    data = {
        "id": member.id, "workspace_id": member.workspace_id,
        "user_id": member.user_id, "user_name": member.user.display_name if member.user else None,
        "user_avatar": member.user.avatar_url if member.user else None,
        "ai_agent_id": member.ai_agent_id, "role": member.role,
        "created_at": member.created_at.isoformat() if member.created_at else "",
    }
    return {"code": 0, "message": "ok", "data": data}


@router.delete("/{workspace_id}/members/{member_id}", response_model=APIResponse)
async def remove_member(
    workspace_id: str,
    member_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    member = await ws_service.get_member(db, workspace_id, member_id)
    if member is None:
        raise AppException(404, "成员不存在", 404)
    if member.role == "OWNER":
        raise AppException(400, "不能移除工作空间所有者")
    await ws_service.remove_member(db, member)
    return {"code": 0, "message": "ok", "data": None}
