"""
Documents API tests: CRUD, list
"""
import pytest
from httpx import AsyncClient


@pytest.fixture
async def workspace_id(workspace: dict):
    return workspace["workspace"].id


class TestDocuments:
    async def test_create_doc(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.post(
            f"/api/workspaces/{workspace_id}/docs",
            headers=auth_headers,
            json={
                "title": "项目文档",
                "content": "# 文档内容",
                "doc_type": "MARKDOWN",
                "tags": ["api", "guide"],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["title"] == "项目文档"
        assert body["data"]["doc_type"] == "MARKDOWN"

    async def test_list_docs(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/docs",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)

    async def test_list_docs_with_keyword(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        # Create a doc first
        await client.post(
            f"/api/workspaces/{workspace_id}/docs",
            headers=auth_headers,
            json={"title": "搜索目标文档", "content": "独特内容123"},
        )

        resp = await client.get(
            f"/api/workspaces/{workspace_id}/docs",
            headers=auth_headers,
            params={"keyword": "独特内容"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 1

    async def test_get_doc(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        create_resp = await client.post(
            f"/api/workspaces/{workspace_id}/docs",
            headers=auth_headers,
            json={"title": "获取文档"},
        )
        doc_id = create_resp.json()["data"]["id"]

        resp = await client.get(
            f"/api/workspaces/{workspace_id}/docs/{doc_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["title"] == "获取文档"

    async def test_get_doc_not_found(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/docs/nonexistent",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_update_doc(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        create_resp = await client.post(
            f"/api/workspaces/{workspace_id}/docs",
            headers=auth_headers,
            json={"title": "待更新", "content": "v1"},
        )
        doc_id = create_resp.json()["data"]["id"]

        resp = await client.patch(
            f"/api/workspaces/{workspace_id}/docs/{doc_id}",
            headers=auth_headers,
            json={"title": "已更新", "content": "v2"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["title"] == "已更新"
        assert body["data"]["content"] == "v2"
        assert body["data"]["version"] >= 2

    async def test_delete_doc(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        create_resp = await client.post(
            f"/api/workspaces/{workspace_id}/docs",
            headers=auth_headers,
            json={"title": "待删除"},
        )
        doc_id = create_resp.json()["data"]["id"]

        resp = await client.delete(
            f"/api/workspaces/{workspace_id}/docs/{doc_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
