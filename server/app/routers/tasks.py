from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate, TaskMoveRequest, TaskSplitRequest
from app.schemas.common import APIResponse, PaginatedResponse
from app.services import task as task_service
from app.services.task import get_phases_for_type
from app.services.permission import PermissionChecker, get_permission_checker, STATUS_TRANSITIONS
from app.exceptions import AppException

router = APIRouter(prefix="/api/workspaces/{workspace_id}", tags=["tasks"])


class AdvanceRequest(BaseModel):
    content: str = ""


def _task_to_dict(task) -> dict:
    return task_service._task_to_dict(task)


@router.post("/tasks", response_model=APIResponse)
async def create_task(
    workspace_id: str,
    req: TaskCreate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    # Validate phase is valid for task type
    valid_phases = get_phases_for_type(req.task_type)
    phase = req.phase if req.phase in valid_phases else valid_phases[0]
    task = await task_service.create_task(
        db, workspace_id,
        task_type=req.task_type, title=req.title, description=req.description,
        status=req.status, phase=phase, priority=req.priority, severity=req.severity,
        parent_id=req.parent_id, epic_id=req.epic_id, iteration_id=req.iteration_id,
        milestone_id=req.milestone_id,
        assignee_id=req.assignee_id, reviewer_id=req.reviewer_id,
        proposer_id=req.proposer_id, analyst_id=req.analyst_id,
        qa_owner_id=req.qa_owner_id, verifier_id=req.verifier_id,
        reviewer_ids=req.reviewer_ids,
        estimation=req.estimation, estimation_unit=req.estimation_unit,
        sort_order=req.sort_order, due_date=req.due_date,
    )
    task = await task_service.get_task(db, task.id)
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
    milestone_id: str = Query(default=""),
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
        iteration_id=iteration_id or None, milestone_id=milestone_id or None,
        epic_id=epic_id or None, parent_id=parent_id or None, keyword=keyword or None,
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
    group_by: str = Query(default="status"),
    task_type: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    columns = await task_service.get_kanban(db, workspace_id, group_by, task_type=task_type or None)
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
    data["permissions"] = await pc.get_task_permissions(task)
    return {"code": 0, "message": "ok", "data": data}


@router.get("/tasks/{task_id}/permissions", response_model=APIResponse)
async def get_task_permissions(
    workspace_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    task = await task_service.get_task(db, task_id)
    if task is None or task.workspace_id != workspace_id:
        raise AppException(404, "任务不存在", 404)
    perms = await pc.get_task_permissions(task)
    return {"code": 0, "message": "ok", "data": perms}


@router.patch("/tasks/{task_id}", response_model=APIResponse)
async def update_task(
    workspace_id: str,
    task_id: str,
    req: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    current_user: User = Depends(get_current_user),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    task = await task_service.get_task(db, task_id)
    if task is None or task.workspace_id != workspace_id:
        raise AppException(404, "任务不存在", 404)

    perms = await pc.get_task_permissions(task)
    if not perms["can_edit"]:
        raise AppException(403, "只能编辑自己负责的任务", 403)

    # Log activity for changed fields
    from app.services import activity_svc
    field_labels = {
        'status': '状态', 'priority': '优先级',
        'assignee_id': '负责人', 'reviewer_id': '审核人',
        'title': '标题', 'milestone_id': '里程碑', 'iteration_id': '迭代',
        'proposer_id': '提出人', 'analyst_id': '分析师',
        'qa_owner_id': '测试负责人', 'verifier_id': '验证人',
    }
    for field, label in field_labels.items():
        req_val = getattr(req, field, None)
        old_val = getattr(task, field, None)
        if req_val is not None and str(req_val) != str(old_val):
            action = 'STATUS_CHANGE' if field == 'status' else 'ASSIGN' if field in ('assignee_id', 'reviewer_id', 'proposer_id', 'analyst_id', 'qa_owner_id', 'verifier_id') else 'UPDATE'
            await activity_svc.log_activity(db, task_id, current_user.id, action,
                field_name=label, old_value=str(old_val), new_value=str(req_val))

    task = await task_service.update_task(
        db, task,
        title=req.title, description=req.description, status=req.status, phase=req.phase,
        priority=req.priority, severity=req.severity,
        parent_id=req.parent_id, epic_id=req.epic_id,
        iteration_id=req.iteration_id, milestone_id=req.milestone_id,
        assignee_id=req.assignee_id, reviewer_id=req.reviewer_id,
        proposer_id=req.proposer_id, analyst_id=req.analyst_id,
        qa_owner_id=req.qa_owner_id, verifier_id=req.verifier_id,
        reviewer_ids=req.reviewer_ids,
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
    current_user: User = Depends(get_current_user),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    task = await task_service.get_task(db, task_id)
    if task is None or task.workspace_id != workspace_id:
        raise AppException(404, "任务不存在", 404)

    is_mgr = await pc.is_manager(workspace_id)

    # Validate status transition
    if task.status == req.new_status:
        # Same-status reorder is always allowed
        pass
    elif not pc.can_transition_status(task, req.new_status, current_user.id, is_mgr):
        # Map status for readable error
        status_names = {"TODO": "待办", "IN_PROGRESS": "进行中", "IN_REVIEW": "审核中", "DONE": "已完成"}
        from_s = status_names.get(task.status, task.status)
        to_s = status_names.get(req.new_status, req.new_status)
        raise AppException(403, f"不能将任务从「{from_s}」移动到「{to_s}」", 403)

    from app.services import activity_svc
    await activity_svc.log_activity(db, task_id, current_user.id, "STATUS_CHANGE",
        field_name="状态", old_value=task.status, new_value=req.new_status)

    task = await task_service.move_task(db, task, req.new_status, req.sort_order)
    return {"code": 0, "message": "ok", "data": _task_to_dict(task)}


@router.get("/tasks/{task_id}/activity", response_model=APIResponse)
async def get_task_activity(
    workspace_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    from app.services import activity_svc
    logs = await activity_svc.get_activity(db, task_id)
    return {"code": 0, "message": "ok", "data": logs}


@router.post("/tasks/{task_id}/advance-phase", response_model=APIResponse)
async def advance_task_phase(
    workspace_id: str,
    task_id: str,
    req: AdvanceRequest,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    current_user: User = Depends(get_current_user),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    task = await task_service.get_task(db, task_id)
    if task is None or task.workspace_id != workspace_id:
        raise AppException(404, "任务不存在", 404)

    perms = await pc.get_task_permissions(task)
    if not perms["can_advance_phase"]:
        raise AppException(403, "无权推进此任务阶段", 403)

    if task.status != "DONE":
        raise AppException(400, "任务未完成，不能推进阶段（需要先完成当前阶段的任务）", 400)

    phases = get_phases_for_type(task.task_type)
    idx = phases.index(task.phase) if task.phase in phases else -1
    if idx < 0 or idx == len(phases) - 1:
        raise AppException(400, "已是最后一个阶段", 400)

    new_phase = phases[idx + 1]
    task = await task_service.update_task(db, task, phase=new_phase, status="TODO")

    from app.services import activity_svc
    advanced_children = 0
    if task.task_type == "STORY":
        children = await task_service.get_children(db, task_id)
        for child in children:
            child_phases = get_phases_for_type(child.task_type)
            # Only advance children that are in the old phase AND the new phase is valid for them
            if child.phase == phases[idx] and new_phase in child_phases:
                await task_service.update_task(db, child, phase=new_phase, status="TODO")
                advanced_children += 1

    if req.content:
        from app.services import comment_svc
        await comment_svc.create_comment(db, current_user.id,
            task_id=task_id, content=f"[阶段推进: {phases[idx]} → {new_phase}]\n产出物说明：{req.content}")

    msg = f"阶段推进: {phases[idx]} → {new_phase}"
    if advanced_children > 0:
        msg += f"，连带推进 {advanced_children} 个子任务"
    await activity_svc.log_activity(db, task_id, current_user.id, "UPDATE",
        field_name="阶段", old_value=phases[idx], new_value=new_phase)
    return {"code": 0, "message": msg, "data": _task_to_dict(task)}


@router.post("/tasks/{task_id}/split", response_model=APIResponse)
async def split_story_tasks(
    workspace_id: str,
    task_id: str,
    req: TaskSplitRequest,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    current_user: User = Depends(get_current_user),
):
    """Split a STORY into child dev tasks. Only the story assignee (or OWNER/MANAGER) can do this."""
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    parent = await task_service.get_task(db, task_id)
    if parent is None or parent.workspace_id != workspace_id:
        raise AppException(404, "任务不存在", 404)
    if parent.task_type != "STORY":
        raise AppException(400, "只有 Story 才能拆分子任务", 400)

    perms = await pc.get_task_permissions(parent)
    if not perms["can_split"]:
        raise AppException(403, "只有 Story 负责人或项目经理才能拆分子任务", 403)

    # Child tasks start in DEVELOPMENT phase (if parent is past it, use current parent phase)
    child_phases = get_phases_for_type("TASK")
    start_phase = parent.phase if parent.phase in child_phases else child_phases[0]

    created = []
    for child_req in req.children:
        child = await task_service.create_task(
            db, workspace_id,
            task_type=child_req.task_type or "TASK", title=child_req.title, description=child_req.description,
            status="TODO", phase=start_phase, priority=child_req.priority or parent.priority,
            parent_id=task_id, epic_id=parent.epic_id, milestone_id=child_req.milestone_id or parent.milestone_id,
            assignee_id=child_req.assignee_id, reviewer_id=child_req.reviewer_id,
            estimation=child_req.estimation, sort_order=len(created),
        )
        child = await task_service.get_task(db, child.id)
        created.append(_task_to_dict(child))

    from app.services import activity_svc
    await activity_svc.log_activity(db, task_id, current_user.id, "UPDATE",
        field_name="子任务", old_value="", new_value=f"拆分为 {len(created)} 个开发任务")

    return {"code": 0, "message": "ok", "data": created}
