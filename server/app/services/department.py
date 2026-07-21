from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.department import Department
from app.models.user import User
from app.exceptions import AppException


async def get_tree(db: AsyncSession) -> list[dict]:
    """Return full org tree with user counts."""
    result = await db.execute(
        select(Department).order_by(Department.sort_order)
    )
    all_depts = result.scalars().all()

    # Get user counts per department
    user_counts = {}
    if all_depts:
        from sqlalchemy import cast, String
        dept_ids = [d.id for d in all_depts]
        count_result = await db.execute(
            select(User.department_id, func.count(User.id))
            .where(User.department_id.in_(dept_ids))
            .group_by(User.department_id)
        )
        user_counts = {row[0]: row[1] for row in count_result}

    def build_node(dept: Department) -> dict:
        children = [build_node(d) for d in all_depts if d.parent_id == dept.id]
        return {
            "id": dept.id,
            "name": dept.name,
            "parent_id": dept.parent_id,
            "path": dept.path,
            "sort_order": dept.sort_order,
            "user_count": user_counts.get(dept.id, 0),
            "children": sorted(children, key=lambda c: c["sort_order"]),
            "created_at": dept.created_at.isoformat() if dept.created_at else "",
            "updated_at": dept.updated_at.isoformat() if dept.updated_at else "",
        }

    roots = [build_node(d) for d in all_depts if not d.parent_id]
    return sorted(roots, key=lambda r: r["sort_order"])


async def get_department(db: AsyncSession, dept_id: str) -> Optional[Department]:
    result = await db.execute(
        select(Department).where(Department.id == dept_id)
    )
    return result.scalar_one_or_none()


async def get_descendant_ids(db: AsyncSession, dept_id: str) -> list[str]:
    """Return the department id plus all descendant department ids (any depth).

    Loads the full department table once and walks the parent_id adjacency in
    memory — avoids recursive per-node queries.
    """
    result = await db.execute(select(Department.id, Department.parent_id))
    rows = result.all()
    children_map: dict[str, list[str]] = {}
    for did, pid in rows:
        if pid:
            children_map.setdefault(pid, []).append(did)

    collected: list[str] = []
    stack = [dept_id]
    seen: set[str] = set()
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        collected.append(cur)
        stack.extend(children_map.get(cur, []))
    return collected


async def create_department(
    db: AsyncSession,
    name: str,
    parent_id: Optional[str] = None,
    sort_order: int = 0,
    ldap_dn: Optional[str] = None,
) -> Department:
    # Sanitize: empty string should be treated as None (root department)
    parent_id = parent_id or None

    # Build path
    path = f"/{name}"
    if parent_id:
        parent = await get_department(db, parent_id)
        if not parent:
            raise AppException(404, "父部门不存在", 404)
        path = f"{parent.path}/{name}"

    dept = Department(name=name, parent_id=parent_id, path=path, sort_order=sort_order, ldap_dn=ldap_dn)
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return dept


async def update_department(
    db: AsyncSession,
    dept: Department,
    name: Optional[str] = None,
    parent_id: Optional[str] = None,
    sort_order: Optional[int] = None,
    ldap_dn: Optional[str] = None,
) -> Department:
    # Sanitize: empty string should be treated as None (root department)
    parent_id = parent_id or None

    if name is not None:
        dept.name = name
        # Rebuild path
        path = f"/{name}"
        if parent_id or dept.parent_id:
            pid = parent_id if parent_id is not None else dept.parent_id
            if pid:
                parent = await get_department(db, pid)
                if parent:
                    path = f"{parent.path}/{name}"
        dept.path = path

    if parent_id is not None:
        if parent_id == dept.id:
            raise AppException(400, "不能将部门设为自身的子部门")
        dept.parent_id = parent_id
        # Rebuild path
        path = f"/{name or dept.name}"
        if parent_id:
            parent = await get_department(db, parent_id)
            if parent:
                path = f"{parent.path}/{name or dept.name}"
        dept.path = path

    if sort_order is not None:
        dept.sort_order = sort_order

    if ldap_dn is not None:
        dept.ldap_dn = ldap_dn

    await db.commit()
    await db.refresh(dept)

    # Rebuild children paths recursively
    await _rebuild_children_paths(db, dept)
    return dept


async def _rebuild_children_paths(db: AsyncSession, parent: Department):
    """Recursively update children paths when parent path changes."""
    result = await db.execute(
        select(Department).where(Department.parent_id == parent.id)
    )
    children = result.scalars().all()
    for child in children:
        child.path = f"{parent.path}/{child.name}"
        await db.commit()
        await db.refresh(child)
        await _rebuild_children_paths(db, child)


async def delete_department(db: AsyncSession, dept: Department):
    # Check for children
    result = await db.execute(
        select(func.count(Department.id)).where(Department.parent_id == dept.id)
    )
    child_count = result.scalar() or 0
    if child_count > 0:
        raise AppException(400, f"该部门下有 {child_count} 个子部门，请先删除子部门")

    # Check for users
    result = await db.execute(
        select(func.count(User.id)).where(User.department_id == dept.id)
    )
    user_count = result.scalar() or 0
    if user_count > 0:
        raise AppException(400, f"该部门下有 {user_count} 名成员，请先转移成员")

    await db.delete(dept)
    await db.commit()
