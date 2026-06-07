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
    if task.task_type == "STORY":
        # Backlog entries are already reviewed — skip requirement review gate
        if task.requirement_review_status is None:
            task.requirement_review_status = "APPROVED"
        # 需求提出人默认兼任测试负责人
        if task.proposer_id and not task.qa_owner_id:
            task.qa_owner_id = task.proposer_id
        # Story 本身即是需求阶段的产出物，创建即视为可推进
        if task.phase == "REQUIREMENTS" and task.status == "TODO":
            task.status = "DONE"
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def get_task(db: AsyncSession, task_id: str) -> Optional[Task]:
    result = await db.execute(
        select(Task).where(Task.id == task_id).options(
            selectinload(Task.assignee), selectinload(Task.reviewer),
            selectinload(Task.milestone), selectinload(Task.iteration),
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
    query = select(Task).where(Task.workspace_id == workspace_id).options(selectinload(Task.milestone), selectinload(Task.iteration), selectinload(Task.assignee), selectinload(Task.reviewer))
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


async def check_phase_advance_gate(task: Task, db: AsyncSession) -> tuple[bool, str]:
    """Validate that a STORY task meets all conditions to advance to the next phase."""
    if task.task_type != "STORY":
        return True, ""

    phases = STORY_PHASES
    idx = phases.index(task.phase) if task.phase in phases else -1
    if idx < 0 or idx >= len(phases) - 1:
        return False, "已是最后一个阶段"

    current_phase = task.phase

    # Gate 1: DESIGN → DEVELOPMENT: design review must be APPROVED
    if current_phase == "DESIGN":
        if task.design_review_status != "APPROVED":
            return False, "方案设计评审未通过，不能进入「开发实现」阶段。请先在需求详情中完成方案评审。"
        return True, ""

    # Gate 2: DEVELOPMENT → TESTING: ALL child tasks must be DONE
    if current_phase == "DEVELOPMENT":
        child_result = await db.execute(
            select(Task).where(Task.parent_id == task.id)
        )
        children = child_result.scalars().all()
        if not children:
            return False, "Story 尚未拆分子任务。请先完成方案设计并拆分开发任务。"
        not_done = [c for c in children if c.status != "DONE"]
        if not_done:
            titles = "、".join(c.title[:20] for c in not_done[:3])
            suffix = "..." if len(not_done) > 3 else ""
            return False, f"尚有 {len(not_done)} 个子任务未完成：{titles}{suffix}"
        return True, ""

    return True, ""


async def review_requirement(db: AsyncSession, task: Task, reviewer_id: str,
                              status: str, note: str = "") -> Task:
    """Approve or reject a Story's requirement review."""
    task.requirement_review_status = status
    task.requirement_reviewer_id = reviewer_id
    task.requirement_review_note = note or None
    if status == "APPROVED":
        task.analyst_id = reviewer_id
    await db.commit()
    await db.refresh(task)
    return task


async def review_design(db: AsyncSession, task: Task, reviewer_id: str,
                         status: str, note: str = "") -> Task:
    """Approve or reject a Story's design review."""
    task.design_review_status = status
    task.design_reviewer_id = reviewer_id
    task.design_review_note = note or None
    if status == "APPROVED":
        # 方案设计评审人默认兼任需求负责人
        if not task.analyst_id:
            task.analyst_id = reviewer_id
    await db.commit()
    await db.refresh(task)
    return task


async def get_kanban(db: AsyncSession, workspace_id: str, group_by: str = "status", task_type: Optional[str] = None) -> dict:
    query = select(Task).where(Task.workspace_id == workspace_id)
    if task_type:
        query = query.where(Task.task_type == task_type)
    query = query.order_by(Task.sort_order).options(selectinload(Task.assignee), selectinload(Task.milestone), selectinload(Task.iteration))
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
        iteration_name = task.iteration.name if task.iteration else None
    except Exception:
        iteration_name = None
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
    try:
        requirement_reviewer_name = task.requirement_reviewer.display_name if task.requirement_reviewer else None
    except Exception:
        requirement_reviewer_name = None
    try:
        design_reviewer_name = task.design_reviewer.display_name if task.design_reviewer else None
    except Exception:
        design_reviewer_name = None

    return {
        "id": task.id, "workspace_id": task.workspace_id,
        "parent_id": task.parent_id, "epic_id": task.epic_id,
        "iteration_id": task.iteration_id, "milestone_id": task.milestone_id,
        "milestone_name": milestone_name,
        "iteration_name": iteration_name,
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
        "requirement_review_status": task.requirement_review_status,
        "requirement_reviewer_id": task.requirement_reviewer_id,
        "requirement_reviewer_name": requirement_reviewer_name,
        "requirement_review_note": task.requirement_review_note,
        "design_review_status": task.design_review_status,
        "design_reviewer_id": task.design_reviewer_id,
        "design_reviewer_name": design_reviewer_name,
        "design_review_note": task.design_review_note,
        "design_doc": task.design_doc,
        "reviewer_ids": task.reviewer_ids or [],
        "estimation": task.estimation, "estimation_unit": task.estimation_unit,
        "sort_order": task.sort_order,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "children_count": 0,
        "created_at": task.created_at.isoformat() if task.created_at else "",
        "updated_at": task.updated_at.isoformat() if task.updated_at else "",
    }


async def list_backlog(db: AsyncSession, workspace_id: str) -> list[dict]:
    """Return all STORY-type tasks without iteration_id (unplanned backlog)."""
    result = await db.execute(
        select(Task)
        .where(Task.workspace_id == workspace_id, Task.task_type == "STORY", Task.iteration_id == None)
        .options(selectinload(Task.assignee), selectinload(Task.milestone), selectinload(Task.iteration),
                 selectinload(Task.proposer))
        .order_by(Task.priority.asc(), Task.created_at.desc())
    )
    stories = result.scalars().all()
    data = []
    for story in stories:
        # Count children
        child_result = await db.execute(
            select(func.count(Task.id)).where(Task.parent_id == story.id)
        )
        child_count = child_result.scalar() or 0
        d = _task_to_dict(story)
        d["children_count"] = child_count
        data.append(d)
    return data


async def plan_backlog_story(db: AsyncSession, story_id: str, iteration_id: str) -> Task:
    """Assign a backlog story to an iteration."""
    story = await db.get(Task, story_id)
    if story is None:
        raise AppException(404, "需求不存在", 404)
    if story.task_type != "STORY":
        raise AppException(400, "只能规划需求类型的任务", 400)
    story.iteration_id = iteration_id
    story.status = "DONE"  # 需求即产出物，规划后直接可推进到设计
    story.phase = "REQUIREMENTS"
    story.requirement_review_status = "APPROVED"
    await db.commit()
    await db.refresh(story)
    return story
