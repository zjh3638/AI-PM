# AI 对话能力深化升级 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 AI Drawer 从一次性请求升级为流式、有上下文、可追溯的对话工具——一次性交付 4 项改进（流式 SSE / 跨轮 tool_calls 持久化 / 隐式路由上下文 / 工具调用可视化）。

**Architecture:** 后端 `chat_stream()` 改为 async generator，FastAPI 用 `StreamingResponse` 输出 SSE；`chat_history` 表扩展 3 字段持久化完整 messages 序列；前端 fetch+ReadableStream 消费 SSE，用 reducer-style 状态机驱动 UI，新增 `useRouteContext` hook 自动注入当前页信息。

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy async / httpx stream / Alembic — React 18 / TypeScript / Vite / Vitest / fetch ReadableStream

**Spec reference:** `docs/superpowers/specs/2026-06-22-ai-chat-streaming-upgrade-design.md`

---

## Task 1: ChatHistory 模型扩展 + Alembic Migration

**Files:**
- Modify: `server/app/models/chat_history.py`
- Create: `server/alembic/versions/<rev>_chat_history_streaming_fields.py`（rev 由 `alembic revision` 生成）
- Test: `server/tests/test_model_chat_history.py`

- [ ] **Step 1: 写失败测试**

创建 `server/tests/test_model_chat_history.py`：
```python
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
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd server && uv run pytest tests/test_model_chat_history.py -v
```
Expected: FAIL（`tool_calls` / `tool_call_id` / `conversation_id` 不是 ChatHistory 的字段）

- [ ] **Step 3: 修改模型加字段**

`server/app/models/chat_history.py`（替换整个文件）：
```python
from datetime import datetime

from sqlalchemy import String, Text, JSON, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin


class ChatHistory(Base, UUIDMixin):
    __tablename__ = "chat_history"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user / assistant / tool
    content: Mapped[str] = mapped_column(Text, nullable=False)
    agent: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tool_actions: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    tool_calls: Mapped[list | None] = mapped_column(JSON, nullable=True)
    tool_call_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    conversation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user = relationship("User")
```

- [ ] **Step 4: 生成 alembic migration**

```bash
cd server && uv run alembic revision --autogenerate -m "chat_history streaming fields"
```
然后打开生成的 `server/alembic/versions/<rev>_chat_history_streaming_fields.py`，**确认** upgrade() 只包含以下 3 列 add + 1 索引（无关字段删掉）：

```python
def upgrade() -> None:
    op.add_column("chat_history", sa.Column("tool_calls", sa.JSON(), nullable=True))
    op.add_column("chat_history", sa.Column("tool_call_id", sa.String(64), nullable=True))
    op.add_column("chat_history", sa.Column("conversation_id", sa.String(36), nullable=True))
    op.create_index("ix_chat_history_conversation_id", "chat_history", ["conversation_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_history_conversation_id", "chat_history")
    op.drop_column("chat_history", "conversation_id")
    op.drop_column("chat_history", "tool_call_id")
    op.drop_column("chat_history", "tool_calls")
```

- [ ] **Step 5: 应用迁移、跑测试确认通过**

```bash
cd server && uv run alembic upgrade head
uv run pytest tests/test_model_chat_history.py -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/app/models/chat_history.py server/alembic/versions/*_chat_history_streaming_fields.py server/tests/test_model_chat_history.py
git commit -m "feat(ai): extend chat_history with tool_calls, tool_call_id, conversation_id"
```

---

## Task 2: system_prompt builder（隐式上下文注入）

**Files:**
- Create: `server/app/services/ai_prompt.py`
- Test: `server/tests/test_service_ai_prompt.py`

- [ ] **Step 1: 写失败测试**

`server/tests/test_service_ai_prompt.py`：
```python
from types import SimpleNamespace
from app.services.ai_prompt import build_system_prompt


def _user(name="赵某", role="MEMBER"):
    return SimpleNamespace(display_name=name, system_role=role)


def test_prompt_no_context():
    p = build_system_prompt("项目经理", _user(), None)
    assert "项目经理助手" in p
    assert "【当前上下文】" in p
    assert "用户：赵某（MEMBER）" in p


def test_prompt_with_workspace_detail():
    ctx = {"page_type": "workspace_detail", "workspace_id": "ws-1",
           "workspace_name": "电商重构", "workspace_tab": "kanban"}
    p = build_system_prompt("项目经理", _user(), ctx)
    assert "所在页：项目详情" in p
    assert "项目：电商重构 (id=ws-1)" in p
    assert "当前 tab：kanban" in p


def test_prompt_with_task_detail():
    ctx = {"page_type": "task_detail", "workspace_id": "ws-1",
           "task_id": "task-9", "task_title": "登录模块"}
    p = build_system_prompt("项目经理", _user(), ctx)
    assert "选中任务：登录模块 (id=task-9)" in p


def test_prompt_unknown_agent_falls_back():
    p = build_system_prompt("xxx", _user(), None)
    assert "项目经理助手" in p
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd server && uv run pytest tests/test_service_ai_prompt.py -v
```
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 build_system_prompt**

