"""
Search API tests: full-text search across tasks and documents
"""
import pytest
from httpx import AsyncClient


@pytest.fixture
async def workspace_id(workspace: dict):
    return workspace["workspace"].id


class TestSearch:
    async def test_search_empty(self, client: AsyncClient):
        resp = await client.get("/api/search", params={"q": "nothingwillmatchthisxyz"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert "tasks" in body["data"]
        assert "documents" in body["data"]

    async def test_search_tasks(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        # Create a task with unique keyword
        await client.post(
            f"/api/workspaces/{workspace_id}/tasks",
            headers=auth_headers,
            json={"title": "搜索测试任务-特殊关键字789"},
        )

        resp = await client.get("/api/search", params={"q": "特殊关键字789"})
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]["tasks"]) >= 1

    async def test_search_by_type_task(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get("/api/search", params={"q": "测试", "type": "task"})
        assert resp.status_code == 200
        body = resp.json()
        assert "documents" not in body["data"] or len(body["data"]["documents"]) == 0

    async def test_search_with_workspace(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get("/api/search", params={"q": "搜索测试", "workspace_id": workspace_id})
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0

    async def test_search_requires_query(self, client: AsyncClient):
        resp = await client.get("/api/search")
        assert resp.status_code in (400, 422)
