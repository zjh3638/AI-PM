# AI 对话能力深化升级 — 设计文档

> 日期：2026-06-22 | 状态：Spec 待评审 | 范围：Phase A All-in 重构

## 0. 背景与目标

AI PM 平台已有 AI 对话能力（右上角 "AI" / Ctrl+K 唤起 Drawer），支持 4 个 Agent 角色与 6 个工具调用。但当前体验存在 4 个核心问题，阻碍 AI 真正提升项目管理效率：

1. **等待感**：用户发出指令后只看到"思考中…"，LLM 全部生成完成才一次性返回，多轮 tool 调用场景下要等 5-15 秒。
2. **跨轮失忆**：前端只把历史的 `{role, content}` 回传给后端，OpenAI 协议要求的 `tool_calls`/`tool` 消息序列被丢弃。多步操作时 AI "忘了刚刚做过什么"。
3. **盲操作**：用户每次都要复制粘贴项目 ID/任务 ID 给 AI，AI 不知道用户当前在哪个页面、看哪个项目。
4. **工具调用不透明**：tool 调用过程只显示一个 ✓ chip，参数和结果完全黑盒。

**目标**：一次性重构，把 AI Drawer 升级为流式、有上下文、可追溯的真正提效工具。

**不在范围**：主动信号 / 风险预警 / AI 辅助执行（任务指派给 Agent）/ 知识整理。这些是后续 spec。

## 1. 范围

本次设计覆盖 4 项改动，All-in 一次性交付：

| # | 改进项 | 解决的问题 |
|---|---|---|
| 1 | 流式响应（SSE） | 等待感 |
| 2 | 跨轮 tool_calls/tool 消息完整持久化 | 跨轮失忆 |
| 3 | 隐式上下文注入（永久 + 路由感知） | 盲操作 |
| 4 | 工具调用过程可视化 | 不透明 |

附带改动：
- 删除旧 `POST /api/ai/chat` 端点（被新端点完全替代）。
- 添加"停止生成"、"新对话" UI 按钮。
- 修复已发现的 OpenAI 协议 bug（并行 tool_calls 已在前序 commit 修复）。

## 2. 架构变更

### 2.1 后端：从同步 chat() 到流式 chat_stream()

**当前**：`chat()` 是 `async def → dict`，await 多轮 LLM 调用后一次性返回 `{reply, actions}`。

**目标**：`chat_stream()` 是 `async generator`，逐事件 yield SSE 帧；FastAPI 端点用 `StreamingResponse` 包装。

```
Client (fetch+ReadableStream)
    ↓ POST /api/ai/chat-stream  body={message, agent, conversation_id?, route_context}
FastAPI Endpoint
    ↓ async for ev in chat_stream(...): yield ev
chat_stream() async generator
    ↓ httpx.AsyncClient().stream(...) → LLM (DeepSeek/Qwen, OpenAI-compatible)
    ↓ 累积 delta → yield SSE events
    ↓ 遇到 tool_calls → 执行 tool → yield trace → 再次 stream LLM
    ↓ 最终持久化完整 messages 序列
```

### 2.2 数据库：chat_history 扩展

新 alembic revision，加 3 个可空字段 + 1 个索引：

| 字段 | 类型 | 说明 |
|---|---|---|
| `tool_calls` | JSON | assistant 消息里的 tool_calls 数组 |
| `tool_call_id` | VARCHAR(64) | role=tool 消息的对应 ID |
| `conversation_id` | VARCHAR(36) (indexed) | 同一次对话的所有消息共享 |

`role` 字段值扩展到 `user / assistant / tool`。

旧数据 `conversation_id NULL` —— 加载时作为 fallback 按 user + 时间序排，不破坏老消息可读性。

### 2.3 前端：Drawer 状态机重构

`messages: Message[]` 升级为结构化 `ChatMsg[]`，每条 assistant 消息有 `status: 'streaming' | 'done' | 'error'` 和 `toolCalls: ToolCallTrace[]`。SSE 帧到达后通过 reducer-style 更新最后一条消息。

