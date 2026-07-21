"""PM-extension AI tools.

Tools that go beyond simple CRUD: scan_risks aggregates risk signals across a
workspace; decompose_requirement splits one requirement into many sub-tasks
in one shot. Future tools (extract_action_items) live here too so
app/services/ai_service.py stays focused on the core six.
"""
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.task import Task

ACTIVE_STATUSES = ("TODO", "IN_PROGRESS", "IN_REVIEW")
DEFAULT_DUE_SOON_HORIZON = 3
ALLOWED_SUBTASK_FIELDS = (
    "description", "priority", "assignee_id", "due_date", "phase",
    "iteration_id", "milestone_id", "task_type", "status",
)


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


async def decompose_requirement(
    db: AsyncSession,
    workspace_id: str,
    subtasks: list[dict],
    parent_title: Optional[str] = None,
    parent_id: Optional[str] = None,
    parent_description: Optional[str] = None,
) -> dict:
    """Create a parent task (or reuse an existing one) and attach N child tasks.

    Either `parent_title` (new parent) or `parent_id` (existing) is required.
    Each subtask dict needs at least `title`; other fields in
    ALLOWED_SUBTASK_FIELDS pass through to Task. Invalid subtasks are skipped
    and surfaced in the returned `errors` list.
    """
    if not parent_id and not parent_title:
        return {"error": "必须提供 parent_id 或 parent_title 之一"}
    if not subtasks:
        return {"error": "subtasks 不能为空"}

    if parent_id:
        parent = (await db.execute(
            select(Task).where(Task.id == parent_id,
                               Task.workspace_id == workspace_id)
        )).scalar_one_or_none()
        if parent is None:
            return {"error": f"父任务 {parent_id} 不存在"}
    else:
        from app.services import task as task_service
        from app.config import settings
        parent = await task_service.create_task(
            db, workspace_id,
            title=parent_title, task_type="STORY", description=parent_description,
        )

    children: list[Task] = []
    errors: list[dict] = []
    for idx, raw in enumerate(subtasks):
        title = (raw or {}).get("title")
        if not title:
            errors.append({"index": idx, "reason": "missing title"})
            continue
        child_kwargs = {"title": title, "parent_id": parent.id}
        for field in ALLOWED_SUBTASK_FIELDS:
            if field in raw and raw[field] is not None:
                value = raw[field]
                if field == "due_date":
                    try:
                        value = date.fromisoformat(value)
                    except (ValueError, TypeError):
                        continue
                child_kwargs[field] = value
        from app.services import task as task_service
        child = await task_service.create_task(db, workspace_id, **child_kwargs)
        children.append(child)

    await db.commit()
    await db.refresh(parent)

    # 发送企业微信通知
    from app.config import settings
    if settings.wecom_enabled:
        try:
            from app.services import wecom_notification
            for c in children:
                await wecom_notification.notify_task_created(db, workspace_id, c, operator_user=None)
        except Exception:
            pass

    return {
        "parent": {"id": parent.id, "title": parent.title,
                   "task_type": parent.task_type},
        "created_count": len(children),
        "children": [{"id": c.id, "title": c.title, "priority": c.priority,
                      "assignee_id": c.assignee_id} for c in children],
        "errors": errors,
    }


async def extract_action_items(
    db: AsyncSession,
    workspace_id: str,
    items: list[dict],
    meeting_title: Optional[str] = None,
    meeting_date: Optional[str] = None,
    attendees: Optional[list[str]] = None,
) -> dict:
    """Create top-level tasks from a meeting's action items.

    Each task's description gets a meeting footer appended (title / date /
    attendees) so reviewers can trace back where the item came from. Unlike
    decompose_requirement these are not children of any parent.
    """
    if not items:
        return {"error": "items 不能为空"}

    footer_parts = []
    if meeting_title:
        footer_parts.append(f"会议：{meeting_title}")
    if meeting_date:
        footer_parts.append(f"时间：{meeting_date}")
    if attendees:
        footer_parts.append(f"出席：{'、'.join(attendees)}")
    footer = "\n\n---\n" + "\n".join(footer_parts) if footer_parts else ""

    from app.services import task as task_service
    from app.config import settings

    created: list[Task] = []
    errors: list[dict] = []
    for idx, raw in enumerate(items):
        title = (raw or {}).get("title")
        if not title:
            errors.append({"index": idx, "reason": "missing title"})
            continue
        desc = (raw.get("description") or "").rstrip() + footer
        task_kwargs = {"title": title, "description": desc or None}
        for field in ("priority", "assignee_id", "due_date", "phase",
                      "iteration_id", "milestone_id"):
            if field in raw and raw[field] is not None:
                value = raw[field]
                if field == "due_date":
                    try:
                        value = date.fromisoformat(value)
                    except (ValueError, TypeError):
                        continue
                task_kwargs[field] = value
        task = await task_service.create_task(db, workspace_id, **task_kwargs)
        created.append(task)

    await db.commit()
    for t in created:
        await db.refresh(t)

    # 发送企业微信通知
    if settings.wecom_enabled:
        try:
            from app.services import wecom_notification
            for t in created:
                await wecom_notification.notify_task_created(db, workspace_id, t, operator_user=None)
        except Exception:
            pass

    return {
        "created_count": len(created),
        "items": [{"id": t.id, "title": t.title, "assignee_id": t.assignee_id,
                   "due_date": t.due_date.isoformat() if t.due_date else None}
                  for t in created],
        "errors": errors,
    }
