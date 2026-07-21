from typing import Optional
import logging

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.workspace import Workspace
from app.models.workspace_member import WorkspaceMember
from app.models.user import User
from app.exceptions import AppException
from app.config import settings

logger = logging.getLogger(__name__)


async def create_workspace(db: AsyncSession, creator: User, **kwargs) -> Workspace:
    # Auto-generate key from name if not provided
    import re, secrets
    if not kwargs.get("key"):
        name = kwargs.get("name", "project")
        slug = re.sub(r'[^a-zA-Z0-9_-]', '-', name.lower())[:30].strip('-')
        if not slug or slug == name.lower():  # name is Chinese or all stripped
            slug = "proj"
        suffix = secrets.token_hex(4)
        kwargs["key"] = f"{slug}-{suffix}"

    result = await db.execute(select(Workspace).where(Workspace.key == kwargs["key"]))
    if result.scalar_one_or_none():
        raise AppException(400, "工作空间标识已存在")

    # Default owner to creator if not specified
    owner_id = kwargs.pop("owner_id", None) or creator.id
    kwargs["owner_id"] = owner_id

    # Auto-assign workflow template based on type
    if "template_id" not in kwargs or not kwargs.get("template_id"):
        from app.models.workflow import WorkflowTemplate
        ws_type = kwargs.get("type", "PROJECT")
        template_name = "完整研发流程" if ws_type == "PROJECT" else "轻量专题流程"
        tmpl_result = await db.execute(select(WorkflowTemplate).where(WorkflowTemplate.name == template_name))
        template = tmpl_result.scalar_one_or_none()
        if template:
            kwargs["template_id"] = template.id

    ws = Workspace(**kwargs)
    db.add(ws)
    await db.flush()

    # Creator always gets OWNER role
    member = WorkspaceMember(workspace_id=ws.id, user_id=creator.id, role="OWNER")
    db.add(member)

    # If owner is different from creator, also add owner as OWNER member
    if owner_id != creator.id:
        owner_member = WorkspaceMember(workspace_id=ws.id, user_id=owner_id, role="OWNER")
        db.add(owner_member)

    chat_id = None
    # 创建企业微信群聊（如果启用）
    if settings.wecom_enabled:
        try:
            from app.services import wecom_service

            # 数据库 UUID → 企业微信 userid（username / sAMAccountName）
            wecom_ids = [creator.username]
            if owner_id != creator.id:
                result = await db.execute(select(User).where(User.id == owner_id))
                owner_user = result.scalar_one_or_none()
                if owner_user:
                    wecom_ids.append(owner_user.username)

            # 创建外部群聊
            chat_id = await wecom_service.create_external_group(
                name=f"【{ws.name}】项目群",
                owner_userid=wecom_ids[0],
                member_userids=wecom_ids,
            )
            ws.wecom_chat_id = chat_id
            logger.info(f"工作空间 {ws.id} 企业微信群聊创建成功: {chat_id}")

            # 发送群创建通知
            from app.services import wecom_notification
            try:
                await wecom_notification.notify_group_created(db, ws.id, creator, chat_id)
            except Exception:
                pass  # 通知失败不影响工作空间创建
        except Exception as e:
            logger.warning(f"创建企业微信群聊失败，不阻断工作空间创建: {e}")
            # 群聊创建失败不影响工作空间创建

    await db.commit()
    await db.refresh(ws)
    return ws


async def get_workspace(db: AsyncSession, workspace_id: str) -> Optional[Workspace]:
    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id)
    )
    return result.scalar_one_or_none()


