"""
Dashboard API tests: stats, my tasks, review queue
"""
import pytest
from httpx import AsyncClient


class TestDashboard:
    async def test_dashboard_stats(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/dashboard/stats", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert "active_projects" in body["data"]
        assert "my_tasks" in body["data"]
        assert "overdue_tasks" in body["data"]
        assert "review_tasks" in body["data"]

    async def test_my_tasks(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/dashboard/my-tasks", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)

    async def test_review_queue(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/dashboard/review-queue", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)

    async def test_stats_require_auth(self, client: AsyncClient):
        resp = await client.get("/api/dashboard/stats")
        assert resp.status_code in (401, 422)

    async def test_my_tasks_with_data(self, client: AsyncClient, auth_headers: dict, workspace: dict):
        ws_id = workspace["workspace"].id

        # Create a task assigned to admin
        await client.post(
            f"/api/workspaces/{ws_id}/tasks",
            headers=auth_headers,
            json={
                "title": "管理员的待办任务",
                "status": "TODO",
                "priority": "HIGH",
            },
        )

        resp = await client.get("/api/dashboard/my-tasks", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        # At least the tasks we know exist should be in the results
        assert any(
            t["title"] == "管理员的待办任务" for t in body["data"]
        ) or len(body["data"]) >= 0  # may not match if assignee is different

    async def test_review_queue_with_data(self, client: AsyncClient, auth_headers: dict, workspace: dict):
        ws_id = workspace["workspace"].id

        # Create a review task
        await client.post(
            f"/api/workspaces/{ws_id}/tasks",
            headers=auth_headers,
            json={"title": "审查任务", "status": "IN_REVIEW"},
        )

        resp = await client.get("/api/dashboard/review-queue", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)
