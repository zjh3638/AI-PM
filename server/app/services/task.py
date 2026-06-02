from typing import Optional
from datetime import date, datetime

from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.task import Task
from app.models.user import User
from app.exceptions import AppException


async def create_task(db: AsyncSession, workspace_id: str, **kwargs) -> Task:
    task = Task(workspace_id=workspace_id, **kwargs)
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def get_task(db: AsyncSession, task_id: str) -> Optional[Task]:
    result = await db.execute(
        select(Task).where(Task.id == task_id).options(
            selectinload(Task.assignee), selectinload(Task.reviewer),
            selectinload(Task.milestone),
            selectinload(Task.proposer), selectinload(Task.analyst),
            selectinload(Task.qa_owner), selectinload(Task.verifier),
            selectinload(Task.parent),
        )
    )
    return result.scalar_one_or_none()


async def list_tasks(
    db: AsyncSession,
    workspace_id: str,
    page: int = 1,
    page_size: int = 20,
    task_type: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[str] = None,
    iteration_id: Optional[str] = None,
    milestone_id: Optional[str] = None,
    epic_id: Optional[str] = None,
    parent_id: Optional[str] = None,
    keyword: Optional[str] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
) -> tuple[list[Task], int]:
    query = select(Task).where(Task.workspace_id == workspace_id).options(selectinload(Task.milestone), selectinload(Task.assignee), selectinload(Task.reviewer))
    count_query = select(func.count(Task.id)).where(Task.workspace_id == workspace_id)

    if task_type:
        query = query.where(Task.task_type == task_type)
        count_query = count_query.where(Task.task_type == task_type)
    if status:
        query = query.where(Task.status == status)
        count_query = count_query.where(Task.status == status)
    if priority:
        query = query.where(Task.priority == priority)
        count_query = count_query.where(Task.priority == priority)
    if assignee_id:
        query = query.where(Task.assignee_id == assignee_id)
        count_query = count_query.where(Task.assignee_id == assignee_id)
    if iteration_id:
        query = query.where(Task.iteration_id == iteration_id)
        count_query = count_query.where(Task.iteration_id == iteration_id)
    if milestone_id:
        query = query.where(Task.milestone_id == milestone_id)
        count_query = count_query.where(Task.milestone_id == milestone_id)
    if epic_id is not None:
        query = query.where(Task.epic_id == epic_id)
        count_query = count_query.where(Task.epic_id == epic_id)
    if parent_id is not None:
        query = query.where(Task.parent_id == parent_id)
        count_query = count_query.where(Task.parent_id == parent_id)
    if keyword:
        like = f"%{keyword}%"
        query = query.where(Task.title.ilike(like) | Task.description.ilike(like))
        count_query = count_query.where(Task.title.ilike(like) | Task.description.ilike(like))

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    sort_col = getattr(Task, sort_by, Task.created_at)
    if sort_dir == "asc":
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())

    query = query.offset((page - 1) * page_size).limit(page_size).options(selectinload(Task.assignee))
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def update_task(db: AsyncSession, task: Task, **kwargs) -> Task:
    for field, value in kwargs.items():
        if value is not None:
            setattr(task, field, value)
    # Auto-set timestamps
    if kwargs.get("status") == "IN_PROGRESS" and not task.started_at:
        task.started_at = datetime.utcnow()
    if kwargs.get("status") == "DONE":
        task.completed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(task)
    return task


async def get_children(db: AsyncSession, parent_id: str) -> list[Task]:
    result = await db.execute(
        select(Task).where(Task.parent_id == parent_id).order_by(Task.sort_order).options(selectinload(Task.assignee))
    )
    return list(result.scalars().all())


async def get_epics(db: AsyncSession, workspace_id: str) -> list[dict]:
    result = await db.execute(
        select(Task).where(Task.workspace_id == workspace_id, Task.task_type == "EPIC")
        .order_by(Task.created_at.desc())
    )
    epics = result.scalars().all()

    data = []
    for epic in epics:
        stories_result = await db.execute(
            select(Task).where(Task.epic_id == epic.id)
        )
        stories = stories_result.scalars().all()
        total_stories = len(stories)
        done_stories = sum(1 for s in stories if s.status == "DONE")
        total_points = sum(s.estimation or 0 for s in stories)
        completed_points = sum(s.estimation or 0 for s in stories if s.status == "DONE")
        data.append({
            "id": epic.id, "title": epic.title, "task_type": epic.task_type,
            "status": epic.status, "priority": epic.priority,
            "total_stories": total_stories, "done_stories": done_stories,
            "total_points": total_points, "completed_points": completed_points,
            "created_at": epic.created_at.isoformat() if epic.created_at else "",
        })
    return data


