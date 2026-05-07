# AI-PM Plan 3 — AI 引擎 实施计划

> **Prerequisite:** Plan 2 任务系统基本可用（Agent 需要任务来执行），LLM 服务可访问（DeepSeek/Qwen）或可使用 Mock LLM 开发
> **Goal:** 构建 AI 核心差异化。LLM 网关统一路由本地模型，LangGraph Agent 执行器运行 4 种 Agent 角色，Memory 系统持久化跨项目知识，AI 对话页完整可用。

**Duration:** 7 周（35 个工作日）

**开发策略：** AI 模块为独立 `server/app/ai/` 包。Agent 执行期间可用 Mock LLM 屏蔽网络依赖。

---

## Week 1-2: LLM 网关 + Prompt 管理器

### Task 3.1.1: LLM 网关核心

**Files:**
- Create: `server/app/ai/__init__.py`
- Create: `server/app/ai/gateway.py`
- Create: `server/app/ai/schemas.py`

```python
# server/app/ai/schemas.py
from pydantic import BaseModel
from typing import AsyncIterator

class LLMMessage(BaseModel):
    role: str  # system / user / assistant / tool
    content: str

class LLMRequest(BaseModel):
    model: str
    messages: list[LLMMessage]
    temperature: float = 0.7
    max_tokens: int = 4096
    stream: bool = False
    tools: list[dict] | None = None

class LLMResponse(BaseModel):
    content: str
    tool_calls: list[dict] | None = None
    tokens_used: int
    finish_reason: str
```

```python
# server/app/ai/gateway.py
import httpx
import json
from typing import AsyncIterator
from app.ai.schemas import LLMRequest, LLMResponse, LLMMessage

class LLMGateway:
    """统一 LLM 网关。支持 DeepSeek / Qwen / Tongyi，兼容 OpenAI API 格式。"""

    PROVIDERS = {
        "deepseek": "https://api.deepseek.com/v1",
        "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "tongyi": "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
    }

    def __init__(self, provider: str, api_key: str, base_url: str = None):
        self.provider = provider
        self.api_key = api_key
        self.base_url = base_url or self.PROVIDERS.get(provider)
        self._client = httpx.AsyncClient(timeout=120.0)

    async def chat(self, req: LLMRequest) -> LLMResponse:
        """非流式调用"""
        body = self._build_request(req)
        resp = await self._client.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=body,
        )
        data = resp.json()
        return LLMResponse(
            content=data["choices"][0]["message"]["content"],
            tokens_used=data["usage"]["total_tokens"],
            finish_reason=data["choices"][0]["finish_reason"],
        )

    async def chat_stream(self, req: LLMRequest) -> AsyncIterator[str]:
        """流式调用，yield 每个 token 片段"""
        body = self._build_request(req)
        body["stream"] = True
        async with self._client.stream(
            "POST", f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=body,
        ) as resp:
            async for line in resp.aiter_lines():
                if line.startswith("data: ") and line != "data: [DONE]":
                    chunk = json.loads(line[6:])
                    delta = chunk["choices"][0].get("delta", {})
                    if "content" in delta:
                        yield delta["content"]

    def _build_request(self, req: LLMRequest) -> dict:
        body = {
            "model": req.model,
            "messages": [m.model_dump() for m in req.messages],
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
            "stream": req.stream,
        }
        if req.tools:
            body["tools"] = req.tools
        return body

# 单例工厂
def get_llm_gateway(model_name: str = "deepseek-v3") -> LLMGateway:
    """根据 model_name 获取对应的网关实例"""
    if model_name.startswith("deepseek"):
        return LLMGateway("deepseek", api_key="your-api-key")
    elif model_name.startswith("qwen"):
        return LLMGateway("qwen", api_key="your-api-key")
    raise ValueError(f"Unsupported model: {model_name}")
```

端点：
- `POST /api/ai/models/test` — 测试 LLM 连通性（发送简单 ping → 验证响应）
- `GET /api/ai/models` — 已注册模型列表

### Task 3.1.2: 模型配置管理

**Files:**
- Create: `server/app/models/model_config.py`
- Create: `server/app/routers/models.py`

