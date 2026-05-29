"""
Auth API tests: login, me, refresh, logout
"""
import pytest
from httpx import AsyncClient


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
