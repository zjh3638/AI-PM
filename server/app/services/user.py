from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.department import Department
from app.security import hash_password
from app.exceptions import AppException


async def create_user(db: AsyncSession, **kwargs) -> User:
    # Sanitize: empty string should be treated as None for optional string fields
    for field in ("department_id", "ldap_dn"):
        if kwargs.get(field) == "":
            kwargs[field] = None
    result = await db.execute(select(User).where(User.username == kwargs["username"]))
    if result.scalar_one_or_none():
        raise AppException(400, "用户名已存在")
    kwargs["hashed_password"] = hash_password(kwargs.pop("password"))
    user = User(**kwargs)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_user(db: AsyncSession, user_id: str) -> Optional[User]:
    return await db.get(User, user_id)


async def list_users(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    keyword: Optional[str] = None,
    status: Optional[str] = None,
    department_id: Optional[str] = None,
) -> tuple[list[User], int]:
    query = select(User)
    count_query = select(func.count(User.id))

    if keyword:
        like = f"%{keyword}%"
        query = query.where(
            User.username.ilike(like) | User.display_name.ilike(like)
        )
        count_query = count_query.where(
            User.username.ilike(like) | User.display_name.ilike(like)
        )
    if status:
        query = query.where(User.status == status)
        count_query = count_query.where(User.status == status)
    if department_id:
        query = query.where(User.department_id == department_id)
        count_query = count_query.where(User.department_id == department_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    query = query.offset((page - 1) * page_size).limit(page_size).order_by(User.created_at.desc())
    result = await db.execute(query)
    users = result.scalars().all()
    return list(users), total


async def update_user(db: AsyncSession, user: User, **kwargs) -> User:
    # Sanitize: empty string should be treated as None for optional foreign key fields
    if kwargs.get("department_id") == "":
        kwargs["department_id"] = None
    for field, value in kwargs.items():
        if value is not None:
            setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


async def get_user_with_department(db: AsyncSession, user: User) -> dict:
    data = {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "department_id": user.department_id,
        "department_name": None,
        "system_role": user.system_role,
        "status": user.status,
        "source": user.source,
        "created_at": user.created_at.isoformat() if user.created_at else "",
        "updated_at": user.updated_at.isoformat() if user.updated_at else "",
    }
    if user.department_id:
        dept = await db.get(Department, user.department_id)
        if dept:
            data["department_name"] = dept.name
    return data
