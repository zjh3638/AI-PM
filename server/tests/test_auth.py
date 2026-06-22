"""
Auth API tests: login, me, refresh, logout
"""
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.integrations.auth_provider import AuthResult


class TestAuth:
    async def test_login_success(self, client: AsyncClient, super_admin: dict):
        resp = await client.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin123456",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert "access_token" in body["data"]
        assert body["data"]["token_type"] == "bearer"
        assert body["data"]["user"]["username"] == "admin"
        assert body["data"]["user"]["system_role"] == "SUPER_ADMIN"

    async def test_login_wrong_password(self, client: AsyncClient, super_admin: dict):
        resp = await client.post("/api/auth/login", json={
            "username": "admin",
            "password": "wrongpassword123",
        })
        assert resp.status_code == 400
        body = resp.json()
        assert body["code"] != 0

    async def test_login_disabled_user(self, client: AsyncClient, db_session, super_admin: dict):
        from app.models.user import User

        result = await db_session.execute(
            __import__("sqlalchemy").select(User).where(User.username == "member1")
        )
        user = result.scalar_one_or_none()
        if user:
            user.status = "DISABLED"
            await db_session.commit()

        # Create a fresh disabled user if member1 doesn't exist
        if not user:
            from app.security import hash_password
            u = User(
                username="disabled_user",
                display_name="Disabled",
                hashed_password=hash_password("disabled123"),
                status="DISABLED",
            )
            db_session.add(u)
            await db_session.commit()

        resp = await client.post("/api/auth/login", json={
            "username": "disabled_user",
            "password": "disabled123",
        })
        assert resp.status_code in (400, 403)

    async def test_get_me(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["username"] == "admin"

    async def test_get_me_without_token(self, client: AsyncClient):
        resp = await client.get("/api/auth/me")
        assert resp.status_code in (401, 422)

    async def test_refresh_token(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/auth/refresh", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert "access_token" in body["data"]

    async def test_logout(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/auth/logout", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0

    # ─── LDAP login tests ──────────────────────────────────────

    async def test_login_ldap_success(self, client: AsyncClient):
        """LDAP 登录成功：mock LdapAuthProvider 返回正常结果，自动创建用户。"""
        mock_result = AuthResult(
            username="zhangsan",
            display_name="张三",
            email="zhangsan@company.com",
            source="LDAP",
        )

        with patch("app.services.auth.settings.ldap_enabled", True), \
             patch(
                 "app.integrations.auth_provider.LdapAuthProvider.authenticate",
                 new_callable=AsyncMock,
             ) as mock_auth:
            mock_auth.return_value = mock_result

            resp = await client.post("/api/auth/login", json={
                "username": "zhangsan",
                "password": "ldappass123",
                "source": "LDAP",
            })

        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert "access_token" in body["data"]
        assert body["data"]["user"]["username"] == "zhangsan"
        assert body["data"]["user"]["display_name"] == "张三"

        # 第二次登录应该复用已创建的用户
        with patch("app.services.auth.settings.ldap_enabled", True), \
             patch(
                 "app.integrations.auth_provider.LdapAuthProvider.authenticate",
                 new_callable=AsyncMock,
             ) as mock_auth2:
            mock_auth2.return_value = mock_result
            resp2 = await client.post("/api/auth/login", json={
                "username": "zhangsan",
                "password": "ldappass123",
                "source": "LDAP",
            })
        assert resp2.status_code == 200

    async def test_login_ldap_invalid_credentials(self, client: AsyncClient):
        """LDAP 凭据错误。"""
        with patch("app.services.auth.settings.ldap_enabled", True), \
             patch(
                 "app.integrations.auth_provider.LdapAuthProvider.authenticate",
                 new_callable=AsyncMock,
             ) as mock_auth:
            mock_auth.return_value = None

            resp = await client.post("/api/auth/login", json={
                "username": "nobody",
                "password": "wrong",
                "source": "LDAP",
            })

        assert resp.status_code == 400
        body = resp.json()
        assert body["code"] != 0

    async def test_login_local_rejects_ldap_user(self, client: AsyncClient, db_session):
        """source=LDAP 的用户不能通过本地密码登录。"""
        from app.models.user import User

        ldap_user = User(
            username="ldapuser1",
            display_name="LDAP User",
            hashed_password="",  # LDAP 用户无密码
            source="LDAP",
            status="ACTIVE",
        )
        db_session.add(ldap_user)
        await db_session.commit()

        resp = await client.post("/api/auth/login", json={
            "username": "ldapuser1",
            "password": "anything",
            "source": "LOCAL",
        })

        assert resp.status_code == 400
        body = resp.json()
        assert body["code"] != 0