async def init_wecom_group(db: AsyncSession, workspace_id: str) -> str:
    """为已有工作空间初始化企业微信（联盟E动）群聊并拉入全部成员。

    用于存量项目补建群：创建群聊、把所有真实成员（排除 AI Agent）拉进群，
    群主优先取工作空间 owner，否则取第一个成员。

    Args:
        db: 数据库会话
        workspace_id: 工作空间ID

    Returns:
        新建群聊的 chatid

    Raises:
        AppException: 企业微信未启用、工作空间不存在、已有群聊、无有效成员或建群失败
    """
    if not settings.wecom_enabled:
        raise AppException(400, "企业微信（联盟E动）未启用")

    ws = await get_workspace(db, workspace_id)
    if ws is None:
        raise AppException(404, "工作空间不存在", 404)
    if ws.wecom_chat_id:
        raise AppException(400, "该项目已存在联盟E动群")

    # 取全部真实成员（排除 AI Agent 与空 user_id）
    result = await db.execute(
        select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id)
    )
    members = result.scalars().all()
    real_members = [m for m in members if m.user_id]
    if not real_members:
        raise AppException(400, "项目暂无可加入群聊的成员")

    # 收集企业微信 userid（username / sAMAccountName）
    user_ids = [m.user_id for m in real_members]
    result = await db.execute(select(User).where(User.id.in_(user_ids)))
    users = {u.id: u for u in result.scalars().all()}

    wecom_userids = []
    for m in real_members:
        u = users.get(m.user_id)
        if u and u.username:
            wecom_userids.append(u.username)

    if not wecom_userids:
        raise AppException(400, "项目成员暂无企业微信 userid，无法创建群聊")

    # 群主优先取 owner（必须是真实成员），且必须在成员列表中
    owner_wecom_id = None
    if ws.owner_id and ws.owner_id in users:
        ow = users[ws.owner_id]
        if ow.username and ow.username in wecom_userids:
            owner_wecom_id = ow.username
    owner_wecom_id = owner_wecom_id or wecom_userids[0]

    from app.services import wecom_service
    try:
        chat_id = await wecom_service.create_external_group(
            name=f"【{ws.name}】项目群",
            owner_userid=owner_wecom_id,
            member_userids=wecom_userids,
        )
    except wecom_service.WeComAPIError as e:
        logger.warning(f"工作空间 {workspace_id} 初始化联盟E动群失败: {e}")
        raise AppException(500, f"创建联盟E动群失败: {e.errmsg}")

    ws.wecom_chat_id = chat_id
    await db.commit()
    await db.refresh(ws)
    logger.info(f"工作空间 {workspace_id} 补建联盟E动群成功: {chat_id}，成员 {len(wecom_userids)} 人")
    return chat_id


async def list_workspaces(
    db: AsyncSession,
    user: User,
    page: int = 1,
    page_size: int = 20,
    keyword: Optional[str] = None,
    status: Optional[str] = None,
    ws_type: Optional[str] = None,
    owner_id: Optional[str] = None,
    department_id: Optional[str] = None,
) -> tuple[list[dict], int]:
    member_query = select(WorkspaceMember.workspace_id).where(
        WorkspaceMember.user_id == user.id
    )
    member_ws_ids = [r[0] for r in (await db.execute(member_query)).all()]

    query = select(Workspace).options(selectinload(Workspace.owner), selectinload(Workspace.department))
    count_query = select(func.count(Workspace.id))

    if user.system_role != "SUPER_ADMIN":
        if not member_ws_ids:
            return [], 0
        query = query.where(Workspace.id.in_(member_ws_ids))
        count_query = count_query.where(Workspace.id.in_(member_ws_ids))

    if keyword:
        like = f"%{keyword}%"
        query = query.where(Workspace.name.ilike(like) | Workspace.key.ilike(like))
        count_query = count_query.where(Workspace.name.ilike(like) | Workspace.key.ilike(like))
    if status:
        query = query.where(Workspace.status == status)
        count_query = count_query.where(Workspace.status == status)
    if ws_type:
        query = query.where(Workspace.type == ws_type)
        count_query = count_query.where(Workspace.type == ws_type)
    if owner_id:
        query = query.where(Workspace.owner_id == owner_id)
        count_query = count_query.where(Workspace.owner_id == owner_id)
    if department_id:
        query = query.where(Workspace.department_id == department_id)
        count_query = count_query.where(Workspace.department_id == department_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    query = query.offset((page - 1) * page_size).limit(page_size).order_by(Workspace.created_at.desc())
    result = await db.execute(query)
    workspaces = result.scalars().all()

    # Batch fetch member counts in a single query
    ws_ids = [ws.id for ws in workspaces]
    member_counts: dict[str, int] = {}
    if ws_ids:
        from sqlalchemy import func as sa_func
        mc_result = await db.execute(
            select(WorkspaceMember.workspace_id, sa_func.count(WorkspaceMember.id))
            .where(WorkspaceMember.workspace_id.in_(ws_ids))
            .group_by(WorkspaceMember.workspace_id)
        )
        member_counts = {row[0]: row[1] for row in mc_result.all()}

    # Batch fetch templates
    template_ids = [ws.template_id for ws in workspaces if ws.template_id]
    templates: dict[str, str] = {}
    if template_ids:
        from app.models.workflow import WorkflowTemplate
        tmpl_result = await db.execute(
            select(WorkflowTemplate).where(WorkflowTemplate.id.in_(template_ids))
        )
        templates = {t.id: t.name for t in tmpl_result.scalars().all()}

    data = []
    for ws in workspaces:
        owner_name = ws.owner.display_name if ws.owner else None
        department_name = ws.department.name if ws.department else None
        template_name = templates.get(ws.template_id) if ws.template_id else None

        data.append({
            "id": ws.id, "name": ws.name, "key": ws.key,
            "description": ws.description, "type": ws.type,
            "status": ws.status, "visibility": ws.visibility,
            "department_id": ws.department_id, "owner_id": ws.owner_id,
            "owner_name": owner_name, "department_name": department_name,
            "git_repo_path": ws.git_repo_path,
            "template_id": ws.template_id, "template_name": template_name,
            "strict_gate": ws.strict_gate if hasattr(ws, 'strict_gate') else True,
            "member_count": member_counts.get(ws.id, 0),
            "created_at": ws.created_at.isoformat() if ws.created_at else "",
            "updated_at": ws.updated_at.isoformat() if ws.updated_at else "",
        })
    return data, total


async def update_workspace(db: AsyncSession, ws: Workspace, **kwargs) -> Workspace:
    new_owner_id = kwargs.pop("owner_id", None)

    # Sync member roles when owner changes
    if new_owner_id is not None and new_owner_id != ws.owner_id:
        old_owner_id = ws.owner_id
        # Downgrade old owner's OWNER role to MEMBER
        if old_owner_id:
            old_member_result = await db.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == ws.id,
                    WorkspaceMember.user_id == old_owner_id,
                    WorkspaceMember.role == "OWNER",
                )
            )
            old_member = old_member_result.scalar_one_or_none()
            if old_member:
                old_member.role = "MEMBER"

        # Ensure new owner has OWNER role as member
        new_member_result = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == ws.id,
                WorkspaceMember.user_id == new_owner_id,
            )
        )
        new_member = new_member_result.scalar_one_or_none()
        if new_member:
            new_member.role = "OWNER"
        else:
            owner_member = WorkspaceMember(workspace_id=ws.id, user_id=new_owner_id, role="OWNER")
            db.add(owner_member)

        ws.owner_id = new_owner_id

    for field, value in kwargs.items():
        if value is not None:
            setattr(ws, field, value)
    await db.commit()
    await db.refresh(ws)
    return ws


