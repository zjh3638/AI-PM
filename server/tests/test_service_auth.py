"""
Auth service tests: login_local, login_ldap
"""
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import auth as auth_service
from app.models.user import User
from app.security import hash_password
from app.config import settings
from app.exceptions import AppException
from app.integrations.auth_provider import AuthResult


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

    async def test_login_local_rejects_ldap_source_user(self, db_session: AsyncSession):
        """source=LDAP 的用户不能通过 login_local 登录。"""
        user = User(
            username="ldapuser",
            display_name="LDAP User",
            hashed_password=hash_password("somepass"),
            source="LDAP",
            status="ACTIVE",
        )
        db_session.add(user)
        await db_session.commit()

        with pytest.raises(AppException) as exc:
            await auth_service.login_local(db_session, "ldapuser", "somepass")
        assert exc.value.message == "用户名或密码错误"

    async def test_login_ldap_success_new_user(self, db_session: AsyncSession):
        """LDAP 认证成功 + 首次登录自动创建用户。"""
        mock_result = AuthResult(
            username="newldap",
            display_name="New LDAP",
            email="newldap@co.com",
            source="LDAP",
        )

        with patch("app.services.auth.get_ldap_config", return_value={"ldap_enabled": True, "ldap_auto_create_user": True}), \
             patch(
                 "app.integrations.auth_provider.LdapAuthProvider.authenticate",
                 new_callable=AsyncMock,
             ) as mock_auth:
            mock_auth.return_value = mock_result

            user = await auth_service.login_ldap(db_session, "newldap", "ldappass")

        assert user is not None
        assert user.username == "newldap"
        assert user.display_name == "New LDAP"
        assert user.email == "newldap@co.com"
        assert user.source == "LDAP"
        assert user.hashed_password == ""  # LDAP 用户无本地密码

    async def test_login_ldap_sync_attributes(self, db_session: AsyncSession):
        """已有 LDAP 用户再次登录时同步 display_name 和 email。"""
        # 先创建用户
        mock_result1 = AuthResult(
            username="syncuser",
            display_name="Old Name",
            email="old@co.com",
            source="LDAP",
        )
        with patch("app.services.auth.get_ldap_config", return_value={"ldap_enabled": True, "ldap_auto_create_user": True}), \
             patch(
                 "app.integrations.auth_provider.LdapAuthProvider.authenticate",
                 new_callable=AsyncMock,
             ) as mock_auth:
            mock_auth.return_value = mock_result1
            user1 = await auth_service.login_ldap(db_session, "syncuser", "pass")

        assert user1.display_name == "Old Name"

        # 再次登录，LDAP 返回新的属性
        mock_result2 = AuthResult(
            username="syncuser",
            display_name="New Name",
            email="new@co.com",
            source="LDAP",
        )
        with patch("app.services.auth.get_ldap_config", return_value={"ldap_enabled": True, "ldap_auto_create_user": True}), \
             patch(
                 "app.integrations.auth_provider.LdapAuthProvider.authenticate",
                 new_callable=AsyncMock,
             ) as mock_auth:
            mock_auth.return_value = mock_result2
            user2 = await auth_service.login_ldap(db_session, "syncuser", "pass")

        assert user2.display_name == "New Name"
        assert user2.email == "new@co.com"

    async def test_login_ldap_invalid_credentials(self, db_session: AsyncSession):
        """LDAP 认证失败返回错误。"""
        with patch("app.services.auth.get_ldap_config", return_value={"ldap_enabled": True, "ldap_auto_create_user": True}), \
             patch(
                 "app.integrations.auth_provider.LdapAuthProvider.authenticate",
                 new_callable=AsyncMock,
             ) as mock_auth:
            mock_auth.return_value = None

            with pytest.raises(AppException) as exc:
                await auth_service.login_ldap(db_session, "baduser", "badpass")
            assert exc.value.message == "LDAP 用户名或密码错误"

    async def test_login_ldap_disabled_user(self, db_session: AsyncSession):
        """已被禁用的 LDAP 用户不能登录。"""
        user = User(
            username="disabledldap",
            display_name="Disabled LDAP",
            hashed_password="",
            source="LDAP",
            status="DISABLED",
        )
        db_session.add(user)
        await db_session.commit()

        mock_result = AuthResult(
            username="disabledldap",
            display_name="Disabled LDAP",
            source="LDAP",
        )
        with patch("app.services.auth.get_ldap_config", return_value={"ldap_enabled": True, "ldap_auto_create_user": True}), \
             patch(
                 "app.integrations.auth_provider.LdapAuthProvider.authenticate",
                 new_callable=AsyncMock,
             ) as mock_auth:
            mock_auth.return_value = mock_result

            with pytest.raises(AppException) as exc:
                await auth_service.login_ldap(db_session, "disabledldap", "pass")
            assert exc.value.message == "账户已被禁用"
