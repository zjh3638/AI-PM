"""PM-extension AI tools.

Tools that go beyond simple CRUD: scan_risks aggregates risk signals across a
workspace; future tools (decompose_requirement, extract_action_items) live
here too so app/services/ai_service.py stays focused on the core six.
"""
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.task import Task

ACTIVE_STATUSES = ("TODO", "IN_PROGRESS", "IN_REVIEW")
DEFAULT_DUE_SOON_HORIZON = 3


async def scan_risks(
    db: AsyncSession,
    workspace_id: str,
    horizon_days: Optional[int] = None,
) -> dict:
    """Bucket every active task in the workspace into risk categories.

    Returns three lists (`overdue`, `due_soon`, `unassigned`) plus a `summary`
    of counts. `horizon_days` controls how far into the future "due soon"
    reaches (default 3).
    """
    horizon = horizon_days if horizon_days and horizon_days > 0 else DEFAULT_DUE_SOON_HORIZON
    today = date.today()
    soon_cutoff = today + timedelta(days=horizon)

    rows = (await db.execute(
        select(Task)
        .options(selectinload(Task.assignee))
        .where(Task.workspace_id == workspace_id,
               Task.status.in_(ACTIVE_STATUSES))
    )).scalars().all()

    overdue, due_soon, unassigned = [], [], []
    for t in rows:
        assignee_name = t.assignee.display_name if t.assignee else None
        if t.due_date and t.due_date < today:
            overdue.append({
                "id": t.id, "title": t.title, "priority": t.priority,
                "status": t.status, "assignee_name": assignee_name,
                "due_date": t.due_date.isoformat(),
                "days_overdue": (today - t.due_date).days,
            })
        elif t.due_date and today <= t.due_date <= soon_cutoff:
            due_soon.append({
                "id": t.id, "title": t.title, "priority": t.priority,
                "status": t.status, "assignee_name": assignee_name,
                "due_date": t.due_date.isoformat(),
                "days_until_due": (t.due_date - today).days,
            })
        if not t.assignee_id:
            unassigned.append({
                "id": t.id, "title": t.title, "priority": t.priority,
                "status": t.status,
                "due_date": t.due_date.isoformat() if t.due_date else None,
            })

    overdue.sort(key=lambda x: -x["days_overdue"])
    due_soon.sort(key=lambda x: x["days_until_due"])
    return {
        "summary": {"overdue": len(overdue), "due_soon": len(due_soon),
                    "unassigned": len(unassigned)},
        "overdue": overdue, "due_soon": due_soon, "unassigned": unassigned,
    }
