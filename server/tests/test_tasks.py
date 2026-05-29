"""
Tasks API tests: CRUD, list, kanban, epics, move, children
"""
import pytest
from httpx import AsyncClient


@pytest.fixture
async def workspace_id(workspace: dict):
    return workspace["workspace"].id


@pytest.fixture
async def task(client: AsyncClient, auth_headers: dict, workspace_id: str):
    resp = await client.post(
        f"/api/workspaces/{workspace_id}/tasks",
        headers=auth_headers,
        json={
            "title": "测试任务",
            "description": "任务描述",
            "task_type": "TASK",
            "priority": "HIGH",
            "status": "TODO",
        },
    )
    assert resp.status_code == 200
    return resp.json()["data"]


class TestTasks:
    async def test_create_task(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.post(
            f"/api/workspaces/{workspace_id}/tasks",
            headers=auth_headers,
            json={
                "title": "新任务",
                "description": "详细描述",
                "task_type": "TASK",
                "priority": "HIGH",
                "status": "TODO",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["title"] == "新任务"
        assert body["data"]["status"] == "TODO"
        assert body["data"]["priority"] == "HIGH"

    async def test_create_epic_task(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.post(
            f"/api/workspaces/{workspace_id}/tasks",
            headers=auth_headers,
            json={
                "title": "史诗任务",
                "task_type": "EPIC",
                "status": "TODO",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["task_type"] == "EPIC"

    async def test_list_tasks(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/tasks",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert "total" in body
        assert "data" in body

    async def test_list_tasks_with_filters(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/tasks",
            headers=auth_headers,
            params={"status": "TODO", "priority": "HIGH"},
        )
        assert resp.status_code == 200
        body = resp.json()
        for task in body["data"]:
            if task["task_type"] == "TASK":
                assert task["status"] == "TODO"
                assert task["priority"] == "HIGH"

    async def test_get_task(self, client: AsyncClient, auth_headers: dict, workspace_id: str, task: dict):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/tasks/{task['id']}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["id"] == task["id"]

    async def test_get_task_not_found(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/tasks/nonexistent",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_update_task(self, client: AsyncClient, auth_headers: dict, workspace_id: str, task: dict):
        resp = await client.patch(
            f"/api/workspaces/{workspace_id}/tasks/{task['id']}",
            headers=auth_headers,
            json={"title": "更新标题", "status": "IN_PROGRESS"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["title"] == "更新标题"
        assert body["data"]["status"] == "IN_PROGRESS"

    async def test_delete_task(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        # Create and immediately delete
        create_resp = await client.post(
            f"/api/workspaces/{workspace_id}/tasks",
            headers=auth_headers,
            json={"title": "待删除"},
        )
        task_id = create_resp.json()["data"]["id"]

        resp = await client.delete(
            f"/api/workspaces/{workspace_id}/tasks/{task_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_task_children(self, client: AsyncClient, auth_headers: dict, workspace_id: str, task: dict):
        # Create child task under parent
        await client.post(
            f"/api/workspaces/{workspace_id}/tasks",
            headers=auth_headers,
            json={"title": "子任务", "parent_id": task["id"]},
        )
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/tasks/{task['id']}/children",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) >= 1

    async def test_move_task(self, client: AsyncClient, auth_headers: dict, workspace_id: str, task: dict):
        resp = await client.patch(
            f"/api/workspaces/{workspace_id}/tasks/{task['id']}/move",
            headers=auth_headers,
            json={"new_status": "IN_PROGRESS", "sort_order": 1},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["status"] == "IN_PROGRESS"
        assert body["data"]["sort_order"] == 1

    async def test_get_kanban(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/kanban",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        for col in ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]:
            assert col in body["data"]

    async def test_get_epics(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/epics",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)
