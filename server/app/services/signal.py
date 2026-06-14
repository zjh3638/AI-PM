from datetime import date, timedelta

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.models.milestone import Milestone


async def get_focus_signals(db: AsyncSession, workspace_id: str) -> list[dict]:
    today = date.today()
    soon = today + timedelta(days=3)
    signals = []

    # 1. Overdue tasks (not done, due date passed)
    overdue_result = await db.execute(
        select(Task)
        .where(
            Task.workspace_id == workspace_id,
            Task.status != "DONE",
            Task.due_date.isnot(None),
            Task.due_date < today,
        )
        .order_by(Task.due_date)
        .limit(1)
    )
    overdue = overdue_result.scalar_one_or_none()
    if overdue:
        days = (today - overdue.due_date).days
        signals.append({
            "type": "risk",
            "level": "red",
            "text": f"「{overdue.title[:20]}」逾期 {days} 天",
            "action": "处理",
            "action_target": overdue.id,
        })

    # 2. Blocked milestones (has dependency not yet DONE)
    blocked_result = await db.execute(
        select(Milestone)
        .where(
            Milestone.workspace_id == workspace_id,
            Milestone.depends_on_id.isnot(None),
        )
    )
    blocked_ms = blocked_result.scalars().all()
    blocked_found = None
    for ms in blocked_ms:
        if ms.depends_on_id:
            pred = await db.get(Milestone, ms.depends_on_id)
            if pred and pred.phase != "DONE":
                blocked_found = (ms, pred)
                break
    if blocked_found:
        ms, pred = blocked_found
        signals.append({
            "type": "blocked",
            "level": "red",
            "text": f"里程碑「{ms.name}」等待「{pred.name}」完成",
            "action": "查看",
            "action_target": ms.id,
        })

    # 3. Upcoming due items (due within 3 days, not done)
    upcoming_result = await db.execute(
        select(Task)
        .where(
            Task.workspace_id == workspace_id,
            Task.status != "DONE",
            Task.due_date.isnot(None),
            Task.due_date >= today,
            Task.due_date <= soon,
        )
        .order_by(Task.due_date)
        .limit(1)
    )
    upcoming = upcoming_result.scalar_one_or_none()
    if upcoming:
        days_left = (upcoming.due_date - today).days
        signals.append({
            "type": "upcoming",
            "level": "amber",
            "text": f"「{upcoming.title[:20]}」{days_left} 天后到期",
            "action": "查看",
            "action_target": upcoming.id,
        })

    # 4. Fallback: recent completed items to fill 3 slots
    if len(signals) < 3:
        done_result = await db.execute(
            select(Task)
            .where(Task.workspace_id == workspace_id, Task.status == "DONE", Task.completed_at.isnot(None))
            .order_by(Task.completed_at.desc())
            .limit(3 - len(signals))
        )
        for t in done_result.scalars().all():
            signals.append({
                "type": "completed",
                "level": "green",
                "text": f"「{t.title[:20]}」已完成",
                "action": "查看",
                "action_target": t.id,
            })

    return signals[:3]
