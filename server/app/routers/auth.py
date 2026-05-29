from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.schemas.auth import LoginRequest, TokenResponse, UserInfo
from app.services import auth as auth_service
from app.security import create_access_token
from app.config import settings
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await auth_service.login_local(db, req.username, req.password)
    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        expires_in=settings.jwt_expiration,
        user=user_to_info(user),
    )


@router.get("/me", response_model=UserInfo)
async def me(user: User = Depends(get_current_user)):
    return user_to_info(user)


@router.post("/refresh")
async def refresh(user: User = Depends(get_current_user)):
    token = create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer", "expires_in": settings.jwt_expiration}


@router.post("/logout")
async def logout(user: User = Depends(get_current_user)):
    return {"code": 0, "message": "ok"}


def user_to_info(user: User) -> UserInfo:
    return UserInfo(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        email=user.email,
        avatar_url=user.avatar_url,
        department_name=None,
        system_role="MEMBER",
    )