```python
# server/app/models/model_config.py
class ModelConfig(Base, UUIDMixin):
    __tablename__ = "model_configs"
    name: Mapped[str]           # deepseek-v3 / qwen2.5-72b
    provider: Mapped[str]       # deepseek / qwen / tongyi
    display_name: Mapped[str]   # DeepSeek-V3 / 通义千问2.5
    api_base: Mapped[str]
    api_key: Mapped[str]        # 加密存储
    max_tokens: Mapped[int] = mapped_column(default=8192)
    status: Mapped[str] = mapped_column(default="ENABLED")
    priority: Mapped[int] = mapped_column(default=0)  # 多个可用模型时的排序权重
```

前端（系统管理 — 模型管理页）：
- [ ] 模型列表（名称、提供商、API 地址、状态指示灯）
- [ ] 添加模型表单（提供商下拉、API Base URL、Key 输入框[密码遮罩]）
- [ ] 测试连接按钮 → 调用 `POST /api/ai/models/test`

### Task 3.1.3: Prompt 管理器

**Files:**
- Create: `server/app/ai/prompt_manager.py`
- Create: `server/app/models/prompt_template.py`

```python
# server/app/ai/prompt_manager.py
from jinja2 import Template

class PromptManager:
    """Prompt 模板管理。支持变量插值、版本控制、模板继承。"""

    def __init__(self, db_session):
        self.db = db_session

    async def get_template(self, name: str) -> "PromptTemplate":
        """从 DB 获取模板"""
        ...

    async def render(self, name: str, variables: dict) -> str:
        """加载模板并插值变量"""
        template = await self.get_template(name)
        tpl = Template(template.content)
        return tpl.render(**variables)

    async def create_version(self, name: str, content: str):
        """创建新版本（旧版本保留，含 created_at 时间戳）"""
        ...
```

预置模板（播种）：

| 模板名 | 用途 | 核心变量 |
|--------|------|---------|
| `agent_analyst_system` | 需求分析师 System Prompt | workspace_context |
| `agent_designer_system` | 设计师 System Prompt | workspace_context, kb_summary |
| `agent_developer_system` | 开发工程师 System Prompt | workspace_context, tech_stack |
| `agent_pm_system` | 项目经理 System Prompt | workspace_context, member_list |
| `task_prd_generation` | PRD 生成 | task_title, task_description, kb_context |
| `task_design_spec` | 设计规格生成 | task_title, prd_content |
| `task_code_review` | 代码 Review | task_title, code_changes |
| `report_daily_standup` | 每日站报 | workspace_tasks_done, workspace_tasks_plan, blockers |
| `report_risk_analysis` | 风险分析 | workspace_context, similar_project_lessons |
| `chat_general` | 通用对话 | conversation_history, user_query |

### Task 3.1.4: LLM 网关单元测试

- [ ] Mock HTTP 响应（httpx.MockTransport 或 respx）
- [ ] 验证请求格式正确（model, messages, temperature 字段齐全）
- [ ] 验证错误处理（API 返回 500、超时、网络错误 → 3 次重试后抛异常）
- [ ] 验证 SSE 流式解析正确（每个 chunk token 被正确提取）

---

## Week 3-4: Agent 执行器

### Task 3.2.1: Agent Executor 核心（LangGraph）

**Files:**
- Create: `server/app/ai/agent_executor.py`

