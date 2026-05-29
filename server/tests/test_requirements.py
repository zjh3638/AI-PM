"""
Requirements API tests: submit, list, triage (accept/reject/convert)
"""
import pytest
from httpx import AsyncClient


@pytest.fixture
async def workspace_id(workspace: dict):
    return workspace["workspace"].id


class TestRequirements:
    async def test_submit_requirement(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.post(
            f"/api/workspaces/{workspace_id}/requirements",
            headers=auth_headers,
            json={"title": "用户需求-登录优化", "description": "改进登录体验", "source": "MANUAL"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["title"] == "用户需求-登录优化"
        assert body["data"]["status"] == "TRIAGE"

    async def test_list_requirements(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/requirements",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)

    async def test_triage_accept(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        # Submit first
        submit_resp = await client.post(
            f"/api/workspaces/{workspace_id}/requirements",
            headers=auth_headers,
            json={"title": "值得采纳的需求"},
        )
        req_id = submit_resp.json()["data"]["id"]

        resp = await client.patch(
            f"/api/workspaces/{workspace_id}/requirements/{req_id}/triage",
            headers=auth_headers,
            json={"status": "ACCEPTED", "triage_note": "计划下个迭代实现"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["status"] == "ACCEPTED"

    async def test_triage_reject(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        submit_resp = await client.post(
            f"/api/workspaces/{workspace_id}/requirements",
            headers=auth_headers,
            json={"title": "不合理的需求"},
        )
        req_id = submit_resp.json()["data"]["id"]

        resp = await client.patch(
            f"/api/workspaces/{workspace_id}/requirements/{req_id}/triage",
            headers=auth_headers,
            json={"status": "REJECTED", "triage_note": "技术不可行"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["status"] == "REJECTED"

    async def test_triage_convert_to_task(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        submit_resp = await client.post(
            f"/api/workspaces/{workspace_id}/requirements",
            headers=auth_headers,
            json={"title": "可转换的需求", "description": "转为任务实现"},
        )
        req_id = submit_resp.json()["data"]["id"]

        resp = await client.patch(
            f"/api/workspaces/{workspace_id}/requirements/{req_id}/triage",
            headers=auth_headers,
            json={"status": "CONVERTED", "target_type": "TASK"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["status"] == "CONVERTED"
        assert body["data"]["converted_task_id"] is not None

    async def test_triage_not_found(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.patch(
            f"/api/workspaces/{workspace_id}/requirements/nonexistent/triage",
            headers=auth_headers,
            json={"status": "ACCEPTED"},
        )
        assert resp.status_code == 404
