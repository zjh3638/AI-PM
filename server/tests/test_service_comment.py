"""
Comment service tests: create, get, list, update, delete
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import comment_svc
from app.services import user as user_service
from app.services import workspace as ws_service
from app.services import task as task_service


class TestCommentService:
    @pytest.fixture
    async def author(self, db_session: AsyncSession):
        return await user_service.create_user(
            db_session, username="commenter", display_name="Commenter", password="pw123456",
        )

    @pytest.fixture
    async def workspace_id(self, db_session: AsyncSession):
        creator = await user_service.create_user(
            db_session, username="cmtcreator", display_name="CC", password="pw123456",
            system_role="SUPER_ADMIN",
        )
        ws = await ws_service.create_workspace(
            db_session, creator, name="CommentWS", key="CMT-WS",
        )
        return ws.id

    @pytest.fixture
    async def task(self, db_session: AsyncSession, workspace_id):
        return await task_service.create_task(
            db_session, workspace_id, title="Task for Comments",
        )

    async def test_create_comment(self, db_session: AsyncSession, author, task):
        comment = await comment_svc.create_comment(
            db_session, author.id, task_id=task.id, content="Test comment",
        )
        assert comment.id is not None
        assert comment.content == "Test comment"
        assert comment.task_id == task.id

    async def test_get_comments(self, db_session: AsyncSession, author, task):
        await comment_svc.create_comment(
            db_session, author.id, task_id=task.id, content="Comment 1",
        )
        await comment_svc.create_comment(
            db_session, author.id, task_id=task.id, content="Comment 2",
        )
        comments = await comment_svc.get_comments(db_session, task.id)
        assert len(comments) >= 2

    async def test_get_comment(self, db_session: AsyncSession, author, task):
        created = await comment_svc.create_comment(
            db_session, author.id, task_id=task.id, content="Find me",
        )
        found = await comment_svc.get_comment(db_session, created.id)
        assert found is not None
        assert found.content == "Find me"

    async def test_get_comment_not_found(self, db_session: AsyncSession):
        found = await comment_svc.get_comment(db_session, "nonexistent")
        assert found is None

    async def test_update_comment(self, db_session: AsyncSession, author, task):
        created = await comment_svc.create_comment(
            db_session, author.id, task_id=task.id, content="Original",
        )
        updated = await comment_svc.update_comment(db_session, created, "Edited")
        assert updated.content == "Edited"

    async def test_delete_comment(self, db_session: AsyncSession, author, task):
        created = await comment_svc.create_comment(
            db_session, author.id, task_id=task.id, content="To delete",
        )
        await comment_svc.delete_comment(db_session, created)
        found = await comment_svc.get_comment(db_session, created.id)
        assert found is None

    async def test_comment_reply(self, db_session: AsyncSession, author, task):
        parent = await comment_svc.create_comment(
            db_session, author.id, task_id=task.id, content="Parent",
        )
        reply = await comment_svc.create_comment(
            db_session, author.id, task_id=task.id, content="Reply",
            parent_comment_id=parent.id,
        )
        assert reply.parent_comment_id == parent.id
