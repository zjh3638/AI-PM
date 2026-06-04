from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from typing import Optional

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.requirement_inbox import RequirementInbox
from app.models.task import Task
from app.schemas.common import APIResponse, PaginatedResponse
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/workspaces/{workspace_id}/requirements", tags=["requirements"])


class RequirementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: Optional[str] = None
    source: str = "MANUAL"


class TriageRequest(BaseModel):
    status: str  # ACCEPTED / REJECTED / CONVERTED
    triage_note: Optional[str] = None
    target_type: str = "STORY"  # STORY / TASK


@router.post("", response_model=APIResponse)
async def submit_requirement(
    workspace_id: str,
    req: RequirementCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = RequirementInbox(
        workspace_id=workspace_id,
        title=req.title, description=req.description,
        source=req.source, submitter_id=user.id,
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return {"code": 0, "message": "ok", "data": _req_to_dict(r)}


@router.get("", response_model=PaginatedResponse)
async def list_requirements(
    workspace_id: str,
    page: int = 1,
    page_size: int = 20,
    status: str = "",
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    from sqlalchemy import func
    query = select(RequirementInbox).where(RequirementInbox.workspace_id == workspace_id)
    count_q = select(func.count(RequirementInbox.id)).where(RequirementInbox.workspace_id == workspace_id)
    if status:
        query = query.where(RequirementInbox.status == status)
        count_q = count_q.where(RequirementInbox.status == status)
    total = (await db.execute(count_q)).scalar()
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size).order_by(RequirementInbox.created_at.desc()))
    data = [_req_to_dict(r) for r in result.scalars().all()]
    return {"code": 0, "message": "ok", "data": data, "total": total, "page": page, "page_size": page_size}


@router.patch("/{req_id}/triage", response_model=APIResponse)
async def triage_requirement(
    workspace_id: str,
    req_id: str,
    body: TriageRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    r = await db.get(RequirementInbox, req_id)
    if r is None or r.workspace_id != workspace_id:
        raise AppException(404, "需求不存在", 404)

    if body.status == "CONVERTED":
        task = Task(
            workspace_id=workspace_id,
            task_type=body.target_type,
            title=r.title,
            description=r.description,
            assignee_id=user.id,
        )
        db.add(task)
        await db.flush()
        r.converted_task_id = task.id
        r.status = "CONVERTED"
    else:
        r.status = body.status

    r.triage_note = body.triage_note
    await db.commit()
    return {"code": 0, "message": "ok", "data": _req_to_dict(r)}


def _req_to_dict(r: RequirementInbox) -> dict:
    return {
        "id": r.id, "workspace_id": r.workspace_id,
        "title": r.title, "description": r.description,
        "source": r.source, "submitter_id": r.submitter_id,
        "status": r.status, "converted_task_id": r.converted_task_id,
        "triage_note": r.triage_note,
        "created_at": r.created_at.isoformat() if r.created_at else "",
    }