# Phase definitions per task type
STORY_PHASES = ["REQUIREMENTS", "DESIGN", "DEVELOPMENT", "TESTING", "RELEASE", "ACCEPTANCE"]
TASK_PHASES = ["DEVELOPMENT", "TESTING", "RELEASE"]
BUG_PHASES = ["DEVELOPMENT", "TESTING"]

def get_phases_for_type(task_type: Optional[str] = None) -> list[str]:
    """Return phase list based on task type, or merged list for all types."""
    if task_type == "STORY":
        return STORY_PHASES
    elif task_type == "TASK" or task_type == "SUB_TASK":
        return TASK_PHASES
    elif task_type == "BUG":
        return BUG_PHASES
    # All types: merge and deduplicate in order
    seen = set()
    merged = []
    for p in STORY_PHASES + TASK_PHASES + BUG_PHASES:
        if p not in seen:
            seen.add(p)
            merged.append(p)
    return merged


async def get_kanban(db: AsyncSession, workspace_id: str, group_by: str = "status", task_type: Optional[str] = None) -> dict:
    query = select(Task).where(Task.workspace_id == workspace_id)
    if task_type:
        query = query.where(Task.task_type == task_type)
    query = query.order_by(Task.sort_order).options(selectinload(Task.assignee), selectinload(Task.milestone))
    result = await db.execute(query)
    all_tasks = result.scalars().all()

    if group_by == "phase":
        phases = get_phases_for_type(task_type)
        return {p: [_task_to_dict(t) for t in all_tasks if t.phase == p] for p in phases}
    else:
        columns = {}
        for state in ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]:
            columns[state] = [_task_to_dict(t) for t in all_tasks if t.status == state]
        return columns


async def move_task(db: AsyncSession, task: Task, new_status: str, sort_order: int) -> Task:
    task.status = new_status
    task.sort_order = sort_order
    if new_status == "IN_PROGRESS" and not task.started_at:
        task.started_at = datetime.utcnow()
    if new_status == "DONE":
        task.completed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(task)
    return task


async def get_child_count(db: AsyncSession, task_id: str) -> int:
    result = await db.execute(
        select(func.count(Task.id)).where(Task.parent_id == task_id)
    )
    return result.scalar() or 0


def _task_to_dict(task: Task) -> dict:
    # Safely access relationships that may not be eagerly loaded
    try:
        milestone_name = task.milestone.name if task.milestone else None
    except Exception:
        milestone_name = None
    try:
        assignee_name = task.assignee.display_name if task.assignee else None
    except Exception:
        assignee_name = None
    try:
        reviewer_name = task.reviewer.display_name if task.reviewer else None
    except Exception:
        reviewer_name = None
    try:
        proposer_name = task.proposer.display_name if task.proposer else None
    except Exception:
        proposer_name = None
    try:
        analyst_name = task.analyst.display_name if task.analyst else None
    except Exception:
        analyst_name = None
    try:
        qa_owner_name = task.qa_owner.display_name if task.qa_owner else None
    except Exception:
        qa_owner_name = None
    try:
        verifier_name = task.verifier.display_name if task.verifier else None
    except Exception:
        verifier_name = None

    return {
        "id": task.id, "workspace_id": task.workspace_id,
        "parent_id": task.parent_id, "epic_id": task.epic_id,
        "iteration_id": task.iteration_id, "milestone_id": task.milestone_id,
        "milestone_name": milestone_name,
        "task_type": task.task_type,
        "title": task.title, "description": task.description,
        "status": task.status, "phase": task.phase, "priority": task.priority,
        "severity": task.severity, "assignee_id": task.assignee_id,
        "assignee_name": assignee_name,
        "reviewer_id": task.reviewer_id,
        "reviewer_name": reviewer_name,
        "proposer_id": task.proposer_id,
        "proposer_name": proposer_name,
        "analyst_id": task.analyst_id,
        "analyst_name": analyst_name,
        "qa_owner_id": task.qa_owner_id,
        "qa_owner_name": qa_owner_name,
        "verifier_id": task.verifier_id,
        "verifier_name": verifier_name,
        "reviewer_ids": task.reviewer_ids or [],
        "estimation": task.estimation, "estimation_unit": task.estimation_unit,
        "sort_order": task.sort_order,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "children_count": 0,
        "created_at": task.created_at.isoformat() if task.created_at else "",
        "updated_at": task.updated_at.isoformat() if task.updated_at else "",
    }
