from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.activity_log import ActivityLog


async def log_activity(db: AsyncSession, task_id: str, user_id: str, action_type: str, field_name: str = None, old_value: str = None, new_value: str = None) -> ActivityLog:
    log = ActivityLog(task_id=task_id, user_id=user_id, action_type=action_type, field_name=field_name, old_value=old_value, new_value=new_value)
    db.add(log)
    return log


async def get_activity(db: AsyncSession, task_id: str) -> list[dict]:
    result = await db.execute(
        select(ActivityLog).where(ActivityLog.task_id == task_id)
        .options(selectinload(ActivityLog.user))
        .order_by(ActivityLog.created_at.desc()).limit(50)
    )
    logs = result.scalars().all()
    return [_log_to_dict(l) for l in logs]


def _log_to_dict(log: ActivityLog) -> dict:
    action_labels = {
        'CREATE': '创建了任务',
        'UPDATE': '修改了',
        'STATUS_CHANGE': '变更状态',
        'ASSIGN': '变更负责人',
        'COMMENT': '添加了评论',
    }
    return {
        "id": log.id, "task_id": log.task_id,
        "user_id": log.user_id,
        "user_name": log.user.display_name if log.user else None,
        "action_type": log.action_type,
        "action_label": action_labels.get(log.action_type, log.action_type),
        "field_name": log.field_name,
        "old_value": log.old_value,
        "new_value": log.new_value,
        "created_at": log.created_at.isoformat() if log.created_at else "",
    }
