"""Streaming chat: async-generator yielding SSE frames.

Pipeline:
  build_messages → for each tool round { stream LLM → accumulate → execute tools }
  → persist new messages → final `done` frame.
"""
import asyncio
import json
import logging
import uuid
from typing import AsyncGenerator, Optional

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.chat_history import ChatHistory
from app.models.user import User
from app.services.ai_prompt import build_system_prompt
from app.services.ai_service import (
    TOOLS, decrypt_api_key, execute_tool, get_gateway_url,
)
from app.services.ai_sse import sse, accumulate_tool_calls, parse_sse_chunk

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 3
MAX_HISTORY_MESSAGES = 50
RESULT_SUMMARY_LIMIT = 200
TITLE_MAX_CHARS = 16


async def _load_history(db: AsyncSession, user_id: str,
                        conversation_id: Optional[str],
                        workspace_id: Optional[str] = None,
                        ) -> tuple[Optional[str], list[dict]]:
    """Return (conversation_id, openai-format messages list).

    When `conversation_id` is given, load exactly that conversation. Otherwise
    pick the user's most recent conversation *within the given workspace
    scope* (workspace_id NULL means the global / non-workspace scope, e.g.
    chat opened from the dashboard).
    """
    q = select(ChatHistory).where(ChatHistory.user_id == user_id)
    if conversation_id:
        q = q.where(ChatHistory.conversation_id == conversation_id)
    else:
        latest_q = (
            select(ChatHistory.conversation_id)
            .where(ChatHistory.user_id == user_id,
                   ChatHistory.conversation_id.is_not(None))
        )
        if workspace_id is None:
            latest_q = latest_q.where(ChatHistory.workspace_id.is_(None))
        else:
            latest_q = latest_q.where(ChatHistory.workspace_id == workspace_id)
        latest = (await db.execute(
            latest_q.order_by(ChatHistory.created_at.desc()).limit(1)
        )).scalar()
        if latest is None:
            return None, []
        conversation_id = latest
        q = q.where(ChatHistory.conversation_id == latest)
    q = q.order_by(ChatHistory.created_at.asc()).limit(MAX_HISTORY_MESSAGES)
    rows = (await db.execute(q)).scalars().all()
    messages = []
    for r in rows:
        if r.role == "user":
            messages.append({"role": "user", "content": r.content})
        elif r.role == "assistant":
            msg = {"role": "assistant", "content": r.content or None}
            if r.tool_calls:
                msg["tool_calls"] = r.tool_calls
            messages.append(msg)
        elif r.role == "tool":
            messages.append({"role": "tool", "tool_call_id": r.tool_call_id,
                             "content": r.content})
    return conversation_id, messages