`server/app/services/ai_prompt.py`：
```python
from datetime import date
from typing import Optional

SYSTEM_PROMPTS: dict[str, str] = {
    "项目经理": (
        "你是 AI PM 平台的项目经理助手。你擅长项目进度分析、风险识别、报告生成、"
        "任务调度和资源分配。回复专业、简洁，用中文。"
        "你可以通过调用工具来查询项目数据、创建/更新任务、生成报告。"
        "当用户要求执行操作时，先收集必要信息，再调用合适的工具。"
        "操作完成后用自然的语言告知用户结果。"
    ),
    "开发工程师": (
        "你是 AI PM 平台的开发工程师助手。你擅长任务拆解、技术方案讨论、"
        "工作量估算和代码相关问题。回复专业、简洁，用中文。"
        "你可以通过调用工具来查询任务、更新任务状态。"
    ),
    "需求分析师": (
        "你是 AI PM 平台的需求分析师助手。你擅长需求梳理、PRD 编写、"
        "用户故事拆分和需求优先级排序。回复专业、简洁，用中文。"
        "你可以通过调用工具来创建需求、搜索相关文档。"
    ),
    "设计师": (
        "你是 AI PM 平台的设计师助手。你擅长技术方案设计、架构讨论、"
        "接口设计和系统设计评审。回复专业、简洁，用中文。"
        "你可以通过调用工具来查询项目信息、更新设计文档。"
    ),
}

PAGE_LABELS = {
    "dashboard": "工作台 - 我的关注",
    "workspace_list": "工作空间列表",
    "workspace_detail": "项目详情",
    "task_detail": "任务详情",
    "personal": "个人中心",
    "admin": "系统管理",
    "project_group": "项目集详情",
    "bigscreen": "会议大屏",
}


def build_system_prompt(agent: str, user, route_context: Optional[dict]) -> str:
    base = SYSTEM_PROMPTS.get(agent, SYSTEM_PROMPTS["项目经理"])
    lines = [
        f"用户：{user.display_name}（{user.system_role}）",
        f"日期：{date.today().isoformat()}",
    ]
    if route_context:
        page = PAGE_LABELS.get(route_context.get("page_type"), "未知")
        lines.append(f"所在页：{page}")
        if route_context.get("workspace_tab"):
            lines[-1] = f"所在页：{page} - {route_context['workspace_tab']}"
        if route_context.get("workspace_name"):
            wid = route_context.get("workspace_id", "")
            lines.append(f"项目：{route_context['workspace_name']} (id={wid})")
        if route_context.get("workspace_tab"):
            lines.append(f"当前 tab：{route_context['workspace_tab']}")
        if route_context.get("task_title"):
            tid = route_context.get("task_id", "")
            lines.append(f"选中任务：{route_context['task_title']} (id={tid})")
        filters = route_context.get("filters") or {}
        if filters:
            kv = ", ".join(f"{k}={v}" for k, v in filters.items() if v)
            if kv:
                lines.append(f"筛选：{kv}")
    ctx_block = "\n".join(f"- {l}" for l in lines)
    return f"{base}\n\n【当前上下文】\n{ctx_block}"
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd server && uv run pytest tests/test_service_ai_prompt.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/services/ai_prompt.py server/tests/test_service_ai_prompt.py
git commit -m "feat(ai): system prompt builder with implicit route context"
```

---

## Task 3: SSE 工具函数（编码 / 解析 / tool_calls 累积）

**Files:**
- Create: `server/app/services/ai_sse.py`
- Test: `server/tests/test_service_ai_sse.py`

- [ ] **Step 1: 写失败测试**

`server/tests/test_service_ai_sse.py`：
```python
import json
from app.services.ai_sse import sse, accumulate_tool_calls, parse_sse_chunk


def test_sse_format():
    frame = sse("delta", {"content": "你好"})
    assert frame == 'event: delta\ndata: {"content": "你好"}\n\n'


def test_accumulate_tool_calls_single():
    acc = {}
    accumulate_tool_calls(acc, [
        {"index": 0, "id": "call_1", "function": {"name": "create_task", "arguments": ""}},
    ])
    accumulate_tool_calls(acc, [
        {"index": 0, "function": {"arguments": '{"title":'}},
    ])
    accumulate_tool_calls(acc, [
        {"index": 0, "function": {"arguments": '"hi"}'}},
    ])
    assert acc[0]["id"] == "call_1"
    assert acc[0]["function"]["name"] == "create_task"
    assert acc[0]["function"]["arguments"] == '{"title":"hi"}'


def test_accumulate_tool_calls_parallel():
    acc = {}
    accumulate_tool_calls(acc, [
        {"index": 0, "id": "call_a", "function": {"name": "f1", "arguments": "{}"}},
        {"index": 1, "id": "call_b", "function": {"name": "f2", "arguments": "{}"}},
    ])
    assert acc[0]["id"] == "call_a"
    assert acc[1]["id"] == "call_b"


def test_parse_sse_chunk_data_only():
    line = 'data: {"choices":[{"delta":{"content":"x"}}]}'
    obj = parse_sse_chunk(line)
    assert obj["choices"][0]["delta"]["content"] == "x"


def test_parse_sse_chunk_done_marker():
    assert parse_sse_chunk("data: [DONE]") is None
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd server && uv run pytest tests/test_service_ai_sse.py -v
```
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 SSE 工具函数**

`server/app/services/ai_sse.py`：
```python
import json
from typing import Optional


def sse(event: str, data: dict) -> str:
    """Format an SSE frame: `event: <name>\\ndata: <json>\\n\\n`."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def accumulate_tool_calls(acc: dict, delta_tool_calls: list) -> None:
    """Merge streamed tool_calls deltas (by index) into accumulator.

    Streamed protocol: id/name only on first chunk; arguments concatenated
    across chunks; multiple parallel calls disambiguated by index.
    """
    for tc in delta_tool_calls:
        idx = tc["index"]
        if idx not in acc:
            acc[idx] = {
                "index": idx,
                "id": "",
                "type": "function",
                "function": {"name": "", "arguments": ""},
            }
        slot = acc[idx]
        if tc.get("id"):
            slot["id"] = tc["id"]
        fn = tc.get("function") or {}
        if fn.get("name"):
            slot["function"]["name"] = fn["name"]
        if fn.get("arguments"):
            slot["function"]["arguments"] += fn["arguments"]


def parse_sse_chunk(line: str) -> Optional[dict]:
    """Parse a single `data:` SSE line into a dict. Returns None for [DONE]."""
    line = line.strip()
    if not line.startswith("data:"):
        return None
    payload = line[5:].strip()
    if payload == "[DONE]":
        return None
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return None
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd server && uv run pytest tests/test_service_ai_sse.py -v
```
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add server/app/services/ai_sse.py server/tests/test_service_ai_sse.py
git commit -m "feat(ai): SSE helpers — frame encoder, tool_calls accumulator, chunk parser"
```

---

## Task 4: 提取 execute_tool dispatch

**Files:**
- Modify: `server/app/services/ai_service.py`（提取 dispatch 函数）
- Test: `server/tests/test_service_ai_execute_tool.py`

- [ ] **Step 1: 写失败测试**

`server/tests/test_service_ai_execute_tool.py`：
```python
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
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd server && uv run pytest tests/test_service_ai_execute_tool.py -v
```
Expected: FAIL（`execute_tool` 未在 ai_service 中定义）

- [ ] **Step 3: 在 ai_service.py 中实现 execute_tool**

在 `server/app/services/ai_service.py` 文件末尾追加（保持现有 `TOOL_EXECUTORS` 字典不变）：
```python
async def execute_tool(db: AsyncSession, user: User, tool_call: dict,
                      workspace_id: Optional[str]) -> dict:
    """Dispatch one tool_call to its executor. Returns the result dict (or {error}).

    Handles: arg JSON parsing, implicit workspace_id injection, user_id for
    get_my_tasks, exception capture.
    """
    name = tool_call["function"]["name"]
    raw_args = tool_call["function"].get("arguments") or "{}"
    try:
        args = json.loads(raw_args)
    except json.JSONDecodeError:
        args = {}

    executor = TOOL_EXECUTORS.get(name)
    if executor is None:
        return {"error": f"未知工具: {name}"}

    if workspace_id and "workspace_id" not in args:
        args["workspace_id"] = workspace_id
    if "workspace_id" in args and not args["workspace_id"]:
        del args["workspace_id"]

    try:
        if name == "get_my_tasks":
            return await executor(
                db,
                user_id=user.id,
                **{k: v for k, v in args.items() if k != "workspace_id"},
            )
        return await executor(db, **args)
    except Exception as exc:
        return {"error": str(exc)}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd server && uv run pytest tests/test_service_ai_execute_tool.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/services/ai_service.py server/tests/test_service_ai_execute_tool.py