## 3. SSE 事件协议

新端点 `POST /api/ai/chat-stream` 返回 `Content-Type: text/event-stream`，含 `X-Accel-Buffering: no`（禁反代缓冲）。

| 事件名 | data 字段 | 触发时机 |
|---|---|---|
| `delta` | `{content: string}` | LLM 文本 token 增量 |
| `tool_call_start` | `{idx: int, tool: string, args: object}` | tool_calls 协议拼接完整、即将执行 |
| `tool_call_result` | `{idx: int, result_summary: string, error?: string}` | tool 执行完成 |
| `error` | `{message: string}` | LLM 调用失败 / tool 异常 |
| `done` | `{message_id: string, conversation_id: string, actions: []}` | 整轮对话结束 |

`result_summary` 是 `json.dumps(result)[:200]`，避免上下文爆炸；完整 result 入库 `tool_actions`。

## 4. 后端实现要点

### 4.1 chat_stream() 核心循环

```python
async def chat_stream(db, user, message, agent, conversation_id, route_context):
    messages = await build_messages(db, user, conversation_id, route_context, agent, message)
    actions, full_reply = [], ""
    conv_id = conversation_id or new_uuid()

    for round_idx in range(MAX_TOOL_ROUNDS):
        tool_calls_acc = {}      # 按 index 累积流式 tool_calls
        content_acc = ""

        async with httpx.AsyncClient(timeout=60).stream(
            "POST", f"{gateway_url}/chat/completions",
            headers=..., json={**body, "stream": True}
        ) as resp:
            async for chunk in parse_sse_stream(resp):
                if chunk == "[DONE]": break
                delta = chunk["choices"][0]["delta"]
                if delta.get("content"):
                    content_acc += delta["content"]
                    yield sse("delta", {"content": delta["content"]})
                if delta.get("tool_calls"):
                    accumulate_tool_calls(tool_calls_acc, delta["tool_calls"])

        if not tool_calls_acc:                # 纯文本回复终态
            full_reply = content_acc
            break

        tool_calls = sorted(tool_calls_acc.values(), key=lambda x: x["index"])
        messages.append({
            "role": "assistant",
            "tool_calls": tool_calls,
            "content": content_acc or None,
        })

        for tc in tool_calls:
            yield sse("tool_call_start", {"idx": tc["index"], "tool": tc["function"]["name"], "args": json.loads(tc["function"]["arguments"] or "{}")})
            try:
                result = await execute_tool(db, user, tc, route_context.get("workspace_id"))
                actions.append({"tool": tc["function"]["name"], "args": ..., "result": result})
                yield sse("tool_call_result", {"idx": tc["index"], "result_summary": json.dumps(result, ensure_ascii=False)[:200]})
            except Exception as exc:
                result = {"error": str(exc)}
                yield sse("tool_call_result", {"idx": tc["index"], "error": str(exc)})
            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(result, ensure_ascii=False),
            })
    else:
        # MAX_TOOL_ROUNDS 用尽：追加 user 消息要求总结、再 stream 一轮
        messages.append({"role": "user", "content": "请用简短的中文总结以上操作结果。"})
        async for ev, partial in _final_stream(messages):
            yield ev
            full_reply += partial

    message_id = await persist_chat(db, user, conv_id, agent, messages, full_reply, actions)
    yield sse("done", {"message_id": message_id, "conversation_id": conv_id, "actions": actions})
```

### 4.2 流式 tool_calls 累积

OpenAI 流式协议下 `delta.tool_calls` 是分片到达的：

- `id` 和 `function.name` 只在第一片出现
- `function.arguments` 分多片，需要 string concat
- 多个 tool_calls 用 `index` 区分