async def chat_stream(
    db: AsyncSession,
    user: User,
    message: str,
    agent: str = "项目经理",
    workspace_id: Optional[str] = None,
    route_context: Optional[dict] = None,
    conversation_id: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    if not user.llm_api_key:
        yield sse("error", {"message": "未配置 LLM API Key，请到个人中心 → AI 配置设置。"})
        return

    api_key = decrypt_api_key(user.llm_api_key)
    model = user.llm_model or "deepseek-chat"
    conv_id, history = await _load_history(db, user.id, conversation_id, workspace_id)
    is_first_turn = not history  # used to trigger title generation
    if not conv_id:
        conv_id = str(uuid.uuid4())

    system_prompt = build_system_prompt(agent, user, route_context)
    messages = [{"role": "system", "content": system_prompt}, *history,
                {"role": "user", "content": message}]
    new_rows: list[ChatHistory] = [ChatHistory(
        user_id=user.id, role="user", content=message, agent=agent,
        conversation_id=conv_id, workspace_id=workspace_id,
    )]
    actions: list[dict] = []
    full_reply_parts: list[str] = []

    for _round in range(MAX_TOOL_ROUNDS):
        tool_acc: dict = {}
        content_acc = ""
        finish_reason = None

        async with httpx.AsyncClient(timeout=60.0).stream(
            "POST", f"{get_gateway_url()}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}",
                     "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "temperature": 0.3,
                  "max_tokens": 2048, "tools": TOOLS, "stream": True},
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                chunk = parse_sse_chunk(line)
                if chunk is None:
                    continue
                choice = (chunk.get("choices") or [{}])[0]
                delta = choice.get("delta") or {}
                if delta.get("content"):
                    content_acc += delta["content"]
                    yield sse("delta", {"content": delta["content"]})
                if delta.get("tool_calls"):
                    accumulate_tool_calls(tool_acc, delta["tool_calls"])
                if choice.get("finish_reason"):
                    finish_reason = choice["finish_reason"]

        if not tool_acc:
            full_reply_parts.append(content_acc)
            new_rows.append(ChatHistory(
                user_id=user.id, role="assistant", content=content_acc,
                agent=agent, conversation_id=conv_id, workspace_id=workspace_id,
            ))
            break

        tool_calls = [tool_acc[k] for k in sorted(tool_acc.keys())]
        new_rows.append(ChatHistory(
            user_id=user.id, role="assistant", content=content_acc or "",
            agent=agent, conversation_id=conv_id, workspace_id=workspace_id,
            tool_calls=tool_calls,
        ))
        messages.append({"role": "assistant", "content": content_acc or None,
                         "tool_calls": tool_calls})

        for tc in tool_calls:
            try:
                args = json.loads(tc["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            yield sse("tool_call_start", {"idx": tc["index"],
                                          "tool": tc["function"]["name"], "args": args})
            result = await execute_tool(db, user, tc, workspace_id)
            actions.append({"tool": tc["function"]["name"], "args": args, "result": result})
            ev_payload = {"idx": tc["index"],
                          "result_summary": json.dumps(result, ensure_ascii=False)[:RESULT_SUMMARY_LIMIT]}
            if isinstance(result, dict) and "error" in result:
                ev_payload["error"] = str(result["error"])
            yield sse("tool_call_result", ev_payload)
            result_json = json.dumps(result, ensure_ascii=False)
            new_rows.append(ChatHistory(
                user_id=user.id, role="tool", content=result_json,
                agent=agent, conversation_id=conv_id, workspace_id=workspace_id,
                tool_call_id=tc["id"],
            ))
            messages.append({"role": "tool", "tool_call_id": tc["id"],
                             "content": result_json})
    else:
        # MAX_TOOL_ROUNDS exhausted: ask for a summary text round
        messages.append({"role": "user", "content": "请用简短的中文总结以上操作结果。"})
        async for ev in _final_text_round(api_key, model, messages, full_reply_parts):
            yield ev
        new_rows.append(ChatHistory(
            user_id=user.id, role="assistant",
            content="".join(full_reply_parts), agent=agent,
            conversation_id=conv_id, workspace_id=workspace_id,
        ))

    # Persist whatever we managed to capture (works for both normal and partial paths).
    try:
        # Attach the last assistant row's tool_actions for backward-compat consumers.
        if actions:
            for r in reversed(new_rows):
                if r.role == "assistant" and r.tool_actions is None:
                    r.tool_actions = actions
                    break
        for r in new_rows:
            db.add(r)
        await db.commit()
        last_id = new_rows[-1].id
    except Exception as exc:
        yield sse("error", {"message": f"持久化失败: {exc}"})
        return

    # First turn of a fresh conversation → asynchronously name it for the
    # multi-conversation switcher (best-effort; never blocks the response).
    if is_first_turn and "".join(full_reply_parts):
        asyncio.create_task(_generate_title(
            api_key=api_key, model=model, conv_id=conv_id,
            user_message=message, assistant_reply="".join(full_reply_parts),
        ))

    yield sse("done", {"message_id": last_id, "conversation_id": conv_id,
                       "actions": actions})


async def _final_text_round(api_key: str, model: str, messages: list[dict],
                            full_reply_parts: list[str]) -> AsyncGenerator[str, None]:
    async with httpx.AsyncClient(timeout=60.0).stream(
        "POST", f"{get_gateway_url()}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"model": model, "messages": messages, "temperature": 0.3,
              "max_tokens": 2048, "stream": True},
    ) as resp:
        resp.raise_for_status()
        async for line in resp.aiter_lines():
            chunk = parse_sse_chunk(line)
            if chunk is None:
                continue
            delta = (chunk.get("choices") or [{}])[0].get("delta") or {}
            if delta.get("content"):
                full_reply_parts.append(delta["content"])
                yield sse("delta", {"content": delta["content"]})


async def _generate_title(*, api_key: str, model: str, conv_id: str,
                          user_message: str, assistant_reply: str) -> None:
    """Best-effort: ask the LLM for a short title and write it onto every row
    of this conversation. Failures are logged and swallowed."""
    prompt = (
        "给下面这段对话拟一个 8 个汉字以内的中文标题，只输出标题本身、不要标点、"
        "不要引号、不要解释。\n\n"
        f"用户：{user_message[:200]}\n"
        f"助手：{assistant_reply[:300]}"
    )
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{get_gateway_url()}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}",
                         "Content-Type": "application/json"},
                json={"model": model, "temperature": 0.2, "max_tokens": 32,
                      "messages": [{"role": "user", "content": prompt}]},
            )
            resp.raise_for_status()
            raw = (resp.json().get("choices") or [{}])[0].get("message", {}).get("content", "")
        title = raw.strip().strip('"').strip("'").splitlines()[0][:TITLE_MAX_CHARS]
        if not title:
            return
        async with async_session() as s:
            await s.execute(
                update(ChatHistory)
                .where(ChatHistory.conversation_id == conv_id)
                .values(conversation_title=title)
            )
            await s.commit()
    except Exception as exc:  # noqa: BLE001 — fire-and-forget
        logger.warning("conversation title generation failed for %s: %s", conv_id, exc)
