"""
Users API tests: CRUD, list, disable
"""
import pytest
from httpx import AsyncClient


class TestUsers:
    async def test_create_user(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/users", headers=auth_headers, json={
            "username": "newuser",
            "display_name": "新用户",
            "email": "newuser@test.com",
            "password": "password123456",
            "system_role": "MEMBER",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["username"] == "newuser"
        assert body["data"]["display_name"] == "新用户"
        assert "hashed_password" not in body["data"]

    async def test_create_user_duplicate(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/users", headers=auth_headers, json={
            "username": "admin",
            "display_name": "重复",
            "password": "password123456",
        })
        assert resp.status_code == 400

    async def test_list_users(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/users", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["total"] >= 1
        assert len(body["data"]) >= 1

    async def test_list_users_with_keyword(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/users", headers=auth_headers, params={"keyword": "admin"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 1
        found = any(u["username"] == "admin" for u in body["data"])
        assert found

    async def test_get_user(self, client: AsyncClient, auth_headers: dict, super_admin: dict):
        user_id = super_admin["user"].id
        resp = await client.get(f"/api/users/{user_id}", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["username"] == "admin"

    async def test_get_user_not_found(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/users/nonexistent-id", headers=auth_headers)
        assert resp.status_code == 404

    async def test_update_user(self, client: AsyncClient, auth_headers: dict, super_admin: dict):
        user_id = super_admin["user"].id
        resp = await client.patch(f"/api/users/{user_id}", headers=auth_headers, json={
            "display_name": "管理员改名",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["display_name"] == "管理员改名"

    async def test_disable_user(self, client: AsyncClient, auth_headers: dict, member_user: dict):
        resp = await client.delete(f"/api/users/{member_user['user'].id}", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0

    async def test_cannot_disable_self(self, client: AsyncClient, auth_headers: dict, super_admin: dict):
        resp = await client.delete(f"/api/users/{super_admin['user'].id}", headers=auth_headers)
        assert resp.status_code == 400

    async def test_member_cannot_create_user(self, client: AsyncClient, member_headers: dict):
        resp = await client.post("/api/users", headers=member_headers, json={
            "username": "by_member",
            "display_name": "test",
            "password": "password123456",
        })
        assert resp.status_code == 403
