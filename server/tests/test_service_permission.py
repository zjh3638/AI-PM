"""
Permission service tests: PermissionChecker
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.permission import PermissionChecker
from app.services import user as user_service
from app.services import workspace as ws_service
from app.models.workspace import Workspace
from app.exceptions import AppException


class TestPermissionChecker:
    @pytest.fixture
    async def super_admin(self, db_session: AsyncSession):
        return await user_service.create_user(
            db_session, username="permadmin", display_name="Admin", password="pw123456",
            system_role="SUPER_ADMIN",
        )

    @pytest.fixture
    async def regular_member(self, db_session: AsyncSession):
        return await user_service.create_user(
            db_session, username="permmember", display_name="Member", password="pw123456",
            system_role="MEMBER",
        )

    @pytest.fixture
    async def workspace(self, db_session: AsyncSession, super_admin):
        return await ws_service.create_workspace(
            db_session, super_admin, name="PermWS", key="PERM-WS",
        )

    async def test_require_system_role_pass(self, db_session: AsyncSession, super_admin):
        pc = PermissionChecker(super_admin, db_session)
        await pc.require_system_role("SUPER_ADMIN")

    async def test_require_system_role_denied(self, db_session: AsyncSession, regular_member):
        pc = PermissionChecker(regular_member, db_session)
        with pytest.raises(AppException) as exc:
            await pc.require_system_role("SUPER_ADMIN", "ADMIN")
        assert exc.value.message == "无权访问此功能"

    async def test_require_workspace_role_as_member(self, db_session: AsyncSession, regular_member, workspace):
        await ws_service.add_member(db_session, workspace.id, regular_member.id, "MEMBER")
        pc = PermissionChecker(regular_member, db_session)
        await pc.require_workspace_role(workspace.id, "MEMBER", "MANAGER", "OWNER")

    async def test_require_workspace_role_denied(self, db_session: AsyncSession, regular_member, workspace):
        await ws_service.add_member(db_session, workspace.id, regular_member.id, "MEMBER")
        pc = PermissionChecker(regular_member, db_session)
        with pytest.raises(AppException) as exc:
            await pc.require_workspace_role(workspace.id, "OWNER")
        assert exc.value.message == "无权执行此操作"

    async def test_require_workspace_role_not_member(self, db_session: AsyncSession, regular_member, workspace):
        pc = PermissionChecker(regular_member, db_session)
        with pytest.raises(AppException) as exc:
            await pc.require_workspace_role(workspace.id, "MEMBER")
        assert exc.value.message == "不是该工作空间的成员"

    async def test_super_admin_bypasses_workspace_check(self, db_session: AsyncSession, super_admin, workspace):
        pc = PermissionChecker(super_admin, db_session)
        await pc.require_workspace_role(workspace.id, "OWNER")

    async def test_data_scope(self, db_session: AsyncSession, super_admin, regular_member):
        pc_admin = PermissionChecker(super_admin, db_session)
        assert pc_admin.data_scope == "ALL"

        pc_member = PermissionChecker(regular_member, db_session)
        assert pc_member.data_scope == "SELF"
