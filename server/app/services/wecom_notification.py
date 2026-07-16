"""
企业微信通知服务 — 各类业务事件的消息推送模板和发送逻辑。

为任务分配、状态变更、成员变更、里程碑/迭代等事件生成格式化通知消息。
"""
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.workspace import Workspace
from app.models.task import Task
from app.models.user import User
from app.config import settings
from app.services import wecom_service

logger = logging.getLogger(__name__)


def _format_datetime(dt: Optional[datetime]) -> str:
    """格式化日期时间为可读字符串。"""
    if not dt:
        return ""
    return dt.strftime("%Y-%m-%d %H:%M")


async def _get_workspace_chat_id(db: AsyncSession, workspace_id: str) -> Optional[str]:
    """获取工作空间的企业微信群聊ID。"""
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()
    return workspace.wecom_chat_id if workspace else None


async def notify_task_assigned(
    db: AsyncSession,
    workspace_id: str,
    task: Task,
    assignee_user: User,
    field_label: str,
    operator_user: User,
) -> None:
    """任务分配/变更负责人通知（@提醒被分配人）。

    Args:
        db: 数据库会话
        workspace_id: 工作空间ID
        task: 任务对象
        assignee_user: 被分配的用户
        field_label: 字段标签（如"负责人"、"审核人"）
        operator_user: 操作人
    """
    if not settings.wecom_enabled:
        return

    chat_id = await _get_workspace_chat_id(db, workspace_id)
    if not chat_id:
        logger.debug(f"工作空间 {workspace_id} 未关联企业微信群聊，跳过通知")
        return

    # 构建消息内容
    task_title = task.title or "未命名任务"
    task_link = f"{settings.api_base_url}/workspace/{workspace_id}/task/{task.id}"

    content = f"""📋 任务分配通知

**任务**: {task_title}
**{field_label}**: {assignee_user.display_name}
**操作人**: {operator_user.display_name}
**时间**: {_format_datetime(datetime.now())}

[查看详情]({task_link})"""

    try:
        # 发送 Markdown 消息并 @提醒被分配人
        # 企业微信的 Markdown 不支持直接 @，需要用文本消息
        mention_text = f"<@{assignee_user.id}>"
        full_content = f"{mention_text}\n\n" + content.replace("**", "")

        await wecom_service.send_text_message(chat_id, full_content)
    except Exception as e:
        logger.warning(f"发送任务分配通知失败: {e}")


async def notify_task_status_changed(
    db: AsyncSession,
    workspace_id: str,
    task: Task,
    old_status: str,
    new_status: str,
    operator_user: User,
) -> None:
    """任务状态变更通知。

    Args:
        db: 数据库会话
        workspace_id: 工作空间ID
        task: 任务对象
        old_status: 旧状态
        new_status: 新状态
        operator_user: 操作人
    """
    if not settings.wecom_enabled:
        return

    chat_id = await _get_workspace_chat_id(db, workspace_id)
    if not chat_id:
        return

    # 状态映射
    status_map = {
        "TODO": "待处理",
        "IN_PROGRESS": "进行中",
        "BLOCKED": "已阻塞",
        "DONE": "已完成",
        "CANCELLED": "已取消",
    }

    task_title = task.title or "未命名任务"
    old_status_label = status_map.get(old_status, old_status)
    new_status_label = status_map.get(new_status, new_status)
    task_link = f"{settings.api_base_url}/workspace/{workspace_id}/task/{task.id}"

    content = f"""🔄 任务状态变更

任务: {task_title}
状态: {old_status_label} → {new_status_label}
操作人: {operator_user.display_name}
时间: {_format_datetime(datetime.now())}

查看详情: {task_link}"""

    try:
        await wecom_service.send_text_message(chat_id, content)
    except Exception as e:
        logger.warning(f"发送任务状态变更通知失败: {e}")


async def notify_member_joined(
    db: AsyncSession,
    workspace_id: str,
    member_user: User,
    operator_user: User,
) -> None:
    """成员加入项目通知。

    Args:
        db: 数据库会话
        workspace_id: 工作空间ID
        member_user: 新加入的成员
        operator_user: 操作人
    """
    if not settings.wecom_enabled:
        return

    chat_id = await _get_workspace_chat_id(db, workspace_id)
    if not chat_id:
        return

    content = f"""👋 欢迎新成员

{member_user.display_name} 加入了项目
邀请人: {operator_user.display_name}
时间: {_format_datetime(datetime.now())}"""

    try:
        await wecom_service.send_text_message(chat_id, content)
    except Exception as e:
        logger.warning(f"发送成员加入通知失败: {e}")


async def notify_member_removed(
    db: AsyncSession,
    workspace_id: str,
    member_name: str,
    operator_user: User,
) -> None:
    """成员退出项目通知。

    Args:
        db: 数据库会话
        workspace_id: 工作空间ID
        member_name: 被移除成员的姓名
        operator_user: 操作人
    """
    if not settings.wecom_enabled:
        return

    chat_id = await _get_workspace_chat_id(db, workspace_id)
    if not chat_id:
        return

    content = f"""👋 成员离开

{member_name} 已离开项目
操作人: {operator_user.display_name}
时间: {_format_datetime(datetime.now())}"""

    try:
        await wecom_service.send_text_message(chat_id, content)
    except Exception as e:
        logger.warning(f"发送成员移除通知失败: {e}")


async def notify_milestone_changed(
    db: AsyncSession,
    workspace_id: str,
    milestone_name: str,
    action: str,
    operator_user: User,
) -> None:
    """里程碑变更通知。

    Args:
        db: 数据库会话
        workspace_id: 工作空间ID
        milestone_name: 里程碑名称
        action: 操作类型（created/completed/updated）
        operator_user: 操作人
    """
    if not settings.wecom_enabled:
        return

    chat_id = await _get_workspace_chat_id(db, workspace_id)
    if not chat_id:
        return

    action_map = {
        "created": "创建了里程碑",
        "completed": "完成了里程碑",
        "updated": "更新了里程碑",
    }
    action_label = action_map.get(action, "变更了里程碑")

    content = f"""🎯 里程碑{action_label}

里程碑: {milestone_name}
操作人: {operator_user.display_name}
时间: {_format_datetime(datetime.now())}"""

    try:
        await wecom_service.send_text_message(chat_id, content)
    except Exception as e:
        logger.warning(f"发送里程碑变更通知失败: {e}")


async def notify_iteration_changed(
    db: AsyncSession,
    workspace_id: str,
    iteration_name: str,
    action: str,
    operator_user: User,
) -> None:
    """迭代变更通知。

    Args:
        db: 数据库会话
        workspace_id: 工作空间ID
        iteration_name: 迭代名称
        action: 操作类型（started/completed/updated）
        operator_user: 操作人
    """
    if not settings.wecom_enabled:
        return

    chat_id = await _get_workspace_chat_id(db, workspace_id)
    if not chat_id:
        return

    action_map = {
        "started": "开始了迭代",
        "completed": "完成了迭代",
        "updated": "更新了迭代",
    }
    action_label = action_map.get(action, "变更了迭代")

    content = f"""🔁 迭代{action_label}

迭代: {iteration_name}
操作人: {operator_user.display_name}
时间: {_format_datetime(datetime.now())}"""

    try:
        await wecom_service.send_text_message(chat_id, content)
    except Exception as e:
        logger.warning(f"发送迭代变更通知失败: {e}")
