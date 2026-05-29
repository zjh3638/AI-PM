"""
Search service tests: search tasks and documents
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import search as search_service
from app.services import user as user_service
from app.services import workspace as ws_service
from app.services import task as task_service
from app.services import document_svc


class TestSearchService:
    @pytest.fixture
    async def workspace_id(self, db_session: AsyncSession):
        creator = await user_service.create_user(
            db_session, username="searchcreator", display_name="SC", password="pw123456",
            system_role="SUPER_ADMIN",
        )
        ws = await ws_service.create_workspace(
            db_session, creator, name="SearchWS", key="SRCH-WS",
        )
        return ws.id

    async def test_search_tasks(self, db_session: AsyncSession, workspace_id):
        await task_service.create_task(
            db_session, workspace_id, title="Implement Login",
        )
        await task_service.create_task(
            db_session, workspace_id, title="Setup Database",
        )
        results = await search_service.search(db_session, "Login", workspace_id)
        assert len(results["tasks"]) == 1
        assert results["tasks"][0]["title"] == "Implement Login"

    async def test_search_documents(self, db_session: AsyncSession, workspace_id):
        creator = await user_service.get_user(db_session, "searchcreator")  # Not reliable, use simpler approach
        # Create doc directly
        await document_svc.create_doc(
            db_session, workspace_id, (await db_session.execute(
                __import__("sqlalchemy").select(__import__("app.models.user", fromlist=["User"]).User).where(
                    __import__("app.models.user", fromlist=["User"]).User.username == "searchcreator"
                )
            )).scalar_one().id,
            title="API Design", path="/docs/api.md", content="REST API specs",
        )
        results = await search_service.search(db_session, "API", workspace_id)
        assert len(results["documents"]) >= 1

    async def test_search_task_type_only(self, db_session: AsyncSession, workspace_id):
        await task_service.create_task(
            db_session, workspace_id, title="Refactor Code",
        )
        results = await search_service.search(db_session, "Refactor", workspace_id, search_type="task")
        assert len(results["tasks"]) >= 1
        assert len(results["documents"]) == 0

    async def test_search_empty(self, db_session: AsyncSession, workspace_id):
        results = await search_service.search(db_session, "NoMatchZZZ123", workspace_id)
        assert len(results["tasks"]) == 0
        assert len(results["documents"]) == 0