实现：
```python
def accumulate_tool_calls(acc: dict, delta_tcs: list):
    for tc in delta_tcs:
        idx = tc["index"]
        if idx not in acc:
            acc[idx] = {"index": idx, "id": "", "type": "function",
                        "function": {"name": "", "arguments": ""}}
        if tc.get("id"): acc[idx]["id"] = tc["id"]
        fn = tc.get("function", {})
        if fn.get("name"): acc[idx]["function"]["name"] = fn["name"]
        if fn.get("arguments"): acc[idx]["function"]["arguments"] += fn["arguments"]
```

### 4.3 SSE 帧格式

```python
def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
```

### 4.4 隐式上下文注入

```python
def build_system_prompt(agent: str, user: User, route_context: dict | None) -> str:
    base = SYSTEM_PROMPTS.get(agent, SYSTEM_PROMPTS["项目经理"])
    ctx_lines = [
        f"用户：{user.display_name}（{user.system_role}）",
        f"日期：{date.today().isoformat()}",
    ]
    if route_context:
        page_label = PAGE_LABELS.get(route_context.get("page_type"), "未知")
        ctx_lines.append(f"所在页：{page_label}")
        if route_context.get("workspace_name"):
            ctx_lines.append(f"项目：{route_context['workspace_name']} (id={route_context.get('workspace_id')})")
        if route_context.get("workspace_tab"):
            ctx_lines.append(f"当前 tab：{route_context['workspace_tab']}")
        if route_context.get("task_title"):
            ctx_lines.append(f"选中任务：{route_context['task_title']} (id={route_context.get('task_id')})")
        if route_context.get("filters"):
            ctx_lines.append(f"筛选：{format_filters(route_context['filters'])}")
    return base + "\n\n【当前上下文】\n" + "\n".join(f"- {l}" for l in ctx_lines)
```

`route_context` 序列化后裁至 ~500 token 上限，超出截断 filters 部分。

### 4.5 历史加载与持久化

加载逻辑：`GET /api/ai/chat-history?conversation_id=latest_or_specific`

- `latest`：取当前用户最新 `conversation_id` 对应的所有消息
- 显式 ID：取该 ID 对应消息
- 单 conversation 上限 50 条 messages（约 5-6 轮 tool 调用，足以保留上下文且不爆 token）
- 老数据 `conversation_id IS NULL` → 按 user + created_at 取最近 50 条

持久化：`persist_chat()` 一次写入本轮**新增**的消息（user + assistant + tool 消息，**不重复写历史中已存在的消息**）。

### 4.6 取消与错误处理

服务端 endpoint：
```python
@router.post("/chat-stream")
async def ai_chat_stream(req: ChatStreamRequest, db, user) -> StreamingResponse:
    async def gen():
        try:
            async for ev in chat_stream(db, user, **req.dict()):
                yield ev
        except asyncio.CancelledError:
            await persist_partial(...)   # 已生成的 content 截断入库
            raise
        except Exception as exc:
            yield sse("error", {"message": str(exc)})
    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})
```

错误矩阵：

| 场景 | 行为 |
|---|---|
| LLM 网关 401/403 | `error` 事件 + 前端引导到个人中心 |
| LLM 网关 5xx / 超时 | `error` 事件 + 文案"网关暂时不可用"；partial reply 保留入库 |
| 客户端断开 | `CancelledError` → 持久化 partial → 静默结束 |
| Tool 抛异常 | `tool_call_result` 带 `error`、UI 标红展开；继续后续轮 |
| Tool args JSON 解析失败 | args 当 `{}`、result `{"error":"参数解析失败"}` |
| MAX_TOOL_ROUNDS 用尽 | 追加 "请总结" user 消息 + 再 stream 一轮纯文本 |

## 5. 前端实现要点

### 5.1 ChatMsg 类型

```ts
type ChatMsg =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'assistant';
      status: 'streaming' | 'done' | 'error';
      text: string;
      toolCalls: ToolCallTrace[];
      agent: string;
      error?: string;
    };

type ToolCallTrace = {
  idx: number;
  tool: string;
  args: Record<string, unknown>;
  state: 'running' | 'success' | 'error';
  resultSummary?: string;
  errorMsg?: string;
};
```

