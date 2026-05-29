"""
Auth service tests: login_local
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import auth as auth_service
from app.models.user import User
from app.security import hash_password
from app.exceptions import AppException


class TestAuthService:
    async def test_login_local_success(self, db_session: AsyncSession):
        dept = __import__("app.models.department", fromlist=["Department"]).Department
        d = dept(name="TestDept")
        db_session.add(d)
        await db_session.flush()

        user = User(
            username="testuser",
            display_name="Test",
            hashed_password=hash_password("password123"),
            department_id=d.id,
            status="ACTIVE",
        )
        db_session.add(user)
        await db_session.commit()

        result = await auth_service.login_local(db_session, "testuser", "password123")
        assert result is not None
        assert result.username == "testuser"
        assert result.department is not None

    async def test_login_local_wrong_password(self, db_session: AsyncSession):
        user = User(
            username="user2",
            display_name="U2",
            hashed_password=hash_password("right"),
            status="ACTIVE",
        )
        db_session.add(user)
        await db_session.commit()

        with pytest.raises(AppException) as exc:
            await auth_service.login_local(db_session, "user2", "wrong")
        assert exc.value.message == "用户名或密码错误"

    async def test_login_local_user_not_found(self, db_session: AsyncSession):
        with pytest.raises(AppException) as exc:
            await auth_service.login_local(db_session, "nobody", "any")
        assert exc.value.message == "用户名或密码错误"

    async def test_login_local_disabled(self, db_session: AsyncSession):
        user = User(
            username="disabled",
            display_name="Disabled",
            hashed_password=hash_password("pw"),
            status="DISABLED",
        )
        db_session.add(user)
        await db_session.commit()

        with pytest.raises(AppException) as exc:
            await auth_service.login_local(db_session, "disabled", "pw")
        assert exc.value.message == "账户已被禁用"