```python
# server/app/ai/agent_executor.py
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END
from langgraph.checkpoint import MemorySaver
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    task_id: str
    agent_role: str             # ANALYST / DESIGNER / DEVELOPER / PM
    system_prompt: str
    workspace_context: dict
    current_step: str           # understand / plan / act / generate / review
    tool_results: list[dict]
    final_output: str | None

class AgentExecutor:
    """LangGraph Agent 执行器。5 节点 StateGraph 工作流。"""

    def __init__(self, llm_gateway, tool_registry, prompt_manager, memory_system):
        self.llm = llm_gateway
        self.tools = tool_registry
        self.prompts = prompt_manager
        self.memory = memory_system
        self.checkpointer = MemorySaver()
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        workflow = StateGraph(AgentState)

        workflow.add_node("understand", self._node_understand)   # 理解任务上下文
        workflow.add_node("plan", self._node_plan)               # 制定执行计划
        workflow.add_node("act", self._node_act)                 # 执行（调用工具）
        workflow.add_node("generate", self._node_generate)       # 生成最终产出
        workflow.add_node("review", self._node_review)           # 自检 Review

        workflow.set_entry_point("understand")
        workflow.add_edge("understand", "plan")
        workflow.add_conditional_edges("plan", self._should_act, {
            "act": "act",
            "generate": "generate",
        })
        workflow.add_edge("act", "plan")          # 工具结果后回到 plan 评估
        workflow.add_edge("generate", "review")
        workflow.add_edge("review", END)

        return workflow.compile(checkpointer=self.checkpointer)

    async def execute(self, task_id: str, agent_role: str, config: dict) -> AgentState:
        """执行任务。返回最终状态，含 final_output。"""
        initial_state = AgentState(
            messages=[],
            task_id=task_id,
            agent_role=agent_role,
            system_prompt=await self._load_prompt(agent_role),
            workspace_context=await self._load_context(task_id),
            current_step="understand",
            tool_results=[],
            final_output=None,
        )
        result = await self.graph.ainvoke(initial_state, config)
        return result

    async def _node_understand(self, state: AgentState) -> AgentState:
        """读取任务详情 + 知识库相关文档 → 构建完整上下文"""
        ...

    async def _node_plan(self, state: AgentState) -> AgentState:
        """分析任务，规划执行步骤"""
        ...

    async def _node_act(self, state: AgentState) -> AgentState:
        """调用工具。LLM 决定调用哪个工具 → 执行 → 记录结果"""
        ...

    async def _node_generate(self, state: AgentState) -> AgentState:
        """基于收集到的信息，生成最终输出（PRD/设计稿/代码 PR/日报）"""
        ...

    async def _node_review(self, state: AgentState) -> AgentState:
        """自检 Review：输出是否符合要求？是否需要补充？"""
        ...
```

### Task 3.2.2: 工具注册表

**Files:**
- Create: `server/app/ai/tools/__init__.py`
- Create: `server/app/ai/tools/registry.py`
- Create: `server/app/ai/tools/task_tools.py`
- Create: `server/app/ai/tools/doc_tools.py`
- Create: `server/app/ai/tools/report_tools.py`

```python
# server/app/ai/tools/registry.py
class Tool:
    name: str
    description: str
    parameters: dict  # JSON Schema

    async def execute(self, **kwargs) -> dict:
        raise NotImplementedError

class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool):
        self._tools[tool.name] = tool

    def get_openai_schemas(self) -> list[dict]:
        """转换为 OpenAI function calling 格式"""
        return [{
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
            }
        } for t in self._tools.values()]

    async def execute(self, name: str, **kwargs) -> dict:
        return await self._tools[name].execute(**kwargs)
```

3 组工具集：

**task_tools（任务操作）:**
| 工具 | 功能 | 参数 |
|------|------|------|
| `read_task` | 读取任务详情 | task_id |
| `update_task_status` | 更新任务状态 | task_id, status |
| `create_subtask` | 创建子任务 | parent_id, title, description |
| `list_workspace_tasks` | 列出工作空间任务 | workspace_id, filter |
| `add_comment` | 添加评论 | task_id, content |

**doc_tools（文档操作）:**
| 工具 | 功能 | 参数 |
|------|------|------|
| `read_document` | 读取文档内容 | doc_id |
| `create_document` | 创建文档 | workspace_id, title, content |
| `list_documents` | 列出文档 | workspace_id, type |
| `search_documents` | 搜索文档 | keyword |

**report_tools（报告生成）:**
| 工具 | 功能 | 参数 |
|------|------|------|
| `get_workspace_stats` | 获取工作空间统计 | workspace_id |
| `get_member_list` | 获取成员列表 | workspace_id |
| `get_iteration_progress` | 获取 Sprint 进度 | iteration_id |
| `get_risk_signals` | 获取风险信号 | workspace_id |

### Task 3.2.3: Agent 执行管理 API

**Files:**
- Create: `server/app/routers/agents.py`