### 5.2 SSE 消费

`EventSource` 不支持 POST body，用 `fetch` + `ReadableStream`：

```ts
const ctrl = new AbortController();
const resp = await fetch('/api/ai/chat-stream', {
  method: 'POST',
  signal: ctrl.signal,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, agent, conversation_id, route_context }),
});
if (!resp.ok || !resp.body) throw new Error('stream failed');

const reader = resp.body.getReader();
const decoder = new TextDecoder();
let buf = '';
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  let i;
  while ((i = buf.indexOf('\n\n')) !== -1) {
    const frame = buf.slice(0, i);
    buf = buf.slice(i + 2);
    dispatchFrame(parseSSEFrame(frame));
  }
}
```

`parseSSEFrame` 解析 `event: <name>\ndata: <json>` 行。`dispatchFrame` 调 reducer 更新 messages。

### 5.3 Reducer 设计

```ts
function applyFrame(messages: ChatMsg[], frame: SSEFrame): ChatMsg[] {
  const last = messages[messages.length - 1];
  if (last?.role !== 'assistant') return messages;
  switch (frame.event) {
    case 'delta':
      return replaceLast(messages, { ...last, text: last.text + frame.data.content });
    case 'tool_call_start':
      return replaceLast(messages, {
        ...last,
        toolCalls: [...last.toolCalls, { idx: frame.data.idx, tool: frame.data.tool, args: frame.data.args, state: 'running' }],
      });
    case 'tool_call_result':
      return replaceLast(messages, {
        ...last,
        toolCalls: last.toolCalls.map(tc =>
          tc.idx === frame.data.idx
            ? { ...tc, state: frame.data.error ? 'error' : 'success', resultSummary: frame.data.result_summary, errorMsg: frame.data.error }
            : tc
        ),
      });
    case 'done':
      return replaceLast(messages, { ...last, status: 'done', id: frame.data.message_id });
    case 'error':
      return replaceLast(messages, { ...last, status: 'error', error: frame.data.message });
  }
  return messages;
}
```

### 5.4 useRouteContext hook

```ts
export function useRouteContext(): RouteContext {
  const loc = useLocation();
  const params = useParams();
  const { current: workspace } = useWorkspaceStore();
  // 模式匹配 location.pathname:
  //   /workspaces/:id/kanban → workspace_detail + workspace_tab=kanban
  //   /workspaces/:id/tasks/:taskId → task_detail + task_id + task_title
  //   /dashboard → dashboard
  //   /personal → personal
  //   /settings → admin
  //   /project-groups/:id → project_group
  return useMemo(() => deriveCtx(loc.pathname, params, workspace), [loc.pathname, params, workspace]);
}
```

### 5.5 工具调用 UI

```
🔧 创建任务   ⏳ 进行中…
🔧 创建任务   ✓ 完成 0.4s             [▸ 展开]
   ├─ 参数: {"title":"登录模块开发","priority":"HIGH","assignee_id":"赵云"}
   └─ 结果: {"id":"task-abc123","title":"登录模块开发","status":"TODO",...}
🔧 创建任务   ✗ 失败              [▼ 已展开]
   ├─ 参数: {...}
   └─ 错误: assignee_id 不在成员列表中
```

- 默认折叠（一行：图标 + 工具中文名 + 状态）
- 点击展开看参数和结果
- error 状态默认展开 + 标红边框

### 5.6 停止 & 新对话按钮

- 发送中：发送按钮变为"■ 停止"，点击调用 `ctrl.abort()`
- Drawer header 加"➕ 新对话"按钮：清空 messages 状态、`setConversationId(undefined)`、下次发消息后端生成新 conversation_id

### 5.7 历史加载

打开 Drawer → `GET /api/ai/chat-history?conversation_id=latest` → 渲染为只读历史（tool 消息也展示为卡片）。新消息从 latest 续写。

