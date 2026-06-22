"""Tests for PM-extension AI tools (scan_risks, decompose_requirement,
extract_action_items)."""
from datetime import date, timedelta

import pytest

from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace
from app.models.workspace_member import WorkspaceMember
from app.security import hash_password
from app.services.ai_tools_pm import scan_risks


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
