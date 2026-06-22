import json
import pytest
from app.services.ai_service import execute_tool
from app.models.workspace import Workspace
from app.models.workspace_member import WorkspaceMember
from app.models.user import User
from app.security import hash_password


@pytest.fixture
async def setup_ws(db_session):
    u = User(username="zhao", display_name="赵云", hashed_password=hash_password("pw"))
    db_session.add(u)
    await db_session.flush()
    ws = Workspace(name="W1", key="W1K", type="PROJECT", status="ACTIVE", visibility="PRIVATE")
    db_session.add(ws)
    await db_session.flush()
    db_session.add(WorkspaceMember(workspace_id=ws.id, user_id=u.id, role="OWNER"))
    await db_session.commit()
    return {"user": u, "workspace": ws}


@pytest.mark.asyncio
async def test_execute_tool_get_workspace_context(db_session, setup_ws):
    tc = {"id": "c1", "function": {"name": "get_workspace_context",
                                    "arguments": json.dumps({"workspace_id": setup_ws["workspace"].id})}}
    result = await execute_tool(db_session, setup_ws["user"], tc, setup_ws["workspace"].id)
    assert "members" in result
    assert any(m["name"] == "赵云" for m in result["members"])


@pytest.mark.asyncio
async def test_execute_tool_unknown_name(db_session, setup_ws):
    tc = {"id": "c2", "function": {"name": "no_such_tool", "arguments": "{}"}}
    result = await execute_tool(db_session, setup_ws["user"], tc, setup_ws["workspace"].id)
    assert "error" in result


@pytest.mark.asyncio
async def test_execute_tool_bad_json_args(db_session, setup_ws):
    tc = {"id": "c3", "function": {"name": "get_my_tasks", "arguments": "{not json"}}
    result = await execute_tool(db_session, setup_ws["user"], tc, setup_ws["workspace"].id)
    # args fall back to {}, get_my_tasks still runs
    assert "tasks" in result or "error" in result