async def get_members(db: AsyncSession, workspace_id: str) -> list[dict]:
    result = await db.execute(
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .options(selectinload(WorkspaceMember.user))
    )
    members = result.scalars().all()
    return [
        {
            "id": m.id, "workspace_id": m.workspace_id,
            "user_id": m.user_id, "user_name": m.user.display_name if m.user else None,
            "user_avatar": m.user.avatar_url if m.user else None,
            "ai_agent_id": m.ai_agent_id, "role": m.role,
            "created_at": m.created_at.isoformat() if m.created_at else "",
        }
        for m in members
    ]


async def add_member(db: AsyncSession, workspace_id: str, user_id: str, role: str) -> WorkspaceMember:
    result = await db.execute(
        select(WorkspaceMember)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
        .options(selectinload(WorkspaceMember.user))
    )
    if result.scalar_one_or_none():
        raise AppException(400, "该用户已是工作空间成员")

    user = await db.get(User, user_id)
    if user is None:
        raise AppException(404, "用户不存在", 404)

    member = WorkspaceMember(workspace_id=workspace_id, user_id=user_id, role=role)
    db.add(member)
    await db.commit()
    await db.refresh(member, ["user"])

    # 同步到企业微信群聊（如果启用）
    if settings.wecom_enabled:
        try:
            workspace = await get_workspace(db, workspace_id)
            if workspace and workspace.wecom_chat_id and user.username:
                from app.services import wecom_service
                await wecom_service.add_group_members(workspace.wecom_chat_id, [user.username])
                logger.info(f"成员 {user.username} 已同步到企业微信群聊 {workspace.wecom_chat_id}")
        except Exception as e:
            logger.warning(f"同步企业微信群成员失败: {e}")

    return member


async def get_member(db: AsyncSession, workspace_id: str, member_id: str) -> Optional[WorkspaceMember]:
    result = await db.execute(
        select(WorkspaceMember)
        .where(
            WorkspaceMember.id == member_id,
            WorkspaceMember.workspace_id == workspace_id,
        )
        .options(selectinload(WorkspaceMember.user))
    )
    return result.scalar_one_or_none()


