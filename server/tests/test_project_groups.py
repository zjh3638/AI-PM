"""Project groups API tests: CRUD, permissions, aggregations."""
import pytest
from httpx import AsyncClient


class TestProjectGroupCRUD:
    async def test_member_cannot_create(self, client: AsyncClient, member_headers: dict):
        resp = await client.post("/api/project-groups", headers=member_headers, json={
            "name": "群1", "description": "描述",
        })
        assert resp.status_code == 403

    async def test_admin_can_create(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/project-groups", headers=auth_headers, json={
            "name": "测试群", "description": "一个测试群",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["name"] == "测试群"
        assert body["data"]["workspace_count"] == 0

    async def test_list_groups(self, client: AsyncClient, auth_headers: dict):
        await client.post("/api/project-groups", headers=auth_headers, json={"name": "群A"})
        resp = await client.get("/api/project-groups", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["total"] >= 1

    async def test_get_group_not_found(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/project-groups/nonexistent", headers=auth_headers)
        assert resp.status_code == 404

    async def test_update_group(self, client: AsyncClient, auth_headers: dict):
        create = await client.post("/api/project-groups", headers=auth_headers, json={"name": "原名"})
        gid = create.json()["data"]["id"]
        resp = await client.patch(f"/api/project-groups/{gid}", headers=auth_headers, json={"name": "新名"})
        assert resp.status_code == 200
        assert resp.json()["data"]["name"] == "新名"

    async def test_member_cannot_update(self, client: AsyncClient, auth_headers: dict, member_headers: dict):
        create = await client.post("/api/project-groups", headers=auth_headers, json={"name": "群"})
        gid = create.json()["data"]["id"]
        resp = await client.patch(f"/api/project-groups/{gid}", headers=member_headers, json={"name": "篡改"})
        assert resp.status_code == 403

    async def test_delete_group(self, client: AsyncClient, auth_headers: dict):
        create = await client.post("/api/project-groups", headers=auth_headers, json={"name": "待删"})
        gid = create.json()["data"]["id"]
        resp = await client.delete(f"/api/project-groups/{gid}", headers=auth_headers)
        assert resp.status_code == 200
        # 再查应 404
        resp2 = await client.get(f"/api/project-groups/{gid}", headers=auth_headers)
        assert resp2.status_code == 404


class TestProjectGroupWorkspaces:
    @pytest.fixture
    async def group_id(self, client: AsyncClient, auth_headers: dict) -> str:
        resp = await client.post("/api/project-groups", headers=auth_headers, json={"name": "群"})
        return resp.json()["data"]["id"]

    async def test_add_workspace(
        self, client: AsyncClient, auth_headers: dict, group_id: str, workspace: dict
    ):
        ws_id = workspace["workspace"].id
        resp = await client.post(
            f"/api/project-groups/{group_id}/workspaces",
            headers=auth_headers, json={"workspace_id": ws_id},
        )
        assert resp.status_code == 200

        # 详情应包含该 workspace
        detail = await client.get(f"/api/project-groups/{group_id}", headers=auth_headers)
        ws_ids = [w["id"] for w in detail.json()["data"]["workspaces"]]
        assert ws_id in ws_ids
        assert detail.json()["data"]["workspace_count"] == 1

    async def test_add_duplicate_workspace(
        self, client: AsyncClient, auth_headers: dict, group_id: str, workspace: dict
    ):
        ws_id = workspace["workspace"].id
        await client.post(
            f"/api/project-groups/{group_id}/workspaces",
            headers=auth_headers, json={"workspace_id": ws_id},
        )
        resp = await client.post(
            f"/api/project-groups/{group_id}/workspaces",
            headers=auth_headers, json={"workspace_id": ws_id},
        )
        assert resp.status_code == 400

    async def test_remove_workspace(
        self, client: AsyncClient, auth_headers: dict, group_id: str, workspace: dict
    ):
        ws_id = workspace["workspace"].id
        await client.post(
            f"/api/project-groups/{group_id}/workspaces",
            headers=auth_headers, json={"workspace_id": ws_id},
        )
        resp = await client.delete(
            f"/api/project-groups/{group_id}/workspaces/{ws_id}", headers=auth_headers
        )
        assert resp.status_code == 200
        detail = await client.get(f"/api/project-groups/{group_id}", headers=auth_headers)
        assert detail.json()["data"]["workspace_count"] == 0

    async def test_add_nonexistent_workspace(
        self, client: AsyncClient, auth_headers: dict, group_id: str
    ):
        resp = await client.post(
            f"/api/project-groups/{group_id}/workspaces",
            headers=auth_headers, json={"workspace_id": "nonexistent"},
        )
        assert resp.status_code == 404


class TestProjectGroupAggregations:
    @pytest.fixture
    async def group_with_ws(self, client: AsyncClient, auth_headers: dict, workspace: dict) -> str:
        gid = (await client.post("/api/project-groups", headers=auth_headers, json={"name": "群"})).json()["data"]["id"]
        await client.post(
            f"/api/project-groups/{gid}/workspaces",
            headers=auth_headers, json={"workspace_id": workspace["workspace"].id},
        )
        return gid

    async def test_stats(self, client: AsyncClient, auth_headers: dict, group_with_ws: str):
        resp = await client.get(f"/api/project-groups/{group_with_ws}/stats", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["workspace_id"] is not None

    async def test_members(self, client: AsyncClient, auth_headers: dict, group_with_ws: str):
        resp = await client.get(f"/api/project-groups/{group_with_ws}/members", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        # workspace fixture 中有一个 OWNER 成员
        assert any(m["project_count"] >= 1 for m in data)

    async def test_tasks(self, client: AsyncClient, auth_headers: dict, group_with_ws: str):
        resp = await client.get(f"/api/project-groups/{group_with_ws}/tasks", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json()["data"], list)

    async def test_milestones(self, client: AsyncClient, auth_headers: dict, group_with_ws: str):
        resp = await client.get(f"/api/project-groups/{group_with_ws}/milestones", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json()["data"], list)

    async def test_activity(self, client: AsyncClient, auth_headers: dict, group_with_ws: str):
        resp = await client.get(f"/api/project-groups/{group_with_ws}/activity", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json()["data"], list)


class TestProjectGroupCascadeDelete:
    async def test_delete_group_keeps_workspace(
        self, client: AsyncClient, auth_headers: dict, workspace: dict
    ):
        ws_id = workspace["workspace"].id
        gid = (await client.post("/api/project-groups", headers=auth_headers, json={"name": "群"})).json()["data"]["id"]
        await client.post(
            f"/api/project-groups/{gid}/workspaces",
            headers=auth_headers, json={"workspace_id": ws_id},
        )
        # 删群
        await client.delete(f"/api/project-groups/{gid}", headers=auth_headers)
        # workspace 仍存在
        ws_resp = await client.get(f"/api/workspaces/{ws_id}", headers=auth_headers)
        assert ws_resp.status_code == 200