## 6. 数据库迁移

`server/alembic/versions/<rev>_chat_history_extensions.py`：

```python
def upgrade() -> None:
    op.add_column("chat_history", sa.Column("tool_calls", sa.JSON, nullable=True))
    op.add_column("chat_history", sa.Column("tool_call_id", sa.String(64), nullable=True))
    op.add_column("chat_history", sa.Column("conversation_id", sa.String(36), nullable=True))
    op.create_index("ix_chat_history_conversation_id", "chat_history", ["conversation_id"])

def downgrade() -> None:
    op.drop_index("ix_chat_history_conversation_id", "chat_history")
    op.drop_column("chat_history", "conversation_id")
    op.drop_column("chat_history", "tool_call_id")
    op.drop_column("chat_history", "tool_calls")
```

老数据兼容：`conversation_id NULL` 时按 user + created_at 取最近 50 条（与现行逻辑一致）。

## 7. 测试策略

### 后端 (pytest)

| 用例 | 验证点 |
|---|---|
| `test_chat_stream_text_only` | 无 tool 调用，delta 累积正确、done 事件含 message_id |
| `test_chat_stream_with_tool` | mock LLM 第一轮 tool_calls + 第二轮文本；事件序列、actions、messages 持久化结构 |
| `test_chat_stream_parallel_tools` | 单轮 2 个并行 tool_calls，两次 tool_call_result 都发出 |
| `test_chat_stream_tool_error` | tool 抛异常，error 写入 result_summary、流继续 |
| `test_chat_stream_cancel` | 模拟 client disconnect，已生成的 partial content 截断入库 |
| `test_chat_history_with_tool_calls` | 扩展字段序列化/反序列化对称 |
| `test_route_context_injected_into_prompt` | system_prompt 末尾含【当前上下文】块 |

### 前端 (vitest)

| 用例 | 验证点 |
|---|---|
| `test_sse_parser` | 分片 chunk 切帧正确 |
| `test_chat_reducer_delta` | delta 累加到最后一条 assistant 消息 |
| `test_chat_reducer_tool_lifecycle` | start → result(success) / start → result(error) 状态机正确 |
| `test_route_context_hook` | 各路由 path → 期望的 context 对象 |

### E2E (Playwright, 可选 1 条 happy path)

登录 → 进项目 → Ctrl+K → 发"创建测试任务" → 看到流式输出 + 工具卡片 → done。

## 8. 性能与限制

- `MAX_TOOL_ROUNDS = 3`（保持现行值）
- `route_context` 序列化后裁至 ~500 token，超出截断 filters
- `tool_call_result.result_summary = json.dumps(result, ensure_ascii=False)[:200]`
- 单 conversation 加载上限 50 条 messages
- httpx stream timeout 保持 60s

## 9. 实施顺序（plan 阶段细化）

1. DB migration（chat_history 三个新字段 + 索引）
2. 后端 `chat_stream()` + 新端点 `POST /api/ai/chat-stream`
3. 后端 `persist_chat()` + history 加载改造 + 旧 `/chat` 端点删除
4. 前端 SSE 消费层（fetch + ReadableStream + parser）
5. 前端 reducer + ChatMsg 类型迁移
6. 前端 UI：流式渲染、工具卡片、停止按钮、新对话按钮
7. 前端 `useRouteContext` hook + 各页面接入（AppLayout 即可，hook 内部模式匹配）
8. pytest / vitest 单测 + Playwright happy path（可选）

## 10. 非目标 / 后续工作

- 主动信号 / 风险预警（顶部 SignalBar 仍是 mock，后续 spec）
- AI Agent 主动执行（任务指派给 Agent → Review 队列）
- 知识库整理 / 文档摘要
- LLM 配置的 per-workspace override（当前为 per-user）
- 流式 reasoning content（DeepSeek-R1 等模型的 thinking 段，本期不展示）
