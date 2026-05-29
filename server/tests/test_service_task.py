"""
Task service tests: create_task, get_task, list_tasks, update_task, children, epics, kanban, move
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import task as task_service
from app.services import user as user_service
from app.services import workspace as ws_service
from app.models.task import Task


class TestTaskService:
    WS_ID = None

    @pytest.fixture
    async def workspace_id(self, db_session: AsyncSession):
        creator = await user_service.create_user(
            db_session, username="taskcreator", display_name="TC", password="pw123456",
            system_role="SUPER_ADMIN",
        )
        ws = await ws_service.create_workspace(
            db_session, creator, name="TaskWS", key="TASK-WS",
        )
        return ws.id

    @pytest.fixture
    async def task(self, db_session: AsyncSession, workspace_id):
        return await task_service.create_task(
            db_session, workspace_id, title="Test Task", task_type="TASK",
        )

    async def test_create_task(self, db_session: AsyncSession, workspace_id):
        task = await task_service.create_task(
            db_session, workspace_id, title="New Task", priority="HIGH",
        )
        assert task.id is not None
        assert task.title == "New Task"
        assert task.priority == "HIGH"
        assert task.status == "TODO"

    async def test_create_epic(self, db_session: AsyncSession, workspace_id):
        epic = await task_service.create_task(
            db_session, workspace_id, title="Epic Task", task_type="EPIC",
        )
        assert epic.task_type == "EPIC"

    async def test_get_task(self, db_session: AsyncSession, task):
        found = await task_service.get_task(db_session, task.id)
        assert found is not None
        assert found.title == "Test Task"

    async def test_get_task_not_found(self, db_session: AsyncSession):
        found = await task_service.get_task(db_session, "nonexistent")
        assert found is None

    async def test_list_tasks(self, db_session: AsyncSession, workspace_id, task):
        tasks, total = await task_service.list_tasks(db_session, workspace_id)
        assert total >= 1

    async def test_list_tasks_with_filters(self, db_session: AsyncSession, workspace_id, task):
        tasks, total = await task_service.list_tasks(
            db_session, workspace_id, task_type="TASK", status="TODO", priority="HIGH",
        )
        assert total == 0  # task has MEDIUM default

        tasks2, total2 = await task_service.list_tasks(
            db_session, workspace_id, status="TODO",
        )
        assert total2 >= 1

    async def test_list_tasks_with_keyword(self, db_session: AsyncSession, workspace_id, task):
        tasks, total = await task_service.list_tasks(db_session, workspace_id, keyword="Test")
        assert total >= 1

    async def test_update_task(self, db_session: AsyncSession, task):
        updated = await task_service.update_task(
            db_session, task, title="Updated Title", priority="LOW",
        )
        assert updated.title == "Updated Title"
        assert updated.priority == "LOW"

    async def test_update_task_to_in_progress_sets_started_at(self, db_session: AsyncSession, task):
        assert task.started_at is None
        updated = await task_service.update_task(db_session, task, status="IN_PROGRESS")
        assert updated.started_at is not None

    async def test_update_task_to_done_sets_completed_at(self, db_session: AsyncSession, task):
        assert task.completed_at is None
        updated = await task_service.update_task(db_session, task, status="DONE")
        assert updated.completed_at is not None

    async def test_get_children(self, db_session: AsyncSession, workspace_id, task):
        child = await task_service.create_task(
            db_session, workspace_id, title="Child", task_type="SUB_TASK", parent_id=task.id,
        )
        children = await task_service.get_children(db_session, task.id)
        assert len(children) == 1
        assert children[0].title == "Child"

    async def test_get_child_count(self, db_session: AsyncSession, workspace_id, task):
        await task_service.create_task(
            db_session, workspace_id, title="C1", parent_id=task.id,
        )
        await task_service.create_task(
            db_session, workspace_id, title="C2", parent_id=task.id,
        )
        count = await task_service.get_child_count(db_session, task.id)
        assert count == 2

    async def test_get_epics(self, db_session: AsyncSession, workspace_id):
        await task_service.create_task(
            db_session, workspace_id, title="Epic 1", task_type="EPIC",
        )
        epics = await task_service.get_epics(db_session, workspace_id)
        assert len(epics) >= 1
        assert epics[0]["task_type"] == "EPIC"

    async def test_get_kanban(self, db_session: AsyncSession, workspace_id, task):
        kanban = await task_service.get_kanban(db_session, workspace_id)
        assert "TODO" in kanban
        assert len(kanban["TODO"]) >= 1

    async def test_move_task(self, db_session: AsyncSession, task):
        moved = await task_service.move_task(db_session, task, "IN_PROGRESS", sort_order=5)
        assert moved.status == "IN_PROGRESS"
        assert moved.sort_order == 5
        assert moved.started_at is not None
