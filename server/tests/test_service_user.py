"""
User service tests: create_user, get_user, list_users, update_user
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import user as user_service
from app.models.user import User
from app.models.department import Department
from app.exceptions import AppException


class TestUserService:
    async def test_create_user(self, db_session: AsyncSession):
        user = await user_service.create_user(
            db_session,
            username="newuser",
            display_name="New",
            password="password123",
            system_role="MEMBER",
        )
        assert user.id is not None
        assert user.username == "newuser"
        assert user.hashed_password != "password123"

    async def test_create_user_duplicate(self, db_session: AsyncSession):
        await user_service.create_user(
            db_session,
            username="dup",
            display_name="D",
            password="pw123456",
        )
        with pytest.raises(AppException) as exc:
            await user_service.create_user(
                db_session,
                username="dup",
                display_name="D2",
                password="pw654321",
            )
        assert exc.value.message == "用户名已存在"

    async def test_get_user(self, db_session: AsyncSession):
        user = await user_service.create_user(
            db_session,
            username="getme",
            display_name="GetMe",
            password="password123",
        )
        found = await user_service.get_user(db_session, user.id)
        assert found is not None
        assert found.username == "getme"

    async def test_get_user_not_found(self, db_session: AsyncSession):
        found = await user_service.get_user(db_session, "nonexistent-id")
        assert found is None

    async def test_list_users(self, db_session: AsyncSession):
        await user_service.create_user(
            db_session, username="u1", display_name="U1", password="pw123456"
        )
        await user_service.create_user(
            db_session, username="u2", display_name="U2", password="pw123456"
        )
        users, total = await user_service.list_users(db_session)
        assert total == 2
        assert len(users) == 2

    async def test_list_users_with_keyword(self, db_session: AsyncSession):
        await user_service.create_user(
            db_session, username="alpha", display_name="Alpha", password="pw123456"
        )
        await user_service.create_user(
            db_session, username="beta", display_name="Beta", password="pw123456"
        )
        users, total = await user_service.list_users(db_session, keyword="alp")
        assert total == 1
        assert users[0].username == "alpha"

    async def test_list_users_with_status(self, db_session: AsyncSession):
        await user_service.create_user(
            db_session, username="active1", display_name="A", password="pw123456"
        )
        users, total = await user_service.list_users(db_session, status="ACTIVE")
        assert total >= 1
        for u in users:
            assert u.status == "ACTIVE"

    async def test_list_users_with_department(self, db_session: AsyncSession):
        dept = Department(name="HR")
        db_session.add(dept)
        await db_session.flush()

        await user_service.create_user(
            db_session,
            username="hruser",
            display_name="HR",
            password="pw123456",
            department_id=dept.id,
        )
        users, total = await user_service.list_users(db_session, department_id=dept.id)
        assert total == 1
        assert users[0].username == "hruser"

    async def test_update_user(self, db_session: AsyncSession):
        user = await user_service.create_user(
            db_session, username="updateme", display_name="OldName", password="pw123456"
        )
        updated = await user_service.update_user(
            db_session, user, display_name="NewName", email="new@test.com"
        )
        assert updated.display_name == "NewName"
        assert updated.email == "new@test.com"

    async def test_get_user_with_department(self, db_session: AsyncSession):
        dept = Department(name="Engineering")
        db_session.add(dept)
        await db_session.flush()

        user = await user_service.create_user(
            db_session,
            username="enguser",
            display_name="Eng",
            password="pw123456",
            department_id=dept.id,
        )
        data = await user_service.get_user_with_department(db_session, user)
        assert data["department_name"] == "Engineering"
        assert data["username"] == "enguser"
