import pytest
from app.models.chat_history import ChatHistory
from app.models.user import User
from app.security import hash_password


@pytest.mark.asyncio
async def test_chat_history_with_streaming_fields(db_session):
    user = User(username="u1", display_name="U1", hashed_password=hash_password("pw"))
    db_session.add(user)
    await db_session.flush()

    rec = ChatHistory(
        user_id=user.id,
        role="assistant",
        content="hi",
        agent="项目经理",
        tool_calls=[{"id": "call_1", "function": {"name": "create_task", "arguments": "{}"}}],
        tool_call_id=None,
        conversation_id="conv-abc",
    )
    db_session.add(rec)
    await db_session.commit()
    await db_session.refresh(rec)

    assert rec.tool_calls[0]["id"] == "call_1"
    assert rec.conversation_id == "conv-abc"


@pytest.mark.asyncio
async def test_chat_history_tool_role(db_session):
    user = User(username="u2", display_name="U2", hashed_password=hash_password("pw"))
    db_session.add(user)
    await db_session.flush()
    rec = ChatHistory(
        user_id=user.id, role="tool", content='{"ok":true}',
        tool_call_id="call_1", conversation_id="conv-abc",
    )
    db_session.add(rec)
    await db_session.commit()
    await db_session.refresh(rec)
    assert rec.role == "tool"
    assert rec.tool_call_id == "call_1"
