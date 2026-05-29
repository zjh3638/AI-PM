"""
Document service tests: create_doc, get_doc, list_docs, update_doc
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import document_svc
from app.services import user as user_service
from app.services import workspace as ws_service


class TestDocumentService:
    @pytest.fixture
    async def author(self, db_session: AsyncSession):
        return await user_service.create_user(
            db_session, username="docauthor", display_name="Doc Author", password="pw123456",
            system_role="SUPER_ADMIN",
        )

    @pytest.fixture
    async def workspace_id(self, db_session: AsyncSession, author):
        ws = await ws_service.create_workspace(
            db_session, author, name="DocWS", key="DOC-WS",
        )
        return ws.id

    @pytest.fixture
    async def doc(self, db_session: AsyncSession, workspace_id, author):
        return await document_svc.create_doc(
            db_session, workspace_id, author.id,
            title="Test Doc", path="/docs/test.md", content="# Hello",
        )

    async def test_create_doc(self, db_session: AsyncSession, workspace_id, author):
        doc = await document_svc.create_doc(
            db_session, workspace_id, author.id,
            title="New Doc", path="/docs/new.md", content="Content",
        )
        assert doc.id is not None
        assert doc.title == "New Doc"
        assert doc.version == 1

    async def test_get_doc(self, db_session: AsyncSession, doc):
        found = await document_svc.get_doc(db_session, doc.id)
        assert found is not None
        assert found.title == "Test Doc"

    async def test_get_doc_not_found(self, db_session: AsyncSession):
        found = await document_svc.get_doc(db_session, "nonexistent")
        assert found is None

    async def test_list_docs(self, db_session: AsyncSession, workspace_id, doc):
        docs, total = await document_svc.list_docs(db_session, workspace_id)
        assert total >= 1

    async def test_list_docs_with_keyword(self, db_session: AsyncSession, workspace_id, doc):
        docs, total = await document_svc.list_docs(db_session, workspace_id, keyword="Test")
        assert total == 1

    async def test_list_docs_with_type(self, db_session: AsyncSession, workspace_id, doc):
        docs, total = await document_svc.list_docs(db_session, workspace_id, doc_type="MARKDOWN")
        assert total >= 1

    async def test_update_doc(self, db_session: AsyncSession, doc):
        updated = await document_svc.update_doc(
            db_session, doc, title="Updated Doc",
        )
        assert updated.title == "Updated Doc"

    async def test_update_doc_content_bumps_version(self, db_session: AsyncSession, doc):
        assert doc.version == 1
        updated = await document_svc.update_doc(
            db_session, doc, content="# Updated Content",
        )
        assert updated.version == 2
