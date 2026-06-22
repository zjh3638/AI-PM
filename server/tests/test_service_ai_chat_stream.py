import json
import pytest
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace

from app.services.ai_chat_stream import chat_stream
from app.models.user import User
from app.security import hash_password


def _fake_chunks(*chunks):
    """Build async iterator that yields raw SSE lines from given chunk dicts."""
    async def gen():
        for c in chunks:
            if c == "[DONE]":
                yield "data: [DONE]"
            else:
                yield f"data: {json.dumps(c)}"
    return gen()


class _StreamCtx:
    def __init__(self, lines):
        self._lines = lines
    async def __aenter__(self):
        return SimpleNamespace(aiter_lines=lambda: self._lines, raise_for_status=lambda: None)
    async def __aexit__(self, *a):
        return False


def _mock_httpx_stream(rounds_lines):
    """rounds_lines: list[list[str]] — each inner list is one round's SSE lines."""
    call_idx = {"i": 0}
    def stream(*args, **kw):
        i = call_idx["i"]
        call_idx["i"] += 1
        async def _aiter():
            for line in rounds_lines[i]:
                yield line
        return _StreamCtx(_aiter())
    return stream


@pytest.fixture
async def user(db_session):
    from app.services.ai_service import encrypt_api_key
    u = User(username="u", display_name="U", hashed_password=hash_password("pw"),
            llm_api_key=encrypt_api_key("sk-test"), llm_model="deepseek-chat")
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


async def _collect(gen):
    out = []
    async for ev in gen:
        out.append(ev)
    return out


@pytest.mark.asyncio
async def test_chat_stream_text_only(db_session, user):
    lines = [[
        f'data: {json.dumps({"choices":[{"delta":{"content":"你"}}]})}',
        f'data: {json.dumps({"choices":[{"delta":{"content":"好"}}]})}',
        f'data: {json.dumps({"choices":[{"delta":{},"finish_reason":"stop"}]})}',
        "data: [DONE]",
    ]]
    with patch("httpx.AsyncClient.stream", new=_mock_httpx_stream(lines)):
        events = await _collect(chat_stream(db_session, user, "hi", "项目经理", None, None))
    delta_events = [e for e in events if "event: delta" in e]
    done_events = [e for e in events if "event: done" in e]
    assert len(delta_events) == 2
    assert "你" in delta_events[0] and "好" in delta_events[1]
    assert len(done_events) == 1


@pytest.mark.asyncio
async def test_chat_stream_with_tool(db_session, user):
    tool_round = [
        f'data: {json.dumps({"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"get_my_tasks","arguments":"{}"}}]}}]})}',
        f'data: {json.dumps({"choices":[{"delta":{},"finish_reason":"tool_calls"}]})}',
        "data: [DONE]",
    ]
    final_round = [
        f'data: {json.dumps({"choices":[{"delta":{"content":"你没有待办"}}]})}',
        f'data: {json.dumps({"choices":[{"delta":{},"finish_reason":"stop"}]})}',
        "data: [DONE]",
    ]
    with patch("httpx.AsyncClient.stream", new=_mock_httpx_stream([tool_round, final_round])):
        events = await _collect(chat_stream(db_session, user, "我的待办", "项目经理", None, None))
    assert any("event: tool_call_start" in e for e in events)
    assert any("event: tool_call_result" in e for e in events)
    assert any("event: delta" in e and "你没有待办" in e for e in events)
    assert any("event: done" in e for e in events)


@pytest.mark.asyncio
async def test_chat_stream_persists_conversation(db_session, user):
    """After stream finishes, chat_history rows are written for user + assistant."""
    from sqlalchemy import select
    from app.models.chat_history import ChatHistory
    lines = [[
        f'data: {json.dumps({"choices":[{"delta":{"content":"hello"}}]})}',
        f'data: {json.dumps({"choices":[{"delta":{},"finish_reason":"stop"}]})}',
        "data: [DONE]",
    ]]
    with patch("httpx.AsyncClient.stream", new=_mock_httpx_stream(lines)):
        await _collect(chat_stream(db_session, user, "hi", "项目经理", None, None))
    rows = (await db_session.execute(select(ChatHistory).where(ChatHistory.user_id == user.id))).scalars().all()
    roles = [r.role for r in rows]
    assert "user" in roles and "assistant" in roles
    conv_ids = {r.conversation_id for r in rows}
    assert len(conv_ids) == 1 and None not in conv_ids
