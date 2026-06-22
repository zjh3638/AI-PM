"""Tests for PM-extension AI tools (scan_risks, decompose_requirement,
extract_action_items)."""
from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace
from app.models.workspace_member import WorkspaceMember
from app.security import hash_password
from app.services.ai_tools_pm import (
    scan_risks, decompose_requirement, extract_action_items,
)


@pytest.fixture
async def ws_with_tasks(db_session):
    """Workspace with a mix of overdue / due-soon / unassigned / healthy tasks."""
    u = User(username="ali", display_name="阿里",
             hashed_password=hash_password("pw"))
    db_session.add(u)
    await db_session.flush()
    ws = Workspace(name="P1", key="P1K", type="PROJECT",
                   status="ACTIVE", visibility="PRIVATE")
    db_session.add(ws)
    await db_session.flush()
    db_session.add(WorkspaceMember(workspace_id=ws.id, user_id=u.id, role="OWNER"))

    today = date.today()
    rows = [
        # 1) overdue, in progress, assigned
        Task(workspace_id=ws.id, title="逾期任务A", status="IN_PROGRESS",
             priority="HIGH", assignee_id=u.id, due_date=today - timedelta(days=5)),
        # 2) overdue but DONE → must be ignored
        Task(workspace_id=ws.id, title="已完成的旧任务", status="DONE",
             priority="MEDIUM", assignee_id=u.id, due_date=today - timedelta(days=2)),
        # 3) due soon (in 2 days)
        Task(workspace_id=ws.id, title="即将到期B", status="TODO",
             priority="MEDIUM", assignee_id=u.id, due_date=today + timedelta(days=2)),
        # 4) far future — neither overdue nor due soon
        Task(workspace_id=ws.id, title="远期任务", status="TODO",
             priority="LOW", assignee_id=u.id, due_date=today + timedelta(days=30)),
        # 5) unassigned, in active status
        Task(workspace_id=ws.id, title="无人认领C", status="TODO",
             priority="HIGH", assignee_id=None),
        # 6) unassigned but DONE → must be ignored
        Task(workspace_id=ws.id, title="未分配但完成", status="DONE",
             priority="LOW", assignee_id=None),
    ]
    for t in rows:
        db_session.add(t)
    await db_session.commit()
    return {"workspace": ws, "user": u}


@pytest.mark.asyncio
async def test_scan_risks_partitions_correctly(db_session, ws_with_tasks):
    ws_id = ws_with_tasks["workspace"].id
    result = await scan_risks(db_session, workspace_id=ws_id)

    assert result["summary"]["overdue"] == 1
    assert result["summary"]["due_soon"] == 1
    assert result["summary"]["unassigned"] == 1

    assert [t["title"] for t in result["overdue"]] == ["逾期任务A"]
    assert result["overdue"][0]["days_overdue"] == 5
    assert result["overdue"][0]["assignee_name"] == "阿里"

    assert [t["title"] for t in result["due_soon"]] == ["即将到期B"]
    assert result["due_soon"][0]["days_until_due"] == 2

    assert [t["title"] for t in result["unassigned"]] == ["无人认领C"]


@pytest.mark.asyncio
async def test_scan_risks_horizon_param(db_session, ws_with_tasks):
    """Caller can widen the due_soon window."""
    ws_id = ws_with_tasks["workspace"].id
    # 30-day horizon should pull in the "远期任务" (due in 30d) AND "即将到期B"
    result = await scan_risks(db_session, workspace_id=ws_id, horizon_days=30)
    titles = {t["title"] for t in result["due_soon"]}
    assert "即将到期B" in titles
    assert "远期任务" in titles


@pytest.mark.asyncio
async def test_scan_risks_unknown_workspace(db_session):
    result = await scan_risks(db_session, workspace_id="no-such-ws")
    assert result["summary"] == {"overdue": 0, "due_soon": 0, "unassigned": 0}
    assert result["overdue"] == result["due_soon"] == result["unassigned"] == []


@pytest.mark.asyncio
async def test_scan_risks_via_execute_tool(db_session, ws_with_tasks):
    """scan_risks must be reachable through the global execute_tool dispatcher."""
    import json
    from app.services.ai_service import execute_tool

    ws_id = ws_with_tasks["workspace"].id
    tc = {"id": "c1", "function": {"name": "scan_risks",
                                   "arguments": json.dumps({"workspace_id": ws_id})}}
    result = await execute_tool(db_session, ws_with_tasks["user"], tc, ws_id)
    assert "summary" in result
    assert result["summary"]["overdue"] == 1


# ── decompose_requirement ──────────────────────────────────────────────

@pytest.fixture
async def ws_for_decompose(db_session):
    u = User(username="zhao2", display_name="周二",
             hashed_password=hash_password("pw"))
    db_session.add(u)
    await db_session.flush()
    ws = Workspace(name="P2", key="P2K", type="PROJECT",
                   status="ACTIVE", visibility="PRIVATE")
    db_session.add(ws)
    await db_session.flush()
    db_session.add(WorkspaceMember(workspace_id=ws.id, user_id=u.id, role="OWNER"))
    await db_session.commit()
    return {"workspace": ws, "user": u}


