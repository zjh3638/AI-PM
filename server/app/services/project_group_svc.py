from typing import Optional
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project_group import ProjectGroup, ProjectGroupItem
from app.models.workspace import Workspace
from app.models.user import User
from app.exceptions import AppException


async def create_group(
    db: AsyncSession, creator_id: str, name: str, description: Optional[str] = None
) -> ProjectGroup:
    group = ProjectGroup(name=name, description=description, creator_id=creator_id)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


async def get_group(db: AsyncSession, group_id: str) -> Optional[ProjectGroup]:
    result = await db.execute(
        select(ProjectGroup)
        .where(ProjectGroup.id == group_id)
        .options(selectinload(ProjectGroup.items))
    )
    return result.scalar_one_or_none()


async def list_groups(
    db: AsyncSession, keyword: Optional[str] = None, page: int = 1, page_size: int = 20
) -> tuple[list[ProjectGroup], int]:
    query = select(ProjectGroup).order_by(ProjectGroup.created_at.desc())
    if keyword:
        query = query.where(ProjectGroup.name.ilike(f"%{keyword}%"))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows_q = query.offset((page - 1) * page_size).limit(page_size)
    groups = (await db.execute(rows_q)).scalars().all()
    return list(groups), total


async def update_group(
    db: AsyncSession, group: ProjectGroup,
    name: Optional[str] = None, description: Optional[str] = None,
) -> ProjectGroup:
    if name is not None:
        group.name = name
    if description is not None:
        group.description = description
    await db.commit()
    await db.refresh(group)
    return group


async def delete_group(db: AsyncSession, group: ProjectGroup) -> None:
    await db.delete(group)
    await db.commit()


async def add_workspace(db: AsyncSession, group_id: str, workspace_id: str) -> ProjectGroupItem:
    # 校验 workspace 存在
    ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
    if ws is None:
        raise AppException(404, "工作空间不存在", 404)

    # 校验未重复加入
    existing = (
        await db.execute(
            select(ProjectGroupItem).where(
                ProjectGroupItem.group_id == group_id,
                ProjectGroupItem.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise AppException(400, "该项目已在群中", 400)

    item = ProjectGroupItem(group_id=group_id, workspace_id=workspace_id)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def remove_workspace(db: AsyncSession, group_id: str, workspace_id: str) -> None:
    result = await db.execute(
        delete(ProjectGroupItem).where(
            ProjectGroupItem.group_id == group_id,
            ProjectGroupItem.workspace_id == workspace_id,
        )
    )
    if result.rowcount == 0:
        raise AppException(404, "该项目不在群中", 404)
    await db.commit()


async def get_group_workspaces(db: AsyncSession, group_id: str) -> list[Workspace]:
    result = await db.execute(
        select(Workspace)
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == Workspace.id)
        .where(ProjectGroupItem.group_id == group_id)
    )
    return list(result.scalars().all())


async def get_creator_name(db: AsyncSession, creator_id: str) -> Optional[str]:
    result = await db.execute(select(User.display_name).where(User.id == creator_id))
    return result.scalar_one_or_none()
