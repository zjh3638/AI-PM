"""
Comments API tests: create, list, update, delete
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
        json={"title": "评论测试任务"},
    )
    assert resp.status_code == 200
    return resp.json()["data"]


class TestComments:
    async def test_create_comment(self, client: AsyncClient, auth_headers: dict, task: dict):
        resp = await client.post(
            f"/api/tasks/{task['id']}/comments",
            headers=auth_headers,
            json={"content": "这是一条评论", "mentions": []},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["content"] == "这是一条评论"
        assert body["data"]["task_id"] == task["id"]

    async def test_list_comments(self, client: AsyncClient, auth_headers: dict, task: dict):
        # Create a comment first
        await client.post(
            f"/api/tasks/{task['id']}/comments",
            headers=auth_headers,
            json={"content": "评论1"},
        )
        resp = await client.get(
            f"/api/tasks/{task['id']}/comments",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert len(body["data"]) >= 1

    async def test_update_comment(self, client: AsyncClient, auth_headers: dict, task: dict):
        create_resp = await client.post(
            f"/api/tasks/{task['id']}/comments",
            headers=auth_headers,
            json={"content": "原始内容"},
        )
        comment_id = create_resp.json()["data"]["id"]

        resp = await client.patch(
            f"/api/comments/{comment_id}",
            headers=auth_headers,
            json={"content": "修改后的内容"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["content"] == "修改后的内容"

    async def test_delete_comment(self, client: AsyncClient, auth_headers: dict, task: dict):
        create_resp = await client.post(
            f"/api/tasks/{task['id']}/comments",
            headers=auth_headers,
            json={"content": "待删除"},
        )
        comment_id = create_resp.json()["data"]["id"]

        resp = await client.delete(
            f"/api/comments/{comment_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200

    async def test_cannot_update_others_comment(self, client: AsyncClient, auth_headers: dict, member_headers: dict, task: dict):
        # Admin creates a comment
        create_resp = await client.post(
            f"/api/tasks/{task['id']}/comments",
            headers=auth_headers,
            json={"content": "管理员的评论"},
        )
        comment_id = create_resp.json()["data"]["id"]

        # Member tries to update it
        resp = await client.patch(
            f"/api/comments/{comment_id}",
            headers=member_headers,
            json={"content": "成员想修改"},
        )
        assert resp.status_code == 403
