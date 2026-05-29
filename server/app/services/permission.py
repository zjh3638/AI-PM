from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.workspace_member import WorkspaceMember
from app.exceptions import AppException


class PermissionChecker:
    """3-level RBAC: system role → workspace role → data scope"""

    def __init__(self, user: User, db: AsyncSession):
        self.user = user
        self.db = db

    async def require_system_role(self, *roles: str):
        if self.user.system_role not in roles:
            raise AppException(403, "无权访问此功能", 403)

    async def require_workspace_role(self, workspace_id: str, *roles: str):
        if self._is_super_admin():
            return
        result = await self.db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == self.user.id,
            )
        )
        member = result.scalar_one_or_none()
        if member is None:
            raise AppException(403, "不是该工作空间的成员", 403)
        if member.role not in roles:
            raise AppException(403, "无权执行此操作", 403)

    @property
    def data_scope(self) -> str:
        scope_map = {
            "SUPER_ADMIN": "ALL",
            "ADMIN": "DEPARTMENT",
            "MEMBER": "SELF",
            "EXTERNAL": "SELF",
        }
        return scope_map.get(self.user.system_role, "SELF")

    def _is_super_admin(self) -> bool:
        return self.user.system_role == "SUPER_ADMIN"


async def get_permission_checker(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PermissionChecker:
    return PermissionChecker(user, db)
