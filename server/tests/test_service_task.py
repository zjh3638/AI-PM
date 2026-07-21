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


class TestWorkItems:
    """子工作清单 (work_items) 服务测试。"""

    @pytest.fixture
    async def workspace_id(self, db_session: AsyncSession):
        creator = await user_service.create_user(
            db_session, username="wicreator", display_name="WC", password="pw123456",
            system_role="SUPER_ADMIN",
        )
        ws = await ws_service.create_workspace(db_session, creator, name="WIWS", key="WI-WS")
        return ws.id

    @pytest.fixture
    async def task(self, db_session: AsyncSession, workspace_id):
        return await task_service.create_task(
            db_session, workspace_id, title="复杂任务", task_type="TASK",
        )

    async def test_add_work_item(self, db_session: AsyncSession, task):
        t = await task_service.add_work_item(db_session, task, title="指标接入")
        assert len(t.work_items) == 1
        assert t.work_items[0]["title"] == "指标接入"
        assert t.work_items[0]["completed"] is False
        assert t.work_items[0]["sort_order"] == 0

    async def test_complete_work_item_persists(self, db_session: AsyncSession, task):
        """标记完成后必须持久化（JSON 就地修改检测）。"""
        t = await task_service.add_work_item(db_session, task, title="指标定义")
        item_id = t.work_items[0]["id"]
        t = await task_service.update_work_item(db_session, t, item_id, completed=True)
        # 从 DB 重新读取，验证真的落库
        reloaded = await task_service.get_task(db_session, t.id)
        assert reloaded.work_items[0]["completed"] is True
        assert reloaded.work_items[0]["completed_at"] is not None

    async def test_work_items_stats(self, db_session: AsyncSession, task):
        t = await task_service.add_work_item(db_session, task, title="A")
        t = await task_service.add_work_item(db_session, t, title="B")
        t = await task_service.add_work_item(db_session, t, title="C")
        t = await task_service.update_work_item(db_session, t, t.work_items[0]["id"], completed=True)
        d = task_service._task_to_dict(t)
        assert d["work_items_total"] == 3
        assert d["work_items_done"] == 1

    async def test_delete_work_item_resequences(self, db_session: AsyncSession, task):
        t = await task_service.add_work_item(db_session, task, title="A")
        t = await task_service.add_work_item(db_session, t, title="B")
        t = await task_service.add_work_item(db_session, t, title="C")
        mid_id = t.work_items[1]["id"]
        t = await task_service.delete_work_item(db_session, t, mid_id)
        assert len(t.work_items) == 2
        assert [w["sort_order"] for w in t.work_items] == [0, 1]

    async def test_reorder_work_items(self, db_session: AsyncSession, task):
        t = await task_service.add_work_item(db_session, task, title="A")
        t = await task_service.add_work_item(db_session, t, title="B")
        ids = [w["id"] for w in t.work_items]
        t = await task_service.reorder_work_items(db_session, t, [ids[1], ids[0]])
        assert t.work_items[0]["title"] == "B"
        assert t.work_items[1]["title"] == "A"


class TestTaskTemplate:
    """任务模板服务测试。"""

    @pytest.fixture
    async def ctx(self, db_session: AsyncSession):
        creator = await user_service.create_user(
            db_session, username="tplcreator", display_name="TplC", password="pw123456",
            system_role="SUPER_ADMIN",
        )
        ws = await ws_service.create_workspace(db_session, creator, name="TplWS", key="TPL-WS")
        return {"ws_id": ws.id, "user_id": creator.id}

    async def test_create_and_render_template(self, db_session: AsyncSession, ctx):
        from app.services import task_template as tpl_svc
        tpl = await tpl_svc.create_template(
            db_session, ctx["ws_id"], ctx["user_id"],
            name="Redis监控", task_type="TASK",
            title_template="{项目} - Redis监控", priority="HIGH", phase="DEVELOPMENT",
            work_items_template=[
                {"title": "指标接入", "sort_order": 0},
                {"title": "告警基线", "sort_order": 1},
            ],
        )
        assert tpl.usage_count == 0
        tpl = await tpl_svc.get_template(db_session, tpl.id)
        task = await tpl_svc.create_task_from_template(
            db_session, tpl, ctx["ws_id"], variables={"项目": "支付"},
        )
        assert task.title == "支付 - Redis监控"
        assert task.created_from_template_name == "Redis监控"
        assert len(task.work_items) == 2
        assert task.work_items[0]["title"] == "指标接入"
        # 使用次数累加
        tpl = await tpl_svc.get_template(db_session, tpl.id)
        assert tpl.usage_count == 1

    async def test_template_work_item_override(self, db_session: AsyncSession, ctx):
        from app.services import task_template as tpl_svc
        tpl = await tpl_svc.create_template(
            db_session, ctx["ws_id"], ctx["user_id"],
            name="部署流程", title_template="部署",
            work_items_template=[{"title": "预发布", "sort_order": 0}],
        )
        tpl = await tpl_svc.get_template(db_session, tpl.id)
        task = await tpl_svc.create_task_from_template(
            db_session, tpl, ctx["ws_id"],
            work_item_overrides={"0": {"assignee_id": ctx["user_id"], "due_date": "2026-07-25"}},
        )
        assert task.work_items[0]["assignee_id"] == ctx["user_id"]
        assert task.work_items[0]["due_date"] == "2026-07-25"