@pytest.mark.asyncio
async def test_decompose_creates_parent_and_children(db_session, ws_for_decompose):
    ws_id = ws_for_decompose["workspace"].id
    uid = ws_for_decompose["user"].id
    result = await decompose_requirement(
        db=db_session, workspace_id=ws_id, parent_title="登录模块",
        subtasks=[
            {"title": "前端登录页", "priority": "HIGH", "assignee_id": uid},
            {"title": "后端登录 API", "priority": "MEDIUM"},
            {"title": "登录联调测试"},
        ],
    )
    assert result["parent"]["title"] == "登录模块"
    assert result["created_count"] == 3
    assert [c["title"] for c in result["children"]] == [
        "前端登录页", "后端登录 API", "登录联调测试",
    ]
    # All children point to the parent
    parent_id = result["parent"]["id"]
    children_q = await db_session.execute(
        select(Task).where(Task.parent_id == parent_id)
    )
    children = children_q.scalars().all()
    assert len(children) == 3
    assert {c.priority for c in children} == {"HIGH", "MEDIUM", "MEDIUM"}


@pytest.mark.asyncio
async def test_decompose_uses_existing_parent(db_session, ws_for_decompose):
    ws_id = ws_for_decompose["workspace"].id
    # Pre-existing parent task
    parent = Task(workspace_id=ws_id, title="支付模块", task_type="STORY")
    db_session.add(parent)
    await db_session.commit()
    await db_session.refresh(parent)

    result = await decompose_requirement(
        db=db_session, workspace_id=ws_id, parent_id=parent.id,
        subtasks=[{"title": "选择支付方式"}, {"title": "回调处理"}],
    )
    assert result["parent"]["id"] == parent.id
    assert result["parent"]["title"] == "支付模块"
    assert result["created_count"] == 2
    # Did NOT create a new parent
    all_titled = await db_session.execute(
        select(Task).where(Task.workspace_id == ws_id, Task.title == "支付模块")
    )
    assert len(all_titled.scalars().all()) == 1


@pytest.mark.asyncio
async def test_decompose_requires_parent_or_title(db_session, ws_for_decompose):
    ws_id = ws_for_decompose["workspace"].id
    result = await decompose_requirement(
        db=db_session, workspace_id=ws_id, subtasks=[{"title": "x"}],
    )
    assert "error" in result


@pytest.mark.asyncio
async def test_decompose_skips_invalid_subtasks(db_session, ws_for_decompose):
    """Subtasks without a title are skipped with an error entry but the rest still create."""
    ws_id = ws_for_decompose["workspace"].id
    result = await decompose_requirement(
        db=db_session, workspace_id=ws_id, parent_title="导出功能",
        subtasks=[
            {"title": "选择导出范围"},
            {"description": "没有标题"},  # invalid
            {"title": "生成 CSV"},
        ],
    )
    assert result["created_count"] == 2
    assert len(result["errors"]) == 1
    assert [c["title"] for c in result["children"]] == ["选择导出范围", "生成 CSV"]


@pytest.mark.asyncio
async def test_decompose_via_execute_tool(db_session, ws_for_decompose):
    import json
    from app.services.ai_service import execute_tool

    ws_id = ws_for_decompose["workspace"].id
    tc = {"id": "d1", "function": {"name": "decompose_requirement",
        "arguments": json.dumps({"workspace_id": ws_id, "parent_title": "导入",
                                 "subtasks": [{"title": "选文件"}, {"title": "校验"}]})}}
    result = await execute_tool(db_session, ws_for_decompose["user"], tc, ws_id)
    assert result["created_count"] == 2


# ── extract_action_items ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_extract_action_items_creates_orphan_tasks(db_session, ws_for_decompose):
    """Without a parent, action items become top-level tasks with the meeting
    footer appended to description."""
    ws_id = ws_for_decompose["workspace"].id
    uid = ws_for_decompose["user"].id
    result = await extract_action_items(
        db=db_session, workspace_id=ws_id,
        meeting_title="2026-06-22 周会",
        attendees=["周二", "李四"],
        items=[
            {"title": "联系运维确认上线时间", "assignee_id": uid,
             "due_date": "2026-06-25"},
            {"title": "梳理验收用例"},
        ],
    )
    assert result["created_count"] == 2
    titles = [t["title"] for t in result["items"]]
    assert titles == ["联系运维确认上线时间", "梳理验收用例"]
    # No parent linkage on extracted items
    for item in result["items"]:
        row = (await db_session.execute(
            select(Task).where(Task.id == item["id"])
        )).scalar_one()
        assert row.parent_id is None
        # Meeting context must end up in description (helps traceability)
        assert "周会" in (row.description or "")
        assert "周二" in (row.description or "")


@pytest.mark.asyncio
async def test_extract_action_items_empty_items_returns_error(db_session, ws_for_decompose):
    result = await extract_action_items(
        db=db_session, workspace_id=ws_for_decompose["workspace"].id,
        meeting_title="空会", items=[],
    )
    assert "error" in result


@pytest.mark.asyncio
async def test_extract_action_items_via_execute_tool(db_session, ws_for_decompose):
    import json
    from app.services.ai_service import execute_tool
    ws_id = ws_for_decompose["workspace"].id
    tc = {"id": "e1", "function": {"name": "extract_action_items",
        "arguments": json.dumps({
            "workspace_id": ws_id, "meeting_title": "Standup",
            "items": [{"title": "确认部署窗口"}],
        })}}
    result = await execute_tool(db_session, ws_for_decompose["user"], tc, ws_id)
    assert result["created_count"] == 1
