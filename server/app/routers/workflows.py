from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.workflow import WorkflowTemplate, WorkflowState, WorkflowTransition
from app.schemas.common import APIResponse
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/workspaces/{workspace_id}/workflow", tags=["workflows"])


@router.get("/templates", response_model=APIResponse)
async def list_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(WorkflowTemplate))
    templates = result.scalars().all()
    data = []
    for t in templates:
        states_result = await db.execute(
            select(WorkflowState).where(WorkflowState.template_id == t.id).order_by(WorkflowState.order)
        )
        transitions_result = await db.execute(
            select(WorkflowTransition).where(WorkflowTransition.template_id == t.id)
        )
        data.append({
            "id": t.id, "name": t.name, "description": t.description, "is_builtin": t.is_builtin,
            "states": [{"id": s.id, "name": s.name, "order": s.order, "category": s.category} for s in states_result.scalars().all()],
            "transitions": [{"id": tr.id, "from_state_id": tr.from_state_id, "to_state_id": tr.to_state_id, "name": tr.name} for tr in transitions_result.scalars().all()],
        })
    return {"code": 0, "message": "ok", "data": data}


@router.get("/current", response_model=APIResponse)
async def get_current_workflow(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    # MVP: return the default "standard software" template
    result = await db.execute(
        select(WorkflowTemplate).where(WorkflowTemplate.is_builtin.is_(True)).limit(1)
    )
    template = result.scalar_one_or_none()
    if template is None:
        return {"code": 0, "message": "ok", "data": _default_workflow()}
    return {"code": 0, "message": "ok", "data": {"id": template.id, "name": template.name}}


def _default_workflow():
    return {
        "id": "default",
        "name": "标准软件开发",
        "states": [
            {"name": "Backlog", "category": "TODO", "order": 0},
            {"name": "To Do", "category": "TODO", "order": 1},
            {"name": "In Progress", "category": "IN_PROGRESS", "order": 2},
            {"name": "In Review", "category": "IN_REVIEW", "order": 3},
            {"name": "QA", "category": "IN_REVIEW", "order": 4},
            {"name": "Done", "category": "DONE", "order": 5},
        ],
    }
