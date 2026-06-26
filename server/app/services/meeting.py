from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.meeting import Meeting
from app.models.task import Task
from app.models.milestone import Milestone
from app.models.risk import Risk
from app.models.workspace import Workspace
from app.models.user import User
from app.models.project_group import ProjectGroupItem


async def create_meeting(
    db: AsyncSession,
    title: str,
    dimension: str,
    dimension_id: str,
    meeting_type: str,
    host_id: str,
) -> Meeting:
    meeting = Meeting(
        title=title,
        dimension=dimension,
        dimension_id=dimension_id,
        meeting_type=meeting_type,
        host_id=host_id,
    )
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)
    return meeting


async def get_meeting(db: AsyncSession, meeting_id: str) -> Optional[Meeting]:
    result = await db.execute(
        select(Meeting)
        .where(Meeting.id == meeting_id)
        .options(selectinload(Meeting.host))
    )
    return result.scalar_one_or_none()


async def get_workspace_ids_for_meeting(
    db: AsyncSession, meeting: Meeting,
) -> list[str]:
    """Returns list of workspace IDs covered by this meeting.

    If dimension=PROJECT, returns [dimension_id].
    If PROJECT_GROUP, queries ProjectGroupItem for all workspace IDs in the group.
    """
    if meeting.dimension == "PROJECT":
        return [meeting.dimension_id]

    # PROJECT_GROUP
    result = await db.execute(
        select(ProjectGroupItem.workspace_id).where(
            ProjectGroupItem.group_id == meeting.dimension_id
        )
    )
    return [row[0] for row in result.all()]