端点：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/agents/{id}/delegate` | 委托任务给 Agent（body: `{task_id}`） |
| GET | `/api/agents/{id}/tasks/{task_id}` | 获取执行状态（QUEUED/RUNNING/COMPLETED/FAILED/REJECTED） |
| GET | `/api/agents/{id}/tasks/{task_id}/stream` | SSE 流式获取思考日志 |
| POST | `/api/agents/{id}/tasks/{task_id}/retry` | 重试失败的执行 |
| POST | `/api/agents/{id}/tasks/{task_id}/cancel` | 取消正在执行的 Agent 任务 |
| POST | `/api/agents/{id}/tasks/{task_id}/reject` | 驳回 Agent 产出（人类 Review 不通过） |
| POST | `/api/agents/{id}/tasks/{task_id}/accept` | 接受 Agent 产出 → 自动创建文档存入知识库 |

```python
# agent_executions 表
class AgentExecution(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "agent_executions"
    agent_id: Mapped[str]
    task_id: Mapped[str]
    status: Mapped[str]  # QUEUED / RUNNING / COMPLETED / FAILED / REJECTED
    input: Mapped[dict] = mapped_column(JSON)
    output: Mapped[dict] = mapped_column(JSON, nullable=True)
    output_document_id: Mapped[str] = mapped_column(nullable=True)  # 产出存入 KB 后的文档 ID
    thinking_log: Mapped[str] = mapped_column(Text, nullable=True)  # 完整思考日志
    tokens_used: Mapped[int] = mapped_column(default=0)
    duration_ms: Mapped[int] = mapped_column(default=0)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
```

### Task 3.2.4: 前端 — 委托任务给 Agent + 执行监控

**Files:**
- Create: `apps/web/src/components/agent/AgentDelegation.tsx`
- Create: `apps/web/src/components/agent/ExecutionMonitor.tsx`

- [ ] **委托界面：** 任务分配下拉框增加 AI Agent 选项（带角色图标和模型标签）
- [ ] **确认对话框：** 显示 Agent 将做什么、使用什么模型、预计耗时
- [ ] **执行监控：** 任务详情中显示 Agent 执行状态徽章 + 进度动画
- [ ] **思考日志：** 折叠面板逐步展示 understand → plan → act → generate → review 关键信息
- [ ] **Review 操作：** 产出预览 +「接受」/「驳回」按钮；接受后自动存入知识库

---

## Week 5-6: Memory 系统 + 向量搜索

### Task 3.3.1: Memory 系统核心

**Files:**
- Create: `server/app/ai/memory.py`

```python
# server/app/ai/memory.py
import chromadb
from datetime import datetime

class MemorySystem:
    """4 种记忆类型：上下文(CONTEXT) / 经验(LESSON) / 能力(CAPABILITY) / 模板(TEMPLATE)"""

    MEMORY_TYPES = ["CONTEXT", "LESSON", "CAPABILITY", "TEMPLATE"]

    def __init__(self, db_session, chroma_client: chromadb.Client):
        self.db = db_session
        self.chroma = chroma_client
        self.collection = chroma_client.get_or_create_collection("memories")

    async def save(self, workspace_id: str, type: str, title: str, content: str,
                   tags: list[str] = None, source_task_id: str = None):
        """保存记忆：MySQL 存元数据 + ChromaDB 存向量"""
        # 1. 生成 embedding
        embedding = await self._embed(content)
        # 2. 存入 ChromaDB
        self.collection.add(
            ids=[str(uuid4())],
            embeddings=[embedding],
            metadatas=[{"workspace_id": workspace_id, "type": type, "tags": json.dumps(tags or [])}],
            documents=[content],
        )
        # 3. 存入 MySQL（project_memories 表）
        ...

    async def search(self, query: str, workspace_id: str = None, type: str = None, k: int = 5) -> list:
        """语义搜索相关记忆"""
        embedding = await self._embed(query)
        where = {}
        if workspace_id: where["workspace_id"] = workspace_id
        if type: where["type"] = type
        results = self.collection.query(query_embeddings=[embedding], n_results=k, where=where)
        return results

    async def _embed(self, text: str) -> list[float]:
        """调用嵌入模型（可本地 sentence-transformers 或调用 LLM embedding API）"""
        # 开发阶段：使用简单的 TF-IDF hash 或调用 DeepSeek embedding API
        ...

    async def capture_context(self, task_id: str):
        """任务完成时自动捕获上下文记忆"""
        ...

    async def capture_lesson(self, task_id: str, lesson: str):
        """用户标记的经验教训"""
        ...

    async def recommend_assignee(self, task: dict, workspace_id: str) -> list[dict]:
        """基于能力画像推荐任务分配者"""
        ...

    async def warn_risks(self, workspace_id: str) -> list[dict]:
        """基于经验库匹配，预警当前工作空间的风险"""
        ...
```

### Task 3.3.2: 向量数据库初始化

- [ ] 安装 ChromaDB（`pip install chromadb`）
- [ ] 嵌入函数实现：优先本地 `sentence-transformers`（`bge-small-zh-v1.5`），备选 `DeepSeek API embedding`
- [ ] 测试：存入 10 条模拟记忆 → 语义搜索 → 验证相关性排序

### Task 3.3.3: Memory 自动捕获 Hooks

| 触发事件 | 捕获类型 | 内容 |
|---------|---------|------|
| 任务状态从 IN_REVIEW 变为 DONE | CONTEXT | 任务决策摘要 + 关键产出 |
| 任务被重新打开（reopened） | LESSON | 重新打开原因 + 避免建议 |
| Agent 执行完成且被接受 | TEMPLATE | Agent 输出作为可复用模板 |
| 用户驳回 Agent 产出 | CAPABILITY | 驳回原因 → 改善该 Agent 的能力画像 |
| 手动触发「保存为记忆」 | 用户选择类型 | 在任务详情/文档详情中操作 |

### Task 3.3.4: 智能分配推荐

```python
async def recommend_assignee(self, task: dict, workspace_id: str):
    """分析任务需求 → 匹配能力画像 → 推荐最佳分配者"""
    # 1. 提取任务关键词
    task_embedding = await self._embed(task["title"] + " " + task.get("description", ""))
    # 2. 搜索能力画像
    capabilities = await self.search(
        query=task["title"], workspace_id=workspace_id, type="CAPABILITY", k=10
    )
    # 3. 按匹配度排序返回候选成员
    ...
```

### Task 3.3.5: 风险预警系统

```python
async def warn_risks(self, workspace_id: str):
    """定期扫描：基于历史 LESSON 记忆，识别类似模式的风险"""
    # 1. 获取当前工作空间的关键特征（任务分布、成员结构、Sprint 进度）
    # 2. 搜索历史 LESSON 记忆中的失败/延期案例
    # 3. 匹配相似模式（关键词重合、任务类型分布相似）
    # 4. 生成风险预警项
    ...
```

### Task 3.3.6: Memory 管理 UI

- [ ] 工作空间 AI Agent 标签页中增加「记忆浏览器」
- [ ] 按类型筛选（上下文/经验/能力/模板）
- [ ] 搜索记忆内容
- [ ] 手动创建/编辑/删除记忆
- [ ] 关联记忆到任务/文档

---

## Week 7: AI 对话 + AI 面板 + 日报 + 集成

### Task 3.4.1: AI 对话后端

**Files:**
- Create: `server/app/routers/chat.py`
- Create: `server/app/services/chat.py`

```python
# server/app/services/chat.py
async def chat_with_context(
    db: AsyncSession,
    user_id: str,
    message: str,
    workspace_id: str = None,
    task_id: str = None,
    agent_role: str = "general",
):
    """构建上下文增强的对话请求"""
    messages = []
    # 1. System Prompt（Agent 角色 + 可用的工作空间知识）
    if agent_role != "general":
        system_prompt = await prompt_manager.render(f"agent_{agent_role}_system", {...})
    else:
        system_prompt = "You are a helpful AI assistant for project management."
    messages.append(LLMMessage(role="system", content=system_prompt))

    # 2. 注入上下文（可选）
    if workspace_id:
        context = await _build_workspace_context(workspace_id, db)
        messages.append(LLMMessage(role="system", content=f"Context:\n{context}"))
    if task_id:
        task_context = await _build_task_context(task_id, db)
        messages.append(LLMMessage(role="system", content=f"Task:\n{task_context}"))

    # 3. 历史消息（最近 10 轮）
    history = await _get_chat_history(user_id, session_id, limit=10)

    # 4. 调用 LLM
    return llm_gateway.chat_stream(LLMRequest(
        model=current_model,
        messages=messages + history + [LLMMessage(role="user", content=message)],
        stream=True,
    ))
```

端点：
- `POST /api/chat/sessions` — 创建会话
- `GET /api/chat/sessions` — 会话列表
- `POST /api/chat/sessions/{id}/messages` — 发送消息（SSE 流式返回）
- `GET /api/chat/sessions/{id}/messages` — 消息历史

### Task 3.4.2: AI 对话前端页

**Files:**
- Create: `apps/web/src/pages/ai-chat/AIChatPage.tsx`
- Create: `apps/web/src/components/chat/ChatMessage.tsx`
- Create: `apps/web/src/components/chat/ChatInput.tsx`

- [ ] **左侧会话列表：** 搜索 + 最近会话，显示 Agent 名称和最后消息时间
- [ ] **Agent 切换栏：** 需求分析师 / 设计师 / 开发工程师 / 项目经理 / 通用助手
- [ ] **消息流：** 用户气泡 + AI 气泡（流式逐字显示，Markdown 渲染）
- [ ] **上下文附件：** @引用知识库文档、@引用任务
- [ ] **快捷指令：** `/生成PRD` `/生成日报` `/风险分析` `/任务拆解` `/站会报告`
- [ ] **输入工具栏：** @引用、/快捷指令、上传文件

### Task 3.4.3: 工作空间 AI 面板

**Files:**
- Create: `apps/web/src/components/workspace/AIPanel.tsx`

- [ ] 工作空间详情右侧可折叠 AI 面板
- [ ] 当前工作空间上下文摘要（自动生成的项目状态）
- [ ] 快捷操作按钮：Ask Agent / 生成日报 / 总结文档
- [ ] 最近 AI 活动时间线
- [ ] 可展开为完整 AI 对话视图（继承工作空间上下文）

### Task 3.4.4: AI 日报生成

**Files:**
- Create: `server/app/services/report.py`

```python
async def generate_daily_report(workspace_id: str, db, llm_gateway):
    """生成每日站会报告"""
    yesterday_tasks = await _get_completed_tasks(workspace_id, since="yesterday")
    today_tasks = await _get_active_tasks(workspace_id)
    blockers = await _get_blocked_tasks(workspace_id)
    risks = await memory_system.warn_risks(workspace_id)

    prompt = await prompt_manager.render("report_daily_standup", {
        "yesterday_done": _format_tasks(yesterday_tasks),
        "today_plan": _format_tasks(today_tasks),
        "blockers": _format_tasks(blockers),
        "risks": risks,
    })
    return await llm_gateway.chat(LLMRequest(model="deepseek-v3", messages=[
        LLMMessage(role="user", content=prompt)
    ]))
```

- [ ] 手动触发：工作台「生成日报」按钮
- [ ] 定时触发（可选）：Schedule 在每日 9:00 自动生成
- [ ] 日报显示在工作台「AI 今日站报」卡片中

### Task 3.4.5: 端到端 AI 工作流测试

测试完整 AI Agent 执行闭环：
1. 在工作空间创建任务「设计用户登录页面的 PRD」
2. 委托给「需求分析师」Agent
3. Agent 执行（Mock LLM 或真实模型）：understand → plan → act → generate → review
4. 验证 Agent 调用了 `read_document` 工具读取已有设计文档
5. 验证 Agent 产出 PRD 文档，自动存入知识库
6. 人类 Review 产出：接受 → 文档留在知识库，Memory 捕获为 TEMPLATE
7. 人类 Review 产出：驳回 → Agent 执行记录标记为 REJECTED，Memory 捕获为 CAPABILITY 反馈

---

## 验证清单

- [ ] LLM 网关测试：Mock LLM 端点 → 验证请求格式正确 → 验证错误重试 3 次
- [ ] Prompt 渲染：提供变量 → 验证模板插值结果正确
- [ ] Agent 执行器：用 Mock LLM 驱动完整 5 节点流程 → 验证状态转换正确
- [ ] 工具调用：Agent 在 act 节点正确选择工具 → 工具执行成功 → 结果反馈到 plan
- [ ] Memory 保存：任务完成 → 自动捕获 CONTEXT 记忆 → 验证可搜索
- [ ] Memory 搜索：「类似项目延期经验」→ 返回相关 LESSON 记忆
- [ ] AI 对话：发送消息 → SSE 流式返回 → Markdown 渲染 → 会话历史持久化
- [ ] AI 日报：手动触发 → Agent 查询任务数据 → 生成结构化日报
- [ ] Agent 委托→执行→产出→Review 全流程走通

**预计总工时：7 周（35 个工作日）**
