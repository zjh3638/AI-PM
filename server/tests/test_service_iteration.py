"""
Iteration service tests: create, get, list, update, burndown
"""
import pytest
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import iteration as it_service
from app.services import user as user_service
from app.services import workspace as ws_service


class TestIterationService:
    @pytest.fixture
    async def workspace_id(self, db_session: AsyncSession):
        creator = await user_service.create_user(
            db_session, username="itercreator", display_name="IC", password="pw123456",
            system_role="SUPER_ADMIN",
        )
        ws = await ws_service.create_workspace(
            db_session, creator, name="IterWS", key="ITER-WS",
        )
        return ws.id

    @pytest.fixture
    async def iteration(self, db_session: AsyncSession, workspace_id):
        return await it_service.create_iteration(
            db_session, workspace_id,
            name="Sprint 1", goal="First sprint",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 14),
        )

    async def test_create_iteration(self, db_session: AsyncSession, workspace_id):
        it = await it_service.create_iteration(
            db_session, workspace_id,
            name="Sprint 2", start_date=date(2026, 1, 15), end_date=date(2026, 1, 28),
        )
        assert it.id is not None
        assert it.name == "Sprint 2"
        assert it.status == "PLANNING"

    async def test_get_iteration(self, db_session: AsyncSession, iteration):
        found = await it_service.get_iteration(db_session, iteration.id)
        assert found is not None
        assert found.name == "Sprint 1"

    async def test_get_iteration_not_found(self, db_session: AsyncSession):
        found = await it_service.get_iteration(db_session, "nonexistent")
        assert found is None

    async def test_list_iterations(self, db_session: AsyncSession, workspace_id, iteration):
        data = await it_service.list_iterations(db_session, workspace_id)
        assert len(data) >= 1
        assert data[0]["name"] == "Sprint 1"
        assert "task_count" in data[0]

    async def test_list_iterations_with_status(self, db_session: AsyncSession, workspace_id, iteration):
        data = await it_service.list_iterations(db_session, workspace_id, status="PLANNING")
        assert len(data) >= 1

    async def test_update_iteration(self, db_session: AsyncSession, iteration):
        updated = await it_service.update_iteration(
            db_session, iteration, name="Sprint 1 Updated", goal="Updated goal",
        )
        assert updated.name == "Sprint 1 Updated"
        assert updated.goal == "Updated goal"

    async def test_get_burndown_data(self, db_session: AsyncSession, iteration):
        burndown = await it_service.get_burndown_data(db_session, iteration.id)
        assert isinstance(burndown, list)

    async def test_get_burndown_data_not_found(self, db_session: AsyncSession):
        burndown = await it_service.get_burndown_data(db_session, "nonexistent")
        assert burndown == []
