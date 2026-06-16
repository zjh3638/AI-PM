from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.workspace import Workspace
from app.models.workspace_member import WorkspaceMember
from app.models.user import User
from app.exceptions import AppException


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

    await db.commit()
    await db.refresh(ws)
    return ws


async def get_workspace(db: AsyncSession, workspace_id: str) -> Optional[Workspace]:
    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id)
    )
    return result.scalar_one_or_none()


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

    query = select(Workspace)
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

    data = []
    for ws in workspaces:
        mc_result = await db.execute(
            select(func.count(WorkspaceMember.id)).where(WorkspaceMember.workspace_id == ws.id)
        )
        # Resolve template name
        template_name = None
        if ws.template_id:
            from app.models.workflow import WorkflowTemplate
            tmpl = await db.get(WorkflowTemplate, ws.template_id)
            template_name = tmpl.name if tmpl else None

        # Resolve owner info
        owner_name = None
        department_name = None
        if ws.owner_id:
            owner_result = await db.execute(
                select(User).where(User.id == ws.owner_id)
            )
            owner = owner_result.scalar_one_or_none()
            if owner:
                owner_name = owner.display_name
                if owner.department_id:
                    from app.models.department import Department
                    dept_result = await db.execute(
                        select(Department).where(Department.id == owner.department_id)
                    )
                    dept = dept_result.scalar_one_or_none()
                    if dept:
                        department_name = dept.name

        data.append({
            "id": ws.id, "name": ws.name, "key": ws.key,
            "description": ws.description, "type": ws.type,
            "status": ws.status, "visibility": ws.visibility,
            "department_id": ws.department_id, "owner_id": ws.owner_id,
            "owner_name": owner_name, "department_name": department_name,
            "git_repo_path": ws.git_repo_path,
            "template_id": ws.template_id, "template_name": template_name,
            "strict_gate": ws.strict_gate if hasattr(ws, 'strict_gate') else True,
            "member_count": mc_result.scalar() or 0,
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
    await db.delete(member)
    await db.commit()


async def delete_workspace(db: AsyncSession, ws: Workspace):
    # Cascade delete all related data
    await db.execute(WorkspaceMember.__table__.delete().where(WorkspaceMember.workspace_id == ws.id))
    from app.models.risk import Risk
    await db.execute(Risk.__table__.delete().where(Risk.workspace_id == ws.id))
    from app.models.task import Task
    await db.execute(Task.__table__.delete().where(Task.workspace_id == ws.id))
    await db.delete(ws)
    await db.commit()