async def update_member_role(db: AsyncSession, member: WorkspaceMember, role: str) -> WorkspaceMember:
    member.role = role
    await db.commit()
    await db.refresh(member, ["user"])
    return member


async def remove_member(db: AsyncSession, member: WorkspaceMember):
    workspace_id = member.workspace_id
    user_id = member.user_id
    user_name = member.user.display_name if member.user else "未知成员"

    await db.delete(member)
    await db.commit()

    # 同步到企业微信群聊（如果启用）
    if settings.wecom_enabled:
        try:
            workspace = await get_workspace(db, workspace_id)
            if workspace and workspace.wecom_chat_id and member.user and member.user.username:
                from app.services import wecom_service
                await wecom_service.remove_group_members(workspace.wecom_chat_id, [member.user.username])
                logger.info(f"成员 {member.user.username} 已从企业微信群聊 {workspace.wecom_chat_id} 移除")
        except Exception as e:
            logger.warning(f"移除企业微信群成员失败: {e}")


async def delete_workspace(db: AsyncSession, ws: Workspace):
    from sqlalchemy import select as sa_select
    from app.models.task import Task
    from app.models.milestone import Milestone
    from app.models.iteration import Iteration
    from app.models.attachment import Attachment
    from app.models.activity_log import ActivityLog
    from app.models.chat_history import ChatHistory
    from app.models.comment import Comment
    from app.models.document import Document
    from app.models.requirement_inbox import RequirementInbox
    from app.models.notification import Notification
    from app.models.user_role import UserRole
    from app.models.task_progress import TaskProgress
    from app.models.project_group import ProjectGroupItem

    # Subquery to find task IDs for this workspace (used before tasks are deleted)
    task_ids_subq = sa_select(Task.id).where(Task.workspace_id == ws.id)

    # 1) Delete rows referencing tasks (FK is non-nullable, must go before tasks)
    await db.execute(Attachment.__table__.delete().where(Attachment.task_id.in_(task_ids_subq)))
    await db.execute(ActivityLog.__table__.delete().where(ActivityLog.task_id.in_(task_ids_subq)))
    await db.execute(Comment.__table__.delete().where(Comment.task_id.in_(task_ids_subq)))
    await db.execute(TaskProgress.__table__.delete().where(TaskProgress.task_id.in_(task_ids_subq)))
    # 可空 FK：解除对任务的引用（这些行随后按 workspace_id 一并删除，但需先于删任务解除引用）
    await db.execute(
        Notification.__table__.update()
        .where(Notification.task_id.in_(task_ids_subq))
        .values(task_id=None)
    )
    await db.execute(
        RequirementInbox.__table__.update()
        .where(RequirementInbox.converted_task_id.in_(task_ids_subq))
        .values(converted_task_id=None)
    )

    # 2) Delete tasks (has nullable FKs to milestones/iterations; safe to delete without clearing them)
    await db.execute(Task.__table__.delete().where(Task.workspace_id == ws.id))

    # 3) Delete rows referencing milestones (Risk.milestone_id is nullable)
    from app.models.risk import Risk
    await db.execute(Risk.__table__.delete().where(Risk.milestone_id.in_(
        sa_select(Milestone.id).where(Milestone.workspace_id == ws.id)
    )))

    # 4) Delete milestones
    await db.execute(Milestone.__table__.delete().where(Milestone.workspace_id == ws.id))

    # 5) Delete iterations
    await db.execute(Iteration.__table__.delete().where(Iteration.workspace_id == ws.id))

    # 6) Delete other workspace-level tables
    await db.execute(Document.__table__.delete().where(Document.workspace_id == ws.id))
    await db.execute(RequirementInbox.__table__.delete().where(RequirementInbox.workspace_id == ws.id))
    await db.execute(ChatHistory.__table__.delete().where(ChatHistory.workspace_id == ws.id))
    await db.execute(Notification.__table__.delete().where(Notification.workspace_id == ws.id))
    await db.execute(UserRole.__table__.delete().where(UserRole.workspace_id == ws.id))

    # 7) Remove project group references
    await db.execute(ProjectGroupItem.__table__.delete().where(ProjectGroupItem.workspace_id == ws.id))

    # 8) Delete workspace members
    await db.execute(WorkspaceMember.__table__.delete().where(WorkspaceMember.workspace_id == ws.id))

    # 9) Delete workspace itself
    await db.delete(ws)
    await db.commit()
