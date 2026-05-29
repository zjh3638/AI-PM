"""
Workspaces API tests: CRUD, archive, members management
"""
import pytest
from httpx import AsyncClient


class TestWorkspaces:
    async def test_create_workspace(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/workspaces", headers=auth_headers, json={
            "name": "新项目",
            "key": "NEW-PROJ",
            "description": "一个测试项目",
            "type": "PROJECT",
            "visibility": "PRIVATE",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["name"] == "新项目"
        assert body["data"]["key"] == "NEW-PROJ"
        assert body["data"]["member_count"] == 1

    async def test_create_workspace_duplicate_key(self, client: AsyncClient, auth_headers: dict, workspace: dict):
        resp = await client.post("/api/workspaces", headers=auth_headers, json={
            "name": "重复",
            "key": "TEST-PROJ",
        })
        assert resp.status_code == 400

    async def test_list_workspaces(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/workspaces", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["total"] >= 0
        assert isinstance(body["data"], list)

    async def test_get_workspace(self, client: AsyncClient, auth_headers: dict, workspace: dict):
        ws_id = workspace["workspace"].id
        resp = await client.get(f"/api/workspaces/{ws_id}", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["name"] == "测试项目"

    async def test_get_workspace_not_found(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/workspaces/nonexistent", headers=auth_headers)
        assert resp.status_code == 404

    async def test_update_workspace(self, client: AsyncClient, auth_headers: dict, workspace: dict):
        ws_id = workspace["workspace"].id
        resp = await client.patch(f"/api/workspaces/{ws_id}", headers=auth_headers, json={
            "name": "改名后的项目",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["name"] == "改名后的项目"

    async def test_archive_workspace(self, client: AsyncClient, auth_headers: dict, workspace: dict):
        ws_id = workspace["workspace"].id
        resp = await client.post(f"/api/workspaces/{ws_id}/archive", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0


class TestWorkspaceMembers:
    @pytest.fixture
    async def workspace_id(self, workspace: dict):
        return workspace["workspace"].id

    async def test_list_members(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get(f"/api/workspaces/{workspace_id}/members", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert len(body["data"]) >= 1

    async def test_add_member(self, client: AsyncClient, auth_headers: dict, workspace_id: str, member_user: dict):
        resp = await client.post(
            f"/api/workspaces/{workspace_id}/members",
            headers=auth_headers,
            json={"user_id": member_user["user"].id, "role": "MEMBER"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["role"] == "MEMBER"
        assert body["data"]["user_id"] == member_user["user"].id

    async def test_add_duplicate_member(self, client: AsyncClient, auth_headers: dict, workspace_id: str, member_user: dict):
        # First add
        await client.post(
            f"/api/workspaces/{workspace_id}/members",
            headers=auth_headers,
            json={"user_id": member_user["user"].id, "role": "MEMBER"},
        )
        # Duplicate
        resp = await client.post(
            f"/api/workspaces/{workspace_id}/members",
            headers=auth_headers,
            json={"user_id": member_user["user"].id, "role": "MEMBER"},
        )
        assert resp.status_code == 400

    async def test_update_member_role(self, client: AsyncClient, auth_headers: dict, workspace_id: str, member_user: dict):
        # Add first, then update
        add_resp = await client.post(
            f"/api/workspaces/{workspace_id}/members",
            headers=auth_headers,
            json={"user_id": member_user["user"].id, "role": "MEMBER"},
        )
        member_id = add_resp.json()["data"]["id"]

        resp = await client.patch(
            f"/api/workspaces/{workspace_id}/members/{member_id}",
            headers=auth_headers,
            json={"role": "MANAGER"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["role"] == "MANAGER"

    async def test_remove_member(self, client: AsyncClient, auth_headers: dict, workspace_id: str, member_user: dict):
        add_resp = await client.post(
            f"/api/workspaces/{workspace_id}/members",
            headers=auth_headers,
            json={"user_id": member_user["user"].id, "role": "MEMBER"},
        )
        member_id = add_resp.json()["data"]["id"]

        resp = await client.delete(
            f"/api/workspaces/{workspace_id}/members/{member_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_cannot_remove_owner(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        # Get members to find the OWNER's member id
        list_resp = await client.get(f"/api/workspaces/{workspace_id}/members", headers=auth_headers)
        members = list_resp.json()["data"]
        owner_member = next(m for m in members if m["role"] == "OWNER")

        resp = await client.delete(
            f"/api/workspaces/{workspace_id}/members/{owner_member['id']}",
            headers=auth_headers,
        )
        assert resp.status_code == 400
