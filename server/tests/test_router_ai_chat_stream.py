import json
import pytest
from unittest.mock import patch


@pytest.mark.asyncio
async def test_old_chat_endpoint_removed(client, auth_headers):
    resp = await client.post("/api/ai/chat", json={"message": "hi"}, headers=auth_headers)
    assert resp.status_code in (404, 405)


@pytest.mark.asyncio
async def test_chat_stream_endpoint_returns_sse(client, auth_headers, super_admin, db_session):
    """End-to-end: configure key → POST stream → consume frames."""
    from app.services.ai_service import encrypt_api_key
    user = super_admin["user"]
    user.llm_api_key = encrypt_api_key("sk-test")
    db_session.add(user)
    await db_session.commit()

    async def fake_stream(*args, **kwargs):
        for ev in [
            'event: delta\ndata: {"content":"hi"}\n\n',
            'event: done\ndata: {"message_id":"x","conversation_id":"c","actions":[]}\n\n',
        ]:
            yield ev

    with patch("app.routers.ai.chat_stream", side_effect=fake_stream):
        resp = await client.post(
            "/api/ai/chat-stream",
            json={"message": "hi", "agent": "项目经理"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        body = resp.text
        assert "event: delta" in body
        assert "event: done" in body