git commit -m "feat(ai): extract execute_tool dispatch with arg/error normalization"
```

---

## Task 5: chat_stream() async generator

**Files:**
- Create: `server/app/services/ai_chat_stream.py`
- Test: `server/tests/test_service_ai_chat_stream.py`

- [ ] **Step 1: 写失败测试（mock LLM stream）**

`server/tests/test_service_ai_chat_stream.py`：
```python
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
    def stream(method, url, **kw):
        i = call_idx["i"]
        call_idx["i"] += 1
        return _StreamCtx(rounds_lines[i])
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
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd server && uv run pytest tests/test_service_ai_chat_stream.py -v
```
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 chat_stream() — 第一部分：消息构建 & 主框架**

`server/app/services/ai_chat_stream.py`：
```python
"""Streaming chat: async-generator yielding SSE frames.

Pipeline:
  build_messages → for each tool round { stream LLM → accumulate → execute tools }
  → persist new messages → final `done` frame.
"""
import asyncio
import json
import uuid
from typing import AsyncGenerator, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_history import ChatHistory
from app.models.user import User
from app.services.ai_prompt import build_system_prompt
from app.services.ai_service import (
    TOOLS, decrypt_api_key, execute_tool, get_gateway_url,
)
from app.services.ai_sse import sse, accumulate_tool_calls, parse_sse_chunk

MAX_TOOL_ROUNDS = 3
MAX_HISTORY_MESSAGES = 50
RESULT_SUMMARY_LIMIT = 200


