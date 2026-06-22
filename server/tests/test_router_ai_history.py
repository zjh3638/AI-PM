import pytest
from datetime import datetime, timedelta
from app.models.chat_history import ChatHistory


@pytest.mark.asyncio
async def test_chat_history_returns_tool_messages(client, auth_headers, super_admin, db_session):
    user_id = super_admin["user"].id
    base = datetime.utcnow()
    db_session.add_all([
        ChatHistory(user_id=user_id, role="user", content="我的待办", conversation_id="c1",
                    created_at=base),
        ChatHistory(user_id=user_id, role="assistant", content="", conversation_id="c1",
                    tool_calls=[{"index": 0, "id": "call_1",
                                 "function": {"name": "get_my_tasks", "arguments": "{}"}}],
                    created_at=base + timedelta(seconds=1)),
        ChatHistory(user_id=user_id, role="tool", content='{"tasks":[]}',
                    conversation_id="c1", tool_call_id="call_1",
                    created_at=base + timedelta(seconds=2)),
        ChatHistory(user_id=user_id, role="assistant", content="你没有待办",
                    conversation_id="c1",
                    created_at=base + timedelta(seconds=3)),
    ])
    await db_session.commit()

    resp = await client.get("/api/ai/chat-history?conversation_id=c1", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["conversation_id"] == "c1"
    roles = [m["role"] for m in data["messages"]]
    assert roles == ["user", "assistant", "tool", "assistant"]
    tool_msg = [m for m in data["messages"] if m["role"] == "tool"][0]
    assert tool_msg["tool_call_id"] == "call_1"


@pytest.mark.asyncio
async def test_chat_history_latest_picks_recent_conv(client, auth_headers, super_admin, db_session):
    user_id = super_admin["user"].id
    base = datetime.utcnow()
    db_session.add_all([
        ChatHistory(user_id=user_id, role="user", content="old", conversation_id="c-old",
                    created_at=base),
        ChatHistory(user_id=user_id, role="user", content="new", conversation_id="c-new",
                    created_at=base + timedelta(seconds=1)),
    ])
    await db_session.commit()

    resp = await client.get("/api/ai/chat-history", headers=auth_headers)
    data = resp.json()["data"]
    assert data["conversation_id"] == "c-new"
    assert data["messages"][0]["content"] == "new"


# ── Conversation list (multi-conversation switcher) ───────────────────

@pytest.mark.asyncio
async def test_chat_conversations_returns_titles(client, auth_headers, super_admin, db_session):
    user_id = super_admin["user"].id
    base = datetime.utcnow()
    db_session.add_all([
        ChatHistory(user_id=user_id, role="user", content="帮我扫描风险",
                    conversation_id="c1", conversation_title="风险扫描",
                    created_at=base),
        ChatHistory(user_id=user_id, role="assistant", content="好的",
                    conversation_id="c1",
                    created_at=base + timedelta(seconds=1)),
        ChatHistory(user_id=user_id, role="user", content="创建登录模块",
                    conversation_id="c2", conversation_title="登录",
                    created_at=base + timedelta(seconds=2)),
        ChatHistory(user_id=user_id, role="assistant", content="已创建",
                    conversation_id="c2",
                    created_at=base + timedelta(seconds=3)),
    ])
    await db_session.commit()

    resp = await client.get("/api/ai/chat-conversations", headers=auth_headers)
    assert resp.status_code == 200
    convs = resp.json()["data"]["conversations"]
    assert len(convs) == 2
    # Most recent first
    assert convs[0]["conversation_id"] == "c2"
    assert convs[0]["conversation_title"] == "登录"
    assert convs[0]["first_message"] == "创建登录模块"
    assert convs[1]["conversation_id"] == "c1"


@pytest.mark.asyncio
async def test_chat_conversations_scoped_by_workspace(client, auth_headers, super_admin, db_session):
    user_id = super_admin["user"].id
    base = datetime.utcnow()
    db_session.add_all([
        ChatHistory(user_id=user_id, role="user", content="全局对话",
                    conversation_id="cg", workspace_id=None,
                    created_at=base),
        ChatHistory(user_id=user_id, role="user", content="项目A对话",
                    conversation_id="cw", workspace_id="ws-a",
                    created_at=base + timedelta(seconds=1)),
        ChatHistory(user_id=user_id, role="assistant", content="x",
                    conversation_id="cg", workspace_id=None,
                    created_at=base + timedelta(seconds=2)),
        ChatHistory(user_id=user_id, role="assistant", content="x",
                    conversation_id="cw", workspace_id="ws-a",
                    created_at=base + timedelta(seconds=3)),
    ])
    await db_session.commit()

    # global scope (workspace_id omitted)
    resp = await client.get("/api/ai/chat-conversations", headers=auth_headers)
    convs = resp.json()["data"]["conversations"]
    assert len(convs) == 1
    assert convs[0]["conversation_id"] == "cg"

    # workspace scope
    resp = await client.get("/api/ai/chat-conversations?workspace_id=ws-a", headers=auth_headers)
    convs = resp.json()["data"]["conversations"]
    assert len(convs) == 1
    assert convs[0]["conversation_id"] == "cw"


@pytest.mark.asyncio
async def test_chat_conversations_untitled_fallback(client, auth_headers, super_admin, db_session):
    """Conversation without a title uses its first user message as fallback."""
    user_id = super_admin["user"].id
    base = datetime.utcnow()
    db_session.add_all([
        ChatHistory(user_id=user_id, role="user", content="未命名对话内容",
                    conversation_id="cu", conversation_title=None,
                    created_at=base),
        ChatHistory(user_id=user_id, role="assistant", content="ok",
                    conversation_id="cu",
                    created_at=base + timedelta(seconds=1)),
    ])
    await db_session.commit()

    resp = await client.get("/api/ai/chat-conversations", headers=auth_headers)
    convs = resp.json()["data"]["conversations"]
    assert len(convs) == 1
    assert convs[0]["conversation_title"] == "未命名对话内容"