async def get_board_data(
    db: AsyncSession,
    meeting: Meeting,
    workspace_id: str,
) -> dict:
    """Aggregates board data for a given meeting and workspace.

    Returns a dict matching the BoardData Pydantic schema structure.
    """
    today = date.today()

    # ── Workspace info ──────────────────────────────────────────────
    ws_result = await db.execute(
        select(Workspace.name, User.display_name)
        .outerjoin(User, User.id == Workspace.owner_id)
        .where(Workspace.id == workspace_id)
    )
    ws_row = ws_result.one_or_none()
    if ws_row is None:
        raise ValueError(f"Workspace {workspace_id} not found")
    workspace_name, owner_name = ws_row

    # ── Task stats ──────────────────────────────────────────────────
    total_result = await db.execute(
        select(func.count(Task.id)).where(Task.workspace_id == workspace_id)
    )
    total = total_result.scalar() or 0

    done_result = await db.execute(
        select(func.count(Task.id)).where(
            Task.workspace_id == workspace_id, Task.status == "DONE"
        )
    )
    done = done_result.scalar() or 0

    overdue_result = await db.execute(
        select(func.count(Task.id)).where(
            Task.workspace_id == workspace_id,
            Task.status != "DONE",
            Task.due_date < today,
        )
    )
    overdue = overdue_result.scalar() or 0

    pct = round(done / total * 100, 1) if total > 0 else 0.0

    # ── Health ──────────────────────────────────────────────────────
    if overdue > 2:
        health = "blocked"
    elif overdue > 0 or (total > 0 and done / total < 0.3):
        health = "at-risk"
    else:
        health = "on-track"

    # ── Milestones with grouped tasks ───────────────────────────────
    ms_result = await db.execute(
        select(Milestone)
        .where(Milestone.workspace_id == workspace_id)
        .order_by(Milestone.sort_order, Milestone.start_date)
    )
    milestones_list = ms_result.scalars().all()

    board_milestones = []
    for ms in milestones_list:
        ms_tasks_result = await db.execute(
            select(Task).where(Task.milestone_id == ms.id)
        )
        ms_tasks = ms_tasks_result.scalars().all()

        completed = []
        in_progress = []
        delayed = []

        for t in ms_tasks:
            task_dict = {
                "id": t.id,
                "title": t.title,
                "status": t.status,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            }
            if t.status == "DONE":
                completed.append(task_dict)
            elif t.due_date and t.due_date < today:
                # delayed: status != DONE AND due_date < today
                delayed.append(task_dict)
            else:
                # in progress: status in [TODO, IN_PROGRESS, IN_REVIEW]
                # AND (due_date >= today OR due_date IS NULL)
                in_progress.append(task_dict)

        # Last 5 completed by completed_at desc
        completed.sort(key=lambda x: x["completed_at"] or "", reverse=True)
        completed = completed[:5]

        ms_total = len(completed) + len(in_progress) + len(delayed)
        ms_pct = round(len(completed) / ms_total * 100, 1) if ms_total > 0 else 0.0

        board_milestones.append({
            "id": ms.id,
            "name": ms.name,
            "phase": ms.phase,
            "pct": ms_pct,
            "due_date": ms.end_date,
            "overdue": ms.end_date is not None and ms.end_date < today,
            "total_tasks": ms_total,
            "done_tasks": len(completed),
            "completed": completed,
            "in_progress": in_progress,
            "delayed": delayed,
        })

    # ── Risks (non-closed) ──────────────────────────────────────────
    risk_result = await db.execute(
        select(Risk)
        .options(selectinload(Risk.milestone), selectinload(Risk.owner))
        .where(Risk.workspace_id == workspace_id, Risk.status != "CLOSED")
        .order_by(Risk.created_at.desc())
    )
    risks = risk_result.scalars().all()
    board_risks = []
    for r in risks:
        board_risks.append({
            "id": r.id,
            "title": r.title,
            "description": r.description,
            "level": r.impact,
            "owner_name": r.owner.display_name if r.owner else None,
            "status": r.status,
            "milestone_name": r.milestone.name if r.milestone else None,
        })

    # ── Recent completed tasks (last 7 days, up to 20) ──────────────
    seven_days_ago = today - timedelta(days=7)
    seven_days_ago_dt = datetime.combine(seven_days_ago, datetime.min.time())
    recent_result = await db.execute(
        select(Task)
        .where(
            Task.workspace_id == workspace_id,
            Task.status == "DONE",
            Task.completed_at >= seven_days_ago_dt,
        )
        .order_by(Task.completed_at.desc())
        .limit(20)
    )
    recent_tasks = recent_result.scalars().all()

    # Collect assignee_ids and fetch display names in one query
    assignee_ids = {t.assignee_id for t in recent_tasks if t.assignee_id}
    user_names_map = {}
    if assignee_ids:
        user_result = await db.execute(
            select(User.id, User.display_name).where(User.id.in_(assignee_ids))
        )
        user_names_map = {uid: name for uid, name in user_result.all()}

    recent_completed = []
    for t in recent_tasks:
        recent_completed.append({
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "assignee_name": user_names_map.get(t.assignee_id) if t.assignee_id else None,
        })

    return {
        "workspace_id": workspace_id,
        "workspace_name": workspace_name,
        "owner_name": owner_name,
        "health": health,
        "pct": pct,
        "total_tasks": total,
        "done": done,
        "overdue": overdue,
        "milestones": board_milestones,
        "risks": board_risks,
        "recent_completed": recent_completed,
    }


async def add_note(
    db: AsyncSession,
    meeting: Meeting,
    who: str,
    text: str,
    note_type: str = "speech",
) -> Meeting:
    """Appends a note dict to meeting.notes JSON list."""
    note = {
        "who": who,
        "text": text,
        "type": note_type,
        "time": datetime.utcnow().isoformat(),
    }
    if meeting.notes is None:
        meeting.notes = []
    meeting.notes = list(meeting.notes) + [note]
    await db.commit()
    await db.refresh(meeting)
    return meeting


async def close_meeting(
    db: AsyncSession,
    meeting: Meeting,
    summary: Optional[str] = None,
) -> Meeting:
    """Sets meeting.status = CLOSED, optionally stores summary."""
    meeting.status = "CLOSED"
    if summary is not None:
        meeting.summary = summary
    await db.commit()
    await db.refresh(meeting)
    return meeting