async def _load_history(db: AsyncSession, user_id: str,
                        conversation_id: Optional[str]) -> tuple[Optional[str], list[dict]]:
    """Return (conversation_id, openai-format messages list)."""
    q = select(ChatHistory).where(ChatHistory.user_id == user_id)
    if conversation_id:
        q = q.where(ChatHistory.conversation_id == conversation_id)
    else:
        # latest conversation: pick the most recent conversation_id
        latest = (await db.execute(
            select(ChatHistory.conversation_id)
            .where(ChatHistory.user_id == user_id, ChatHistory.conversation_id.is_not(None))
            .order_by(ChatHistory.created_at.desc()).limit(1)
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
```

- [ ] **Step 4: 实现 chat_stream() — 第二部分：主 generator**

继续追加到 `server/app/services/ai_chat_stream.py`：
```python
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
    conv_id, history = await _load_history(db, user.id, conversation_id)
    if not conv_id:
        conv_id = str(uuid.uuid4())

    system_prompt = build_system_prompt(agent, user, route_context)
    messages = [{"role": "system", "content": system_prompt}, *history,
                {"role": "user", "content": message}]
    new_rows: list[ChatHistory] = [ChatHistory(
        user_id=user.id, role="user", content=message, agent=agent,
        conversation_id=conv_id,
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
                agent=agent, conversation_id=conv_id,
            ))
            break

        tool_calls = [tool_acc[k] for k in sorted(tool_acc.keys())]
        new_rows.append(ChatHistory(
            user_id=user.id, role="assistant", content=content_acc or "",
            agent=agent, conversation_id=conv_id, tool_calls=tool_calls,
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
                agent=agent, conversation_id=conv_id, tool_call_id=tc["id"],
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
            content="".join(full_reply_parts), agent=agent, conversation_id=conv_id,
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
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd server && uv run pytest tests/test_service_ai_chat_stream.py -v
```
Expected: PASS（3 tests）

- [ ] **Step 6: Commit**

```bash
git add server/app/services/ai_chat_stream.py server/tests/test_service_ai_chat_stream.py
git commit -m "feat(ai): streaming chat generator with tool round loop and persistence"
```

---

## Task 6: 新端点 `POST /api/ai/chat-stream` + 删除旧 `POST /api/ai/chat`

**Files:**
- Modify: `server/app/routers/ai.py`
- Test: `server/tests/test_router_ai_chat_stream.py`

- [ ] **Step 1: 写失败测试（端点存在性 + happy path）**

`server/tests/test_router_ai_chat_stream.py`：
```python
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

    async def fake_stream(self, *args, **kwargs):
        async def gen():
            for ev in [
                'event: delta\ndata: {"content":"hi"}\n\n',
                'event: done\ndata: {"message_id":"x","conversation_id":"c","actions":[]}\n\n',
            ]:
                yield ev
        from contextlib import asynccontextmanager
        return gen()

    with patch("app.routers.ai.chat_stream", side_effect=lambda *a, **kw: fake_stream(None)):
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
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd server && uv run pytest tests/test_router_ai_chat_stream.py -v
```
Expected: FAIL（端点不存在、旧端点还在）

- [ ] **Step 3: 修改 router — 加新端点、删旧端点**

在 `server/app/routers/ai.py` 中：

(a) 加 import：
```python
import asyncio
from fastapi.responses import StreamingResponse
from app.services.ai_chat_stream import chat_stream
```

(b) 把现有的 `class ChatRequest` 替换为：
```python
class ChatStreamRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    agent: str = "项目经理"
    workspace_id: Optional[str] = None
    conversation_id: Optional[str] = None
    route_context: Optional[dict] = None
```

(c) **删除** 现有的 `@router.post("/chat", ...)` 端点（ai_chat 函数整段）。

(d) 新增端点：
```python
@router.post("/chat-stream")
async def ai_chat_stream(
    req: ChatStreamRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    async def event_source():
        try:
            async for frame in chat_stream(
                db=db, user=user,
                message=req.message, agent=req.agent,
                workspace_id=req.workspace_id,
                route_context=req.route_context,
                conversation_id=req.conversation_id,
            ):
                yield frame
        except asyncio.CancelledError:
            # Client disconnected mid-stream — chat_stream already wrote what it had.
            raise
        except Exception as exc:
            yield (
                f'event: error\ndata: {{"message": {json.dumps(str(exc), ensure_ascii=False)}}}\n\n'
            )

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd server && uv run pytest tests/test_router_ai_chat_stream.py -v
```
Expected: PASS

- [ ] **Step 5: 跑全量后端测试确认无回归**

```bash
cd server && uv run pytest -q
```
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add server/app/routers/ai.py server/tests/test_router_ai_chat_stream.py
git commit -m "feat(ai): /chat-stream SSE endpoint; remove legacy /chat"
```

---

## Task 7: chat-history 加载改造（支持 conversation_id + 返回完整序列）

**Files:**
- Modify: `server/app/routers/ai.py`（重写 `get_chat_history`）
- Test: `server/tests/test_router_ai_history.py`

- [ ] **Step 1: 写失败测试**

`server/tests/test_router_ai_history.py`：
```python
import pytest
from app.models.chat_history import ChatHistory


@pytest.mark.asyncio
async def test_chat_history_returns_tool_messages(client, auth_headers, super_admin, db_session):
    user_id = super_admin["user"].id
    db_session.add_all([
        ChatHistory(user_id=user_id, role="user", content="我的待办", conversation_id="c1"),
        ChatHistory(user_id=user_id, role="assistant", content="", conversation_id="c1",
                    tool_calls=[{"index": 0, "id": "call_1",
                                 "function": {"name": "get_my_tasks", "arguments": "{}"}}]),
        ChatHistory(user_id=user_id, role="tool", content='{"tasks":[]}',
                    conversation_id="c1", tool_call_id="call_1"),
        ChatHistory(user_id=user_id, role="assistant", content="你没有待办",
                    conversation_id="c1"),
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
    db_session.add_all([
        ChatHistory(user_id=user_id, role="user", content="old", conversation_id="c-old"),
        ChatHistory(user_id=user_id, role="user", content="new", conversation_id="c-new"),
    ])
    await db_session.commit()

    resp = await client.get("/api/ai/chat-history", headers=auth_headers)
    data = resp.json()["data"]
    assert data["conversation_id"] == "c-new"
    assert data["messages"][0]["content"] == "new"
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd server && uv run pytest tests/test_router_ai_history.py -v
```
Expected: FAIL（旧 endpoint 不支持 `conversation_id` 参数 & 响应结构不同）

- [ ] **Step 3: 重写 `get_chat_history`**

在 `server/app/routers/ai.py` 中替换整个 `get_chat_history` 函数：
```python
@router.get("/chat-history", response_model=APIResponse)
async def get_chat_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    conversation_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=100),
):
    """Return one conversation's full message sequence (user/assistant/tool)."""
    if conversation_id is None:
        latest = (await db.execute(
            select(ChatHistory.conversation_id)
            .where(ChatHistory.user_id == user.id,
                   ChatHistory.conversation_id.is_not(None))
            .order_by(ChatHistory.created_at.desc()).limit(1)
        )).scalar()
        conversation_id = latest

    if conversation_id is None:
        return {"code": 0, "message": "ok",
                "data": {"conversation_id": None, "messages": []}}

    rows = (await db.execute(
        select(ChatHistory)
        .where(ChatHistory.user_id == user.id,
               ChatHistory.conversation_id == conversation_id)
        .order_by(ChatHistory.created_at.asc()).limit(limit)
    )).scalars().all()

    messages = []
    for r in rows:
        m = {
            "id": r.id, "role": r.role, "content": r.content,
            "agent": r.agent, "created_at": r.created_at.isoformat(),
        }
        if r.tool_calls:
            m["tool_calls"] = r.tool_calls
        if r.tool_call_id:
            m["tool_call_id"] = r.tool_call_id
        if r.tool_actions:
            m["actions"] = [
                {"tool": a["tool"], "label": tool_labels.get(a["tool"], a["tool"]),
                 "args": a.get("args"), "result": a.get("result")}
                for a in r.tool_actions
            ]
        messages.append(m)

    return {"code": 0, "message": "ok",
            "data": {"conversation_id": conversation_id, "messages": messages}}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd server && uv run pytest tests/test_router_ai_history.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/routers/ai.py server/tests/test_router_ai_history.py
git commit -m "feat(ai): chat-history returns full per-conversation message sequence"
```

---

## Task 8: 前端类型 + reducer

**Files:**
- Create: `apps/web/src/components/Layout/aiTypes.ts`
- Create: `apps/web/src/components/Layout/aiReducer.ts`
- Test: `apps/web/src/components/Layout/aiReducer.test.ts`

- [ ] **Step 1: 写失败测试**

`apps/web/src/components/Layout/aiReducer.test.ts`：
```typescript
import { describe, it, expect } from 'vitest';
import { applyFrame } from './aiReducer';
import type { ChatMsg, SSEFrame } from './aiTypes';

const baseAssistant: ChatMsg = {
  id: 'tmp-1', role: 'assistant', status: 'streaming',
  text: '', toolCalls: [], agent: '项目经理',
};

describe('applyFrame', () => {
  it('appends delta content to last assistant message', () => {
    const start: ChatMsg[] = [baseAssistant];
    const next = applyFrame(start, { event: 'delta', data: { content: '你好' } });
    expect((next[0] as any).text).toBe('你好');
    const next2 = applyFrame(next, { event: 'delta', data: { content: '世界' } });
    expect((next2[0] as any).text).toBe('你好世界');
  });

  it('appends tool_call_start as running trace', () => {
    const f: SSEFrame = { event: 'tool_call_start', data: { idx: 0, tool: 'create_task', args: { title: 'x' } } };
    const next = applyFrame([baseAssistant], f);
    expect((next[0] as any).toolCalls).toHaveLength(1);
    expect((next[0] as any).toolCalls[0].state).toBe('running');
  });

  it('updates tool trace on tool_call_result success', () => {
    const withStart = applyFrame([baseAssistant], { event: 'tool_call_start', data: { idx: 0, tool: 'f', args: {} } });
    const next = applyFrame(withStart, { event: 'tool_call_result', data: { idx: 0, result_summary: 'ok' } });
    expect((next[0] as any).toolCalls[0].state).toBe('success');
    expect((next[0] as any).toolCalls[0].resultSummary).toBe('ok');
  });

  it('marks tool trace as error when error field present', () => {
    const withStart = applyFrame([baseAssistant], { event: 'tool_call_start', data: { idx: 0, tool: 'f', args: {} } });
    const next = applyFrame(withStart, { event: 'tool_call_result', data: { idx: 0, result_summary: '', error: 'boom' } });
    expect((next[0] as any).toolCalls[0].state).toBe('error');
    expect((next[0] as any).toolCalls[0].errorMsg).toBe('boom');
  });

  it('marks done on done frame and sets server-side id', () => {
    const next = applyFrame([baseAssistant], { event: 'done', data: { message_id: 'm-9', conversation_id: 'c-1', actions: [] } });
    expect((next[0] as any).status).toBe('done');
    expect(next[0].id).toBe('m-9');
  });

  it('marks error on error frame', () => {
    const next = applyFrame([baseAssistant], { event: 'error', data: { message: 'fail' } });
    expect((next[0] as any).status).toBe('error');
    expect((next[0] as any).error).toBe('fail');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd apps/web && pnpm vitest run src/components/Layout/aiReducer.test.ts
```
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 aiTypes.ts**

`apps/web/src/components/Layout/aiTypes.ts`：
```typescript
export type ToolCallTrace = {
  idx: number;
  tool: string;
  args: Record<string, unknown>;
  state: 'running' | 'success' | 'error';
  resultSummary?: string;
  errorMsg?: string;
};

export type ChatMsg =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'assistant';
      status: 'streaming' | 'done' | 'error';
      text: string;
      toolCalls: ToolCallTrace[];
      agent: string;
      error?: string;
      actions?: { tool: string; label?: string }[]; // populated on done from server
    };

export type SSEFrame =
  | { event: 'delta'; data: { content: string } }
  | { event: 'tool_call_start'; data: { idx: number; tool: string; args: Record<string, unknown> } }
  | { event: 'tool_call_result'; data: { idx: number; result_summary: string; error?: string } }
  | { event: 'done'; data: { message_id: string; conversation_id: string; actions: { tool: string; label?: string }[] } }
  | { event: 'error'; data: { message: string } };

export type RouteContext = {
  page_type: 'dashboard' | 'workspace_list' | 'workspace_detail' | 'task_detail'
            | 'personal' | 'admin' | 'project_group' | 'bigscreen';
  workspace_id?: string;
  workspace_name?: string;
  workspace_tab?: string;
  task_id?: string;
  task_title?: string;
  filters?: Record<string, string | undefined>;
};
```

- [ ] **Step 4: 实现 aiReducer.ts**

`apps/web/src/components/Layout/aiReducer.ts`：
```typescript
import type { ChatMsg, SSEFrame } from './aiTypes';

export function applyFrame(messages: ChatMsg[], frame: SSEFrame): ChatMsg[] {
  if (messages.length === 0) return messages;
  const lastIdx = messages.length - 1;
  const last = messages[lastIdx];
  if (last.role !== 'assistant') return messages;
  const updated: ChatMsg = (() => {
    switch (frame.event) {
      case 'delta':
        return { ...last, text: last.text + frame.data.content };
      case 'tool_call_start':
        return {
          ...last,
          toolCalls: [...last.toolCalls,
            { idx: frame.data.idx, tool: frame.data.tool, args: frame.data.args, state: 'running' }],
        };
      case 'tool_call_result':
        return {
          ...last,
          toolCalls: last.toolCalls.map(tc =>
            tc.idx === frame.data.idx
              ? {
                  ...tc,
                  state: frame.data.error ? 'error' : 'success',
                  resultSummary: frame.data.result_summary,
                  errorMsg: frame.data.error,
                }
              : tc),
        };
      case 'done':
        return { ...last, status: 'done', id: frame.data.message_id, actions: frame.data.actions };
      case 'error':
        return { ...last, status: 'error', error: frame.data.message };
    }
  })();
  return [...messages.slice(0, lastIdx), updated];
}
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd apps/web && pnpm vitest run src/components/Layout/aiReducer.test.ts
```
Expected: PASS（6 tests）

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Layout/aiTypes.ts apps/web/src/components/Layout/aiReducer.ts apps/web/src/components/Layout/aiReducer.test.ts
git commit -m "feat(ai-web): ChatMsg types and SSE frame reducer"
```

---

## Task 9: 前端 SSE 消费层（streamChat）

**Files:**
- Create: `apps/web/src/api/aiStream.ts`
- Test: `apps/web/src/api/aiStream.test.ts`

- [ ] **Step 1: 写失败测试**

`apps/web/src/api/aiStream.test.ts`：
```typescript
import { describe, it, expect, vi } from 'vitest';
import { streamChat, parseSSEFrame } from './aiStream';

function makeReadable(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(ctrl) {
      if (i < chunks.length) ctrl.enqueue(enc.encode(chunks[i++]));
      else ctrl.close();
    },
  });
}

describe('parseSSEFrame', () => {
  it('parses event + data lines', () => {
    const f = parseSSEFrame('event: delta\ndata: {"content":"x"}');
    expect(f).toEqual({ event: 'delta', data: { content: 'x' } });
  });
  it('returns null on malformed', () => {
    expect(parseSSEFrame('garbage')).toBeNull();
  });
});

describe('streamChat', () => {
  it('dispatches frames split across chunks', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeReadable([
        'event: delta\ndata: {"content":"你"}\n\nevent: delta\ndata: {"con',
        'tent":"好"}\n\nevent: done\ndata: {"message_id":"m","conversation_id":"c","actions":[]}\n\n',
      ]),
      headers: new Headers(),
    }) as any;

    const frames: any[] = [];
    await streamChat(
      { message: 'hi', agent: '项目经理' },
      { onFrame: (f) => frames.push(f) },
    );
    expect(frames.map(f => f.event)).toEqual(['delta', 'delta', 'done']);
    expect(frames[0].data.content).toBe('你');
    expect(frames[1].data.content).toBe('好');
  });

  it('respects AbortController', async () => {
    const ctrl = new AbortController();
    global.fetch = vi.fn((_url, opts: any) => {
      ctrl.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    }) as any;
    await expect(streamChat({ message: 'x', agent: 'a' }, { onFrame: () => {} }, ctrl))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd apps/web && pnpm vitest run src/api/aiStream.test.ts
```
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 aiStream.ts**

`apps/web/src/api/aiStream.ts`：
```typescript
import type { SSEFrame, RouteContext } from '../components/Layout/aiTypes';

export type ChatStreamRequest = {
  message: string;
  agent: string;
  workspace_id?: string;
  conversation_id?: string;
  route_context?: RouteContext;
};

export type StreamCallbacks = {
  onFrame: (frame: SSEFrame) => void;
};

export function parseSSEFrame(raw: string): SSEFrame | null {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let event = '';
  let dataStr = '';
  for (const l of lines) {
    if (l.startsWith('event:')) event = l.slice(6).trim();
    else if (l.startsWith('data:')) dataStr += l.slice(5).trim();
  }
  if (!event || !dataStr) return null;
  try {
    return { event, data: JSON.parse(dataStr) } as SSEFrame;
  } catch {
    return null;
  }
}

export async function streamChat(
  req: ChatStreamRequest,
  cbs: StreamCallbacks,
  controller?: AbortController,
): Promise<void> {
  const token = localStorage.getItem('token');
  const resp = await fetch('/api/ai/chat-stream', {
    method: 'POST',
    signal: controller?.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(req),
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`stream failed: ${resp.status}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    while (true) {
      const i = buf.indexOf('\n\n');
      if (i === -1) break;
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const frame = parseSSEFrame(raw);
      if (frame) cbs.onFrame(frame);
    }
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd apps/web && pnpm vitest run src/api/aiStream.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/aiStream.ts apps/web/src/api/aiStream.test.ts
git commit -m "feat(ai-web): SSE stream client with fetch+ReadableStream"
```

---

## Task 10: useRouteContext hook

**Files:**
- Create: `apps/web/src/components/Layout/useRouteContext.ts`
- Test: `apps/web/src/components/Layout/useRouteContext.test.ts`

- [ ] **Step 1: 写失败测试**

`apps/web/src/components/Layout/useRouteContext.test.ts`：
```typescript
import { describe, it, expect } from 'vitest';
import { deriveRouteContext } from './useRouteContext';

describe('deriveRouteContext', () => {
  it('dashboard', () => {
    const ctx = deriveRouteContext('/dashboard', undefined);
    expect(ctx.page_type).toBe('dashboard');
  });

  it('workspace detail kanban', () => {
    const ctx = deriveRouteContext('/workspaces/ws-1/kanban', { id: 'ws-1', name: '项目A' });
    expect(ctx.page_type).toBe('workspace_detail');
    expect(ctx.workspace_id).toBe('ws-1');
    expect(ctx.workspace_name).toBe('项目A');
    expect(ctx.workspace_tab).toBe('kanban');
  });

  it('workspace detail without tab', () => {
    const ctx = deriveRouteContext('/workspaces/ws-2', { id: 'ws-2', name: '项目B' });
    expect(ctx.page_type).toBe('workspace_detail');
    expect(ctx.workspace_tab).toBeUndefined();
  });

  it('task detail', () => {
    const ctx = deriveRouteContext('/workspaces/ws-1/tasks/task-9', { id: 'ws-1', name: '项目A' });
    expect(ctx.page_type).toBe('task_detail');
    expect(ctx.task_id).toBe('task-9');
  });

  it('personal page does not inject workspace', () => {
    const ctx = deriveRouteContext('/personal', { id: 'ws-1', name: 'X' });
    expect(ctx.page_type).toBe('personal');
    expect(ctx.workspace_id).toBeUndefined();
  });

  it('admin / settings', () => {
    expect(deriveRouteContext('/settings', undefined).page_type).toBe('admin');
  });

  it('project group', () => {
    expect(deriveRouteContext('/project-groups/g-1', undefined).page_type).toBe('project_group');
  });

  it('bigscreen', () => {
    expect(deriveRouteContext('/bigscreen', undefined).page_type).toBe('bigscreen');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd apps/web && pnpm vitest run src/components/Layout/useRouteContext.test.ts
```
Expected: FAIL

- [ ] **Step 3: 实现 useRouteContext.ts**

`apps/web/src/components/Layout/useRouteContext.ts`：
```typescript
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { RouteContext } from './aiTypes';

export function deriveRouteContext(
  pathname: string,
  workspace: { id: string; name: string } | undefined,
): RouteContext {
  // /workspaces/:id/tasks/:taskId → task_detail
  const taskMatch = pathname.match(/^\/workspaces\/([^/]+)\/tasks\/([^/]+)/);
  if (taskMatch) {
    return {
      page_type: 'task_detail',
      workspace_id: taskMatch[1],
      workspace_name: workspace?.name,
      task_id: taskMatch[2],
    };
  }
  // /workspaces/:id[/tab] → workspace_detail
  const wsMatch = pathname.match(/^\/workspaces\/([^/]+)(?:\/([^/]+))?/);
  if (wsMatch) {
    return {
      page_type: 'workspace_detail',
      workspace_id: wsMatch[1],
      workspace_name: workspace?.name,
      workspace_tab: wsMatch[2] || undefined,
    };
  }
  if (pathname === '/workspaces') return { page_type: 'workspace_list' };
  if (pathname === '/dashboard' || pathname === '/') return { page_type: 'dashboard' };
  if (pathname === '/personal') return { page_type: 'personal' };
  if (pathname === '/settings') return { page_type: 'admin' };
  if (pathname === '/bigscreen') return { page_type: 'bigscreen' };
  if (pathname.startsWith('/project-groups/')) return { page_type: 'project_group' };
  return { page_type: 'dashboard' };
}

export function useRouteContext(): RouteContext {
  const loc = useLocation();
  const { current } = useWorkspaceStore();
  return useMemo(
    () => deriveRouteContext(loc.pathname, current ? { id: current.id, name: current.name } : undefined),
    [loc.pathname, current?.id, current?.name],
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd apps/web && pnpm vitest run src/components/Layout/useRouteContext.test.ts
```
Expected: PASS（8 tests）

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Layout/useRouteContext.ts apps/web/src/components/Layout/useRouteContext.test.ts
git commit -m "feat(ai-web): useRouteContext hook with path-pattern derivation"
```

---

## Task 11: AiDrawer 重构（流式 UI + 工具卡片 + 停止/新对话）

**Files:**
- Modify: `apps/web/src/components/Layout/AiDrawer.tsx`（整体重写）
- Modify: `apps/web/src/styles/pulse.css`（追加工具卡片样式 + 新对话/停止按钮样式）

- [ ] **Step 1: 重写 AiDrawer.tsx**

`apps/web/src/components/Layout/AiDrawer.tsx`（完整替换）：
```tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore';
import api from '../../api/client';
import { streamChat } from '../../api/aiStream';
import { applyFrame } from './aiReducer';
import { useRouteContext } from './useRouteContext';
import type { ChatMsg, ToolCallTrace } from './aiTypes';

const AGENTS = ['项目经理', '开发工程师', '需求分析师', '设计师'];
const SUGGESTIONS = [
  '帮我看看有哪些逾期任务',
  '创建任务：登录模块开发，高优先级',
  '生成本周周报',
  '我的待办有哪些',
];
const TOOL_LABELS: Record<string, string> = {
  get_workspace_context: '获取项目信息',
  create_task: '创建任务',
  update_task: '更新任务',
  search_tasks: '搜索任务',
  get_my_tasks: '查询待办',
  generate_report: '生成报告',
};

export default function AiDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuthStore();
  const routeCtx = useRouteContext();
  const [agent, setAgent] = useState(AGENTS[0]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsConfig, setNeedsConfig] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      try {
        const [cfg, hist] = await Promise.all([
          api.get('/ai/me/llm-config'),
          api.get('/ai/chat-history'),
        ]);
        setNeedsConfig(!cfg.data.has_api_key);
        const d = hist.data;
        if (d?.conversation_id) {
          setConversationId(d.conversation_id);
          setMessages(historyToMsgs(d.messages));
        }
        setLoaded(true);
      } catch {
        setNeedsConfig(true);
        setLoaded(true);
      }
    })();
  }, [open, user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  useEffect(() => {
    if (!open) { setInput(''); setLoaded(false); abortRef.current?.abort(); }
  }, [open]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', text: msg };
    const aiPlaceholder: ChatMsg = {
      id: `tmp-${Date.now()}`, role: 'assistant', status: 'streaming',
      text: '', toolCalls: [], agent,
    };
    setMessages(m => [...m, userMsg, aiPlaceholder]);
    setInput('');
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamChat(
        { message: msg, agent, conversation_id: conversationId,
          workspace_id: routeCtx.workspace_id, route_context: routeCtx },
        { onFrame: (f) => setMessages(prev => {
            const next = applyFrame(prev, f);
            if (f.event === 'done') setConversationId(f.data.conversation_id);
            return next;
          })
        },
        ctrl,
      );
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setMessages(prev => applyFrame(prev, { event: 'error', data: { message: e?.message || '请求失败' } }));
      }
    }
    setLoading(false);
    abortRef.current = null;
  }, [input, loading, agent, conversationId, routeCtx]);

  const stopGeneration = () => abortRef.current?.abort();
  const newConversation = () => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(undefined);
  };

  return (
    <>
      <div className={`overlay${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-head">
          <div><h3>AI 助手</h3></div>
          <div className="drawer-head-right">
            <button className="drawer-newchat" onClick={newConversation} title="新对话">＋</button>
            <select className="drawer-agent-select" value={agent} onChange={e => setAgent(e.target.value)}>
              {AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button className="drawer-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="drawer-body">
          {needsConfig && (
            <div className="drawer-config-warn">
              <strong>AI 助手未配置</strong><br />
              请前往 <strong>个人中心 → AI 配置</strong> 设置 API Key 和模型。
            </div>
          )}
          {messages.length === 0 && loaded && !needsConfig && (
            <div className="chat-welcome">
              <div className="cw-icon">🤖</div>
              <div className="cw-title">有什么可以帮你的？</div>
              <div className="cw-desc">我是你的 {agent} 助手。</div>
              <div className="chat-cmds">
                {SUGGESTIONS.map(s => (
                  <button key={s} className="chat-cmd" onClick={() => sendMessage(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          <div className="chat-msgs">
            {messages.map(m => <MessageView key={m.id} msg={m} userName={user?.display_name || '你'} />)}
            <div ref={bottomRef} />
          </div>
        </div>
        <div className="chat-input-area">
          <input type="text" placeholder={needsConfig ? '请先配置 AI Key...' : '输入指令，Enter 发送'}
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            disabled={loading || needsConfig} />
          {loading
            ? <button className="send-btn stop" onClick={stopGeneration}>■</button>
            : <button className="send-btn" onClick={() => sendMessage()} disabled={needsConfig}>↑</button>}
        </div>
      </div>
    </>
  );
}

function MessageView({ msg, userName }: { msg: ChatMsg; userName: string }) {
  if (msg.role === 'user') {
    return (
      <div className="chat-msg user">
        <div className="msg-label">{userName}</div>
        <div dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br>') }} />
      </div>
    );
  }
  const isStreaming = msg.status === 'streaming';
  return (
    <div className={`chat-msg ai${msg.status === 'error' ? ' error' : ''}`}>
      <div className="msg-label">{msg.agent}{isStreaming && <span className="streaming-dot"> ●</span>}</div>
      {msg.toolCalls.length > 0 && (
        <div className="tool-traces">
          {msg.toolCalls.map(tc => <ToolTraceCard key={tc.idx} trace={tc} />)}
        </div>
      )}
      {msg.text && <div dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br>') }} />}
      {msg.error && <div className="msg-error">⚠ {msg.error}</div>}
    </div>
  );
}

function ToolTraceCard({ trace }: { trace: ToolCallTrace }) {
  const [open, setOpen] = useState(trace.state === 'error');
  const icon = trace.state === 'running' ? '⏳' : trace.state === 'success' ? '✓' : '✗';
  const label = TOOL_LABELS[trace.tool] || trace.tool;
  return (
    <div className={`tool-trace ${trace.state}`}>
      <div className="tool-trace-head" onClick={() => setOpen(o => !o)}>
        <span className="tool-trace-icon">{icon}</span>
        <span className="tool-trace-label">{label}</span>
        <span className="tool-trace-toggle">{open ? '▼' : '▸'}</span>
      </div>
      {open && (
        <div className="tool-trace-body">
          <div><strong>参数:</strong> <code>{JSON.stringify(trace.args)}</code></div>
          {trace.resultSummary && <div><strong>结果:</strong> <code>{trace.resultSummary}</code></div>}
          {trace.errorMsg && <div className="tool-trace-error"><strong>错误:</strong> {trace.errorMsg}</div>}
        </div>
      )}
    </div>
  );
}

function historyToMsgs(rows: any[]): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const r of rows) {
    if (r.role === 'user') {
      out.push({ id: r.id, role: 'user', text: r.content });
    } else if (r.role === 'assistant') {
      out.push({
        id: r.id, role: 'assistant', status: 'done',
        text: r.content || '', agent: r.agent || '项目经理',
        toolCalls: (r.tool_calls || []).map((tc: any, i: number) => ({
          idx: tc.index ?? i, tool: tc.function?.name || tc.tool,
          args: parseJsonSafe(tc.function?.arguments), state: 'success' as const,
        })),
        actions: r.actions,
      });
    }
    // tool messages are folded into the preceding assistant's toolCalls when rendering
    // (visible via tool_calls already); we skip them as separate rows
  }
  return out;
}

function parseJsonSafe(s: string | undefined): Record<string, unknown> {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}
```

- [ ] **Step 2: 追加 CSS 样式到 pulse.css**

把以下追加到 `apps/web/src/styles/pulse.css` 末尾：
```css
/* AI Drawer — tool trace cards */
.tool-traces { margin: 6px 0; display: flex; flex-direction: column; gap: 4px; }
.tool-trace { border: 1px solid var(--border, #2a2f3a); border-radius: 6px; font-size: 0.85em; }
.tool-trace.error { border-color: #d04545; }
.tool-trace-head { display: flex; align-items: center; gap: 6px; padding: 4px 8px; cursor: pointer;
                   user-select: none; background: rgba(255,255,255,0.02); }
.tool-trace-icon { font-weight: bold; }
.tool-trace.running .tool-trace-icon { color: #f0b020; }
.tool-trace.success .tool-trace-icon { color: #4ad08d; }
.tool-trace.error .tool-trace-icon { color: #ef6b6b; }
.tool-trace-label { flex: 1; }
.tool-trace-toggle { opacity: 0.5; font-size: 0.8em; }
.tool-trace-body { padding: 6px 10px; border-top: 1px solid var(--border, #2a2f3a);
                   font-family: monospace; word-break: break-all; }
.tool-trace-body code { background: rgba(0,0,0,0.25); padding: 1px 4px; border-radius: 3px; }
.tool-trace-error { color: #ef6b6b; margin-top: 4px; }

.streaming-dot { color: #4ad08d; animation: pulse-streaming 1s infinite; }
@keyframes pulse-streaming { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }

.drawer-newchat { background: transparent; border: 1px solid var(--border, #2a2f3a);
                  color: inherit; padding: 2px 8px; border-radius: 4px;
                  cursor: pointer; margin-right: 6px; }
.drawer-newchat:hover { background: rgba(255,255,255,0.05); }
.send-btn.stop { background: #d04545; color: white; }
.chat-msg.ai.error { border-left: 2px solid #ef6b6b; padding-left: 8px; }
.msg-error { color: #ef6b6b; margin-top: 4px; font-size: 0.9em; }
```

- [ ] **Step 3: 类型检查 + 构建**

```bash
cd apps/web && pnpm vitest run && pnpm build
```
Expected: 全部测试 PASS + tsc/vite 构建无错。

- [ ] **Step 4: 手工冒烟测试**

```bash
# 后端如未运行：cd server && uv run uvicorn app.main:app --reload &
cd apps/web && pnpm dev
```
浏览器打开 `http://localhost:3000`：
1. 登录 → 打开 AI Drawer
2. 进入一个项目 → 发送 "查看我的待办" → 观察：
   - 工具卡片 ⏳→✓ 切换
   - 文本流式逐字出现
3. 发送 "创建任务：测试任务，赵云负责" → 多步操作：
   - 第一个工具卡片：`get_workspace_context`
   - 第二个工具卡片：`create_task`
   - 最终文本回复
4. 点 "■" 中途停止 → 流终止
5. 点 "＋" 新对话 → 历史清空、conversationId 重置
6. 刷新页面 → Drawer 重新打开 → 历史回放（含工具卡片）

如果任何一步异常：检查浏览器 Network → `/api/ai/chat-stream` 的响应是否 SSE、后端日志是否报错。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Layout/AiDrawer.tsx apps/web/src/styles/pulse.css
git commit -m "feat(ai-web): streaming Drawer with tool trace cards, stop/new-chat buttons"
```

- [ ] **Step 6: 最终回归 — 跑前后端所有测试**

```bash
cd server && uv run pytest -q
cd ../apps/web && pnpm vitest run
```
Expected: 全部 PASS。

- [ ] **Step 7: 整体 Commit / 标签（可选）**

```bash
git log --oneline -n 11   # 应该看到 task 1..11 各一次 commit
```

---

## 自查清单（实施完成后）

- [ ] 后端：alembic upgrade head 成功；`ai_pm.db` 有 3 个新字段
- [ ] 后端：`POST /api/ai/chat` 返回 404
- [ ] 后端：`POST /api/ai/chat-stream` 返回 `text/event-stream`，包含 `event: delta`、`event: done`
- [ ] 后端：`pytest -q` 全绿
- [ ] 前端：`pnpm vitest run` 全绿；`pnpm build` 无错
- [ ] UI：流式响应可见（逐字出）
- [ ] UI：工具卡片折叠/展开正常，error 默认展开
- [ ] UI："■ 停止"按钮在发送中显示，点击立即终止
- [ ] UI："＋ 新对话"按钮清空当前会话
- [ ] UI：刷新浏览器后历史完整回放（含工具卡片）
- [ ] 在项目页 → AI 知道"当前项目"（无需复制 ID）
- [ ] 在任务详情页 → AI 知道"当前任务"

---

## 范围外（后续 spec 处理）

- 主动信号 / 风险预警（SignalBar 仍是 mock）
- AI Agent 主动执行模式（任务指派给 Agent → Review 队列）
- 知识库整理 / 文档摘要
- LLM 配置 per-workspace override
- DeepSeek-R1 reasoning content 展示

