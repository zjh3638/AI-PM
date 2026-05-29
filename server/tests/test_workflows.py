"""
Workflows API tests: list templates, get current workflow
"""
import pytest
from httpx import AsyncClient


@pytest.fixture
async def workspace_id(workspace: dict):
    return workspace["workspace"].id


class TestWorkflows:
    async def test_list_templates_empty(self, client: AsyncClient):
        resp = await client.get("/api/workspaces/fake-id/workflow/templates")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert isinstance(body["data"], list)

    async def test_get_current_workflow(self, client: AsyncClient, auth_headers: dict, workspace_id: str):
        resp = await client.get(
            f"/api/workspaces/{workspace_id}/workflow/current",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert "id" in body["data"]
        assert "name" in body["data"]

    async def test_list_templates_with_data(self, client: AsyncClient, db_session):
        from app.models.workflow import WorkflowTemplate, WorkflowState, WorkflowTransition

        template = WorkflowTemplate(name="Test Flow", description="Test", is_builtin=True)
        db_session.add(template)
        await db_session.flush()

        s1 = WorkflowState(template_id=template.id, name="Todo", order=0, category="TODO")
        s2 = WorkflowState(template_id=template.id, name="Done", order=1, category="DONE")
        db_session.add_all([s1, s2])
        await db_session.flush()

        tr = WorkflowTransition(template_id=template.id, from_state_id=s1.id, to_state_id=s2.id, name="Complete")
        db_session.add(tr)
        await db_session.commit()

        resp = await client.get("/api/workspaces/fake-id/workflow/templates")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) >= 1
        template_data = body["data"][0]
        assert len(template_data["states"]) == 2
        assert len(template_data["transitions"]) == 1
