"""
Iterations API tests: CRUD, start, close, burndown
"""
import pytest
from httpx import AsyncClient


@pytest.fixture
async def workspace_id(workspace: dict):
    return workspace["workspace"].id


@pytest.fixture
async def iteration(client: AsyncClient, auth_headers: dict, workspace_id: str):
    resp = await client.post(
        f"/api/workspaces/{workspace_id}/iterations",
        headers=auth_headers,
        json={
            "name": "Sprint 1",
            "goal": "完成核心功能开发",
            "start_date": "2026-06-01",
            "end_date": "2026-06-14",
            "capacity_points": 50,
        },
    )
    assert resp.status_code == 200
    return resp.json()["data"]


class TestIterations:
    async def test_create_iteration(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.post(
            f"/api/workspaces/{workspace_id}/iterations",
            headers=auth_headers,
            json={
                "name": "Sprint 1",
                "goal": "完成核心功能",
                "start_date": "2026-06-01",
                "end_date": "2026-06-14",
                "capacity_points": 40,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["name"] == "Sprint 1"
        assert body["data"]["status"] == "PLANNING"

    async def test_list_iterations(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/iterations",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)

    async def test_get_iteration(self, client: AsyncClient, auth_headers: dict, workspace_id: str, iteration: dict):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/iterations/{iteration['id']}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["name"] == "Sprint 1"

    async def test_update_iteration(self, client: AsyncClient, auth_headers: dict, workspace_id: str, iteration: dict):
        resp = await client.patch(
            f"/api/workspaces/{workspace_id}/iterations/{iteration['id']}",
            headers=auth_headers,
            json={"name": "Sprint 2", "capacity_points": 60},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["name"] == "Sprint 2"
        assert body["data"]["capacity_points"] == 60

    async def test_iteration_not_found(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/iterations/nonexistent",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_start_iteration(self, client: AsyncClient, auth_headers: dict, workspace_id: str, iteration: dict):
        resp = await client.post(
            f"/api/workspaces/{workspace_id}/iterations/{iteration['id']}/start",
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_cannot_start_non_planning(self, client: AsyncClient, auth_headers: dict, workspace_id: str, iteration: dict):
        # Start it first
        await client.post(
            f"/api/workspaces/{workspace_id}/iterations/{iteration['id']}/start",
            headers=auth_headers,
        )
        # Start again should fail
        resp = await client.post(
            f"/api/workspaces/{workspace_id}/iterations/{iteration['id']}/start",
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_close_iteration(self, client: AsyncClient, auth_headers: dict, workspace_id: str, iteration: dict):
        # Start then close
        await client.post(
            f"/api/workspaces/{workspace_id}/iterations/{iteration['id']}/start",
            headers=auth_headers,
        )
        resp = await client.post(
            f"/api/workspaces/{workspace_id}/iterations/{iteration['id']}/close",
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_cannot_close_non_active(self, client: AsyncClient, auth_headers: dict, workspace_id: str, iteration: dict):
        resp = await client.post(
            f"/api/workspaces/{workspace_id}/iterations/{iteration['id']}/close",
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_burndown_data(self, client: AsyncClient, auth_headers: dict, workspace_id: str, iteration: dict):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/iterations/{iteration['id']}/burndown",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
