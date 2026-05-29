"""
Workspace service tests: CRUD, members
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import workspace as ws_service
from app.services import user as user_service
from app.models.workspace import Workspace
from app.models.workspace_member import WorkspaceMember
from app.exceptions import AppException


class TestWorkspaceService:
    @pytest.fixture
    async def creator(self, db_session: AsyncSession):
        return await user_service.create_user(
            db_session, username="wscreator", display_name="Creator", password="pw123456",
            system_role="SUPER_ADMIN",
        )

    @pytest.fixture
    async def workspace(self, db_session: AsyncSession, creator):
        return await ws_service.create_workspace(
            db_session, creator, name="TestWS", key="TEST-WS", description="Desc",
        )

    async def test_create_workspace(self, db_session: AsyncSession, creator):
        ws = await ws_service.create_workspace(
            db_session, creator, name="MyProject", key="MY-PROJ",
        )
        assert ws.id is not None
        assert ws.name == "MyProject"
        assert ws.key == "MY-PROJ"

    async def test_create_workspace_creates_owner_member(self, db_session: AsyncSession, creator):
        ws = await ws_service.create_workspace(
            db_session, creator, name="Proj2", key="PROJ2",
        )
        members = await ws_service.get_members(db_session, ws.id)
        assert len(members) == 1
        assert members[0]["role"] == "OWNER"
        assert members[0]["user_id"] == creator.id

    async def test_create_workspace_duplicate_key(self, db_session: AsyncSession, creator):
        await ws_service.create_workspace(db_session, creator, name="A", key="DUP-KEY")
        with pytest.raises(AppException) as exc:
            await ws_service.create_workspace(db_session, creator, name="B", key="DUP-KEY")
        assert exc.value.message == "工作空间标识已存在"

    async def test_get_workspace(self, db_session: AsyncSession, workspace):
        found = await ws_service.get_workspace(db_session, workspace.id)
        assert found is not None
        assert found.name == "TestWS"

    async def test_get_workspace_not_found(self, db_session: AsyncSession):
        found = await ws_service.get_workspace(db_session, "nonexistent")
        assert found is None

    async def test_list_workspaces(self, db_session: AsyncSession, creator, workspace):
        data, total = await ws_service.list_workspaces(db_session, creator)
        assert total >= 1
        assert data[0]["member_count"] == 1
        assert data[0]["name"] == "TestWS"

    async def test_list_workspaces_with_keyword(self, db_session: AsyncSession, creator, workspace):
        data, total = await ws_service.list_workspaces(db_session, creator, keyword="TestWS")
        assert total == 1

    async def test_list_workspaces_with_status(self, db_session: AsyncSession, creator, workspace):
        data, total = await ws_service.list_workspaces(db_session, creator, status="ACTIVE")
        assert total >= 1

    async def test_update_workspace(self, db_session: AsyncSession, workspace):
        updated = await ws_service.update_workspace(
            db_session, workspace, name="Renamed", description="New Desc",
        )
        assert updated.name == "Renamed"
        assert updated.description == "New Desc"


class TestWorkspaceMemberService:
    @pytest.fixture
    async def creator(self, db_session: AsyncSession):
        return await user_service.create_user(
            db_session, username="memcreator", display_name="MC", password="pw123456",
            system_role="SUPER_ADMIN",
        )

    @pytest.fixture
    async def workspace(self, db_session: AsyncSession, creator):
        return await ws_service.create_workspace(
            db_session, creator, name="MemTestWS", key="MEM-TEST",
        )

    @pytest.fixture
    async def member_user(self, db_session: AsyncSession):
        return await user_service.create_user(
            db_session, username="membertest", display_name="MT", password="pw123456",
        )

    async def test_add_member(self, db_session: AsyncSession, workspace, member_user):
        member = await ws_service.add_member(
            db_session, workspace.id, member_user.id, "MEMBER",
        )
        assert member.role == "MEMBER"
        assert member.user_id == member_user.id

    async def test_add_duplicate_member(self, db_session: AsyncSession, workspace, member_user):
        await ws_service.add_member(db_session, workspace.id, member_user.id, "MEMBER")
        with pytest.raises(AppException) as exc:
            await ws_service.add_member(db_session, workspace.id, member_user.id, "MEMBER")
        assert exc.value.message == "该用户已是工作空间成员"

    async def test_add_member_user_not_found(self, db_session: AsyncSession, workspace):
        with pytest.raises(AppException) as exc:
            await ws_service.add_member(db_session, workspace.id, "fake-user-id", "MEMBER")
        assert exc.value.message == "用户不存在"

    async def test_get_members(self, db_session: AsyncSession, workspace, member_user):
        await ws_service.add_member(db_session, workspace.id, member_user.id, "MEMBER")
        members = await ws_service.get_members(db_session, workspace.id)
        assert len(members) == 2  # OWNER + new MEMBER
        roles = [m["role"] for m in members]
        assert "OWNER" in roles
        assert "MEMBER" in roles

    async def test_get_member(self, db_session: AsyncSession, workspace, member_user):
        added = await ws_service.add_member(db_session, workspace.id, member_user.id, "MEMBER")
        found = await ws_service.get_member(db_session, workspace.id, added.id)
        assert found is not None
        assert found.role == "MEMBER"

    async def test_get_member_not_found(self, db_session: AsyncSession, workspace):
        found = await ws_service.get_member(db_session, workspace.id, "fake-member-id")
        assert found is None

    async def test_update_member_role(self, db_session: AsyncSession, workspace, member_user):
        added = await ws_service.add_member(db_session, workspace.id, member_user.id, "MEMBER")
        updated = await ws_service.update_member_role(db_session, added, "MANAGER")
        assert updated.role == "MANAGER"

    async def test_remove_member(self, db_session: AsyncSession, workspace, member_user):
        added = await ws_service.add_member(db_session, workspace.id, member_user.id, "MEMBER")
        await ws_service.remove_member(db_session, added)
        found = await ws_service.get_member(db_session, workspace.id, added.id)
        assert found is None
