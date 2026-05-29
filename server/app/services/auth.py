from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.security import verify_password
from app.exceptions import AppException


async def login_local(db: AsyncSession, username: str, password: str) -> User:
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(password, user.hashed_password):
        raise AppException(400, "用户名或密码错误")
    if user.status == "DISABLED":
        raise AppException(403, "账户已被禁用")
    return user
