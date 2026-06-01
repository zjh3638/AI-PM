from __future__ import annotations

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.security import decode_access_token
from app.exceptions import AppException


async def get_current_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization.startswith("Bearer "):
        raise AppException(401, "Invalid authorization header", 401)
    token = authorization[7:]
    user_id = decode_access_token(token)
    if user_id is None:
        raise AppException(401, "Invalid or expired token", 401)
    result = await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.department))
    )
    user = result.scalar_one_or_none()
    if user is None or user.status != "ACTIVE":
        raise AppException(401, "User not found or disabled", 401)
    return user
