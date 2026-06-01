# AI-PM Plan 3 — AI 引擎 实施计划

> **Prerequisite:** Plan 2 任务系统基本可用（Agent 需要任务来执行），Plan 2.5 Hermes 技术验证通过，LLM 服务可访问（DeepSeek/Qwen）或可使用 Mock LLM 开发
> **Goal:** 构建 AI 核心差异化。LLM 网关统一路由本地模型，Hermes Agent 运行 4 种 Agent 角色，Memory 系统（热/温/冷三层 + MySQL FULLTEXT）持久化跨项目知识，OpenSpec 项目宪法约束 AI 行为，AI 对话页完整可用。

**Duration:** 10-12 周（50-60 个工作日）

**开发策略：** AI 模块为独立 `server/app/ai/` 包。架构采用 FastAPI + Hermes Agent 协作模式（设计规范 §6.2）：FastAPI 通过 HTTP API 调度 Hermes 独立进程/容器，同步调用处理简单查询，异步调用处理长任务，Webhook 回调/轮询通知产出就绪。Agent 执行期间可用 Mock LLM 屏蔽网络依赖。

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

## Week 3-4: Hermes Agent 执行器

### Task 3.2.1: Hermes 集成层（HTTP API 客户端）

> **依托框架：** Hermes Agent 作为独立容器运行，提供 HTTP API 接收任务、执行 Agent 并回调结果。本层负责 FastAPI ↔ Hermes 的 HTTP 通信，不重复造 Agent 编排逻辑。

**Files:**
- Create: `server/app/ai/hermes_client.py` — FastAPI ↔ Hermes HTTP 客户端
- Create: `server/app/ai/agent_config.py` — Agent 角色定义 + 工具绑定

```python
# server/app/ai/hermes_client.py
"""
FastAPI ↔ Hermes Agent HTTP 客户端。

Hermes 作为独立容器运行 Agent，本层负责：
1. 通过 HTTP API 创建 Agent 任务并注入三层上下文（System Prompt + OpenSpec + 热记忆）
2. 同步调用（简单查询/摘要）和异步调用（长任务）的路由
3. Hermes Webhook 回调的接收和处理（或降级为轮询模式）
"""
import httpx
import asyncio
import json
from datetime import datetime
from typing import AsyncIterator
from uuid import uuid4

from app.ai.agent_config import AGENT_ROLES
from app.ai.gateway import LLMGateway
from app.ai.memory import MemorySystem
from app.config import settings

class HermesClient:
    """通过 HTTP API 与 Hermes Agent 容器通信。"""

    def __init__(self, llm_gateway: LLMGateway, memory_system: MemorySystem):
        self.llm = llm_gateway
        self.memory = memory_system
        self._client = httpx.AsyncClient(
            base_url=settings.hermes_api_url,  # e.g. http://hermes:8080
            timeout=300.0,
        )

    async def create_agent_task(
        self, agent_role: str, workspace_id: str, task_id: str, db_session
    ) -> str:
        """通过 Hermes API 创建 Agent 任务并注入三层上下文。返回 execution_id。"""
        role_def = AGENT_ROLES[agent_role]

        # 构建三层上下文（设计规范 §6.4）
        context = await self._build_context(agent_role, workspace_id, task_id, db_session)

        execution_id = str(uuid4())
        resp = await self._client.post("/api/tasks", json={
            "execution_id": execution_id,
            "agent_role": agent_role,
            "name": role_def["name"],
            "system_prompt": context["system_prompt"],
            "memory_context": context["hot_memory"],
            "tools": role_def["tools"],
            "max_iterations": role_def.get("max_iters", 15),
            "webhook_url": f"{settings.api_base_url}/api/ai/webhook/hermes",
            "workspace_id": workspace_id,
            "task_id": task_id,
        })
        resp.raise_for_status()
        return execution_id

    async def get_task_status(self, execution_id: str) -> dict:
        """查询 Hermes 任务执行状态（轮询模式）。"""
        resp = await self._client.get(f"/api/tasks/{execution_id}")
        return resp.json()

    async def cancel_task(self, execution_id: str):
        """取消 Hermes 任务。"""
        await self._client.post(f"/api/tasks/{execution_id}/cancel")

    async def health_check(self) -> bool:
        """检查 Hermes 容器健康状态。"""
        try:
            resp = await self._client.get("/health")
            return resp.status_code == 200
        except Exception:
            return False

    async def _build_context(self, agent_role: str, workspace_id: str, task_id: str, db_session):
        """构建 Agent 三层上下文（设计规范 §6.4 和 §7.4）。

        ┌──────────────────────────────────────────┐
        │ System Prompt  │  ~1,000 tokens（角色定义）│
        │ OpenSpec        │    ~800 tokens（项目宪法）│
        │ 热记忆（摘要）  │  ~1,200 tokens（决策+状态）│
        ├──────────────────────────────────────────┤
        │ 合计            │  ~3,000 tokens           │
        └──────────────────────────────────────────┘
        """
        # Layer 1: System Prompt（角色定义 + 通用行为约束）
        system_prompt = await self._load_role_prompt(agent_role)

        # Layer 2: OpenSpec — 项目行为规范（从 .openspec/ 目录加载）
        # OpenSpec 内容写入 Hermes MEMORY.md 或作为 System Prompt 的一部分注入
        openspec = await self._load_openspec(workspace_id, db_session)
        system_prompt += f"\n\n## 项目行为规范 (OpenSpec)\n{openspec}"

        # Layer 3: 热记忆 — 当前项目关键决策 + 状态摘要
        hot_memory = await self.memory.get_hot_memory(workspace_id)

        return {
            "system_prompt": system_prompt,
            "hot_memory": hot_memory,
        }

    async def _load_openspec(self, workspace_id: str, db_session) -> str:
        """加载工作空间的 OpenSpec 核心内容。

        从知识库 .openspec/ 目录读取（设计规范 §4.3）：
        - conventions.md（代码规范）
        - agents.md（Agent 行为约束）
        - signals.md（风险信号规则）

        OpenSpec 内容精炼、变化低频，天然适合 prompt caching。
        """
        openspec_parts = []
        for filename in ["conventions.md", "agents.md", "signals.md"]:
            doc = await self._get_openspec_doc(workspace_id, filename, db_session)
            if doc:
                openspec_parts.append(doc.content)
        return "\n\n".join(openspec_parts) if openspec_parts else "使用默认项目规范。"

    async def _load_role_prompt(self, agent_role: str) -> str:
        """加载 Agent 角色 System Prompt"""
        ...
```

```python
# server/app/ai/agent_config.py
"""
Agent 角色定义 + 工具绑定。

每个 Agent 角色绑定对应工具集（MCP 协议兼容），
工具调用受双层权限约束（设计规范 §6.5）：
  - Hermes 层：工具白名单机制
  - FastAPI 层：实际操作权限校验
"""

AGENT_ROLES = {
    "ANALYST": {
        "name": "需求分析师",
        "description": "分析需求，生成 PRD 草案、用户故事、验收标准",
        "tools": ["wiki_search", "source_read", "task_query", "task_detail"],
        "output_type": "PRD 草案 / 用户故事 / 验收标准",
        "max_iters": 12,
    },
    "DESIGNER": {
        "name": "设计师",
        "description": "设计任务，生成原型草图描述、交互流程",
        "tools": ["wiki_search", "source_read", "task_query"],
        "output_type": "原型草图描述 / 交互流程",
        "max_iters": 10,
    },
    "DEVELOPER": {
        "name": "开发工程师",
        "description": "开发任务，生成代码草案、Bug 修复建议",
        "tools": ["wiki_search", "source_read", "sandbox_exec", "git_log", "git_diff"],
        "output_type": "代码草案 / Bug 修复建议",
        "max_iters": 15,
    },
    "PM": {
        "name": "项目经理",
        "description": "跟踪和报告，生成日报/周报草案、风险分析",
        "tools": ["task_query", "task_detail", "get_workspace_stats", "get_risk_signals"],
        "output_type": "日报 / 周报草案 / 风险分析",
        "max_iters": 10,
    },
}
```

### Task 3.2.2: Hermes 工具集配置（MCP 协议兼容）

> Hermes 支持 MCP 协议工具集成。本任务定义工具 Schema + 实现执行逻辑，注册到 Hermes 的工具白名单。

**Files:**
- Create: `server/app/ai/tools/__init__.py`
- Create: `server/app/ai/tools/task_tools.py`
- Create: `server/app/ai/tools/doc_tools.py`
- Create: `server/app/ai/tools/report_tools.py`

```python
# server/app/ai/tools/__init__.py
"""
Hermes MCP 兼容工具集。

每个工具实现 MCP Tool 接口，注册到 Hermes 工具白名单。
工具调用受双层权限约束（设计规范 §6.5）：
  1. Hermes 层：工具白名单（AGENT_ROLES 中定义每个角色的 tools 列表）
  2. FastAPI 层：实际操作时校验权限（如 task_update 需要 Manager+ 角色）
"""
```

3 组工具集（对应设计规范 §6.5 工具调用与命令执行）：

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

### Task 3.2.3: Agent 执行管理 API（FastAPI ↔ Hermes 协作）

> 实现设计规范 §6.2 的三种交互方式：同步调用、异步调用、Webhook 回调（降级为轮询模式）。

**Files:**
- Create: `server/app/routers/agents.py`
- Create: `server/app/services/agent_execution.py`

端点：

| 方法 | 路径 | 说明 | 交互方式 |
|------|------|------|---------|
| POST | `/api/workspaces/{ws_id}/ai/run` | 委托任务给 Agent，返回 task_id | 异步（长任务） |
| GET | `/api/workspaces/{ws_id}/ai/status` | 查询 Agent 执行状态 | 同步（轮询） |
| GET | `/api/workspaces/{ws_id}/ai/stream` | SSE 流式获取思考日志（Work-in-Public） | 同步（流式） |
| POST | `/api/workspaces/{ws_id}/ai/review` | 提交 Review 结果（通过/打回） | 同步 |
| POST | `/api/ai/webhook/hermes` | Hermes Agent Webhook 回调（Agent 产出就绪） | Webhook 回调 |
| POST | `/api/agents/{id}/tasks/{task_id}/retry` | 重试失败的执行 | 同步 |
| POST | `/api/agents/{id}/tasks/{task_id}/cancel` | 取消正在执行的 Agent 任务 | 同步 |

```python
# server/app/routers/agents.py
@router.post("/{workspace_id}/ai/run")
async def delegate_to_agent(workspace_id: str, body: DelegateRequest, db=Depends(get_db)):
    """创建 Hermes Agent 任务，异步执行。

    FastAPI → Hermes API: 创建 Agent 任务 → 注入三层上下文 → 启动执行
    返回 execution_id 用于后续查询。
    """
    client = get_hermes_client()
    execution_id = await client.create_agent_task(
        agent_role=body.agent_role,
        workspace_id=workspace_id,
        task_id=body.task_id,
        db_session=db,
    )
    return {"execution_id": execution_id, "status": "QUEUED"}

@router.post("/ai/webhook/hermes")
async def hermes_webhook(body: WebhookPayload, db=Depends(get_db)):
    """Hermes Webhook 回调：Agent 产出就绪时由 Hermes 调用。

    Hermes → Webhook → FastAPI → 写入 Review 队列 → 推送通知（设计规范 §6.6）
    """
    execution = await db.get(AgentExecution, body.execution_id)
    execution.status = "COMPLETED"
    execution.output = body.output
    execution.thinking_log = body.thinking_log
    execution.tokens_used = body.tokens_used
    execution.duration_ms = body.duration_ms
    execution.skill_updated = body.skill_updated  # Hermes 特有的 Skill 更新信息
    # 产出物进入 Review 队列
    await create_review_item(execution.task_id, execution.id, body.output)
    # 推送通知给任务委托者
    await notify_service.send_review_ready(execution.task_id)
    await db.commit()
    return {"status": "ok"}
```

```python
# agent_executions 表
class AgentExecution(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "agent_executions"
    agent_role: Mapped[str]     # ANALYST / DESIGNER / DEVELOPER / PM
    task_id: Mapped[str]
    workspace_id: Mapped[str]
    status: Mapped[str]  # QUEUED / RUNNING / COMPLETED / FAILED / REJECTED
    input: Mapped[dict] = mapped_column(JSON)
    output: Mapped[dict] = mapped_column(JSON, nullable=True)
    output_document_id: Mapped[str] = mapped_column(nullable=True)
    thinking_log: Mapped[str] = mapped_column(Text, nullable=True)  # ReAct 推理日志
    reject_reason: Mapped[str] = mapped_column(Text, nullable=True)  # 打回原因
    tokens_used: Mapped[int] = mapped_column(default=0)
    duration_ms: Mapped[int] = mapped_column(default=0)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
```

### Task 3.2.4: 前端 — 委托任务给 Agent + Work-in-Public 透明执行

**Files:**
- Create: `apps/web/src/components/agent/AgentDelegation.tsx`
- Create: `apps/web/src/components/agent/ExecutionMonitor.tsx`

- [ ] **委托界面：** 任务分配下拉框增加 AI Agent 选项（带角色图标和模型标签），对应设计规范 §6.3 的 4 个 Agent 角色和 3 个辅助档位（建议/草稿/轻量辅助）
- [ ] **确认对话框：** 显示 Agent 将做什么、使用什么模型、受什么 OpenSpec 规范约束、预计耗时
- [ ] **Work-in-Public 透明执行（设计规范 §6.8）：**
  - Agent 当前执行状态（Hermes 状态机：准备中 → 分析中 → 生成中）
  - 推理日志流（Thought → Action → Observation 循环），SSE 实时展示
  - Agent 引用的 wiki 条目和源文档
  - Agent 的中间产出物
- [ ] **Review 操作：** 产出预览 +「接受」/「驳回（附原因）」按钮；接受后自动存入知识库
- [ ] **打回处理（设计规范 §6.6）：** 驳回时填写原因 → Hermes 重新生成，打回原因写入 Hermes Session Archive + 自定义记忆系统

---

## Week 5-7: 记忆系统（热/温/冷三层） + 关键词检索

> **MVP 策略（设计规范 §7.5）：** 人工标注 + AI 辅助格式化，非全自动摘要。MySQL FULLTEXT 关键词检索，非向量语义搜索。向量化延后至 V1.1。

### Task 3.3.1: 记忆系统核心（三层架构）

**Files:**
- Create: `server/app/ai/memory.py`
- Create: `server/app/models/project_memory.py`

设计规范 §7.2 定义的三层记忆架构：

```
第 0 层：即时上下文（当前 Agent 会话窗口内，~14K tokens）
第 1 层：热记忆（结构化摘要，每次 AI 调用时注入，~1,200 tokens）
  ├─ 项目关键决策记录（谁在什么时候决定了什么、为什么）
  ├─ 当前迭代状态摘要（进度、阻塞、风险）
  ├─ 最近 50 条重要变更
  └─ Agent 执行历史（最近任务的执行反馈链，含打回记录）

第 2 层：温记忆（MySQL FULLTEXT 按需检索）
  ├─ 历史任务及其解决方案
  ├─ 知识库文档索引
  ├─ 历史讨论和评论
  └─ 经验教训记录

第 3 层：冷记忆（归档，稀疏访问）
  └─ 已完成项目的完整历史（仅在明确需要时才检索）
```

```python
# server/app/models/project_memory.py
class ProjectMemory(Base, TimestampMixin, UUIDMixin):
    """项目记忆表。存储结构化摘要，支持 MySQL FULLTEXT 关键词检索。"""
    __tablename__ = "project_memories"

    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"))
    layer: Mapped[str] = mapped_column(String(10), default="WARM")  # HOT / WARM / COLD
    category: Mapped[str]   # DECISION / STATUS / CHANGE / LESSON / AGENT_EXECUTION
    title: Mapped[str] = mapped_column(String(500))
    summary_short: Mapped[str] = mapped_column(String(300), nullable=True)   # ~50 tokens
    summary_medium: Mapped[str] = mapped_column(Text, nullable=True)         # ~200 tokens
    summary_detailed: Mapped[str] = mapped_column(Text, nullable=True)       # ~500 tokens
    source_type: Mapped[str]  # TASK / DOCUMENT / COMMENT / AGENT_EXECUTION / MANUAL
    source_id: Mapped[str] = mapped_column(nullable=True)
    is_pinned: Mapped[bool] = mapped_column(default=False)  # 用户标记"记住这个"
    is_expired: Mapped[bool] = mapped_column(default=False)  # 冲突检测后标记过期
    tags: Mapped[list] = mapped_column(JSON, default=list)

# MySQL FULLTEXT 索引（支持中文 ngram）
# ALTER TABLE project_memories ADD FULLTEXT INDEX ft_memories
#   (title, summary_short, summary_medium) WITH PARSER ngram;
```

```python
# server/app/ai/memory.py
class MemorySystem:
    """三层记忆架构（设计规范 §7.2-§7.5）。

    MVP 阶段：
    - 热记忆：人工标注 + AI 辅助格式化
    - 温记忆：MySQL FULLTEXT 关键词检索
    - Token 预算静态分配（§7.4）
    """

    # Token 预算（设计规范 §7.4）
    TOKEN_QUOTA = {
        "system_prompt": 1000,
        "openspec": 800,
        "hot_memory": 1200,
        "task_context": 2000,
        "retrieval_results": 3000,
        "compressed_history": 2000,
        "output_reserved": 4000,
    }

    def __init__(self, db_session):
        self.db = db_session

    async def get_hot_memory(self, workspace_id: str) -> dict:
        """获取热记忆：当前迭代状态 + 关键决策 + 最近变更 + Agent 执行历史。

        这些内容每次 AI 调用时注入 System Prompt，token 预算 ~1,200。
        """
        memories = await self.db.execute(
            select(ProjectMemory).where(
                ProjectMemory.workspace_id == workspace_id,
                ProjectMemory.layer == "HOT",
                ProjectMemory.is_expired == False,
            ).order_by(ProjectMemory.created_at.desc()).limit(50)
        )
        return self._format_memories(memories.scalars().all())

    async def mark_hot(self, workspace_id: str, category: str, title: str,
                       content: str, source_type: str, source_id: str = None):
        """人工标注热记忆（MVP 核心操作）。

        人在关键节点标记"记住这个" → AI 辅助格式化为结构化摘要。
        设计规范 §7.3 第 1 行策略：人工标注 + AI 辅助。
        """
        # AI 辅助生成多级摘要
        short, medium = await self._ai_summarize(title, content)
        memory = ProjectMemory(
            workspace_id=workspace_id,
            layer="HOT",
            category=category,
            title=title,
            summary_short=short,     # ~50 tokens
            summary_medium=medium,   # ~200 tokens
            summary_detailed=content, # ~500 tokens
            source_type=source_type,
            source_id=source_id,
            is_pinned=True,
        )
        self.db.add(memory)
        await self.db.commit()

    async def search_warm(self, workspace_id: str, query: str, k: int = 5) -> list:
        """温记忆关键词检索（MySQL FULLTEXT + ngram）。

        V1.1 升级为向量化语义检索（设计规范 §7.5）。
        """
        # MySQL FULLTEXT 布尔模式搜索
        result = await self.db.execute(
            select(ProjectMemory).where(
                ProjectMemory.workspace_id == workspace_id,
                ProjectMemory.layer.in_(["WARM", "HOT"]),
                ProjectMemory.is_expired == False,
                func.match(
                    ProjectMemory.title,
                    ProjectMemory.summary_short,
                    ProjectMemory.summary_medium,
                ).against(query),
            ).order_by(
                func.match(
                    ProjectMemory.title,
                    ProjectMemory.summary_medium,
                ).against(query).desc()
            ).limit(k)
        )
        return result.scalars().all()

    async def _ai_summarize(self, title: str, content: str) -> tuple[str, str]:
        """AI 辅助生成结构化摘要（非全自动 — 由人触发）。

        生成 2 级：一句话（~50 tokens）/ 段落（~200 tokens）。
        详细级（~500 tokens）由 content 直接存储。
        V1.1 增加第 3 级自动摘要生成。
        """
        ...

    def _format_memories(self, memories: list) -> dict:
        """格式化热记忆为 prompt 可注入的结构"""
        ...
```

### Task 3.3.2: 关键词检索配置

- [ ] MySQL FULLTEXT 索引创建（ALTER TABLE ... ADD FULLTEXT INDEX ... WITH PARSER ngram）
- [ ] 中文分词测试（验证 ngram parser 对「数据库设计」「延期预警」等词的分词质量）
- [ ] 相关性排序测试：存入 20 条模拟记忆 → 关键词搜索 → 验证排序合理
- [ ] **延后至 V1.1：** ChromaDB 向量化语义检索 + sentence-transformers 嵌入

### Task 3.3.3: 人工标注流程（MVP 核心）

| 触发方式 | 操作 | 说明 |
|---------|------|------|
| 用户手动触发「记住这个」 | UI 按钮 → 弹出标注表单 | 在任务详情/文档详情中操作，选类型 + 确认摘要 |
| 任务状态变更 | 提示"是否记录为关键决策？" | 仅当任务为 Epic 级别或有关键词匹配时提示 |
| Agent 执行完成 | 人 Review 通过后提示捕获 | 打回记录自动写入（失败学习 §6.9） |
| PM 周报生成 | 询问"是否保存为项目经验？" | 周报中的关键结论可转为记忆 |

- [ ] 前端「记住这个」按钮（星形图标，hover 提示"添加为项目记忆"）
- [ ] 标注表单：标题 + 摘要（AI 预填，人可编辑）+ 类型选择 + 标签
- [ ] 记忆列表页（按时间倒序、按类型筛选、搜索、固定/取消固定）

### Task 3.3.4: Token 预算管理

```python
# server/app/ai/token_budget.py
class TokenBudget:
    """静态分配 token 预算（设计规范 §7.4）。V1.1 升级为动态分配。"""

    def build_context(self, workspace_id: str, task_id: str = None) -> dict:
        """构建 AI 调用上下文，按配额注入各层内容。"""
        context = {
            "system_prompt": self._load_system_prompt(),        # ~1,000 tokens
            "openspec": self._load_openspec(workspace_id),      #   ~800 tokens
            "hot_memory": self.memory.get_hot_memory(ws_id),    # ~1,200 tokens
            "task_context": self._load_task(task_id),            # ~2,000 tokens
            "retrieval": self.memory.search_warm(ws_id, query), # ~3,000 tokens
        }
        self._validate_budget(context)  # 超限时截断
        return context
```

### Task 3.3.5: 风险预警系统

```python
async def detect_risks(self, workspace_id: str) -> list[dict]:
    """自动扫描风险信号（设计规范 §2.2）。

    检查：延期/阻塞/过载/逾期未更新，匹配 OpenSpec signals.md 中的自定义规则。
    """
    risks = []
    # 系统内置规则
    risks += await self._check_overdue_tasks(workspace_id)
    risks += await self._check_blocked_tasks(workspace_id)
    risks += await self._check_member_overload(workspace_id)
    # OpenSpec 自定义规则（signals.md）
    custom_rules = await self._load_openspec_signals(workspace_id)
    risks += await self._check_custom_rules(workspace_id, custom_rules)
    return risks
```

---

## Week 8-10: AI 对话 + OpenSpec 集成 + 端到端测试

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
- [ ] Prompt 渲染：提供变量 → 验证模板插值结果正确（含 OpenSpec 注入）
- [ ] Hermes 集成：用 Mock LLM 驱动 Hermes Agent 完成完整 Thought→Action→Observation 循环 → 验证 Webhook 回调
- [ ] 工具调用：Hermes Agent 正确选择 MCP 工具 → 执行成功 → 结果反馈
- [ ] 三层上下文注入：System Prompt + OpenSpec + 热记忆 正确注入 Hermes Agent
- [ ] 热记忆保存：人工触发"记住这个" → AI 辅助生成 2 级摘要 → 验证 MySQL FULLTEXT 可搜索
- [ ] 温记忆搜索：「类似项目延期经验」关键词 → 返回相关记忆（MySQL ngram 分词）
- [ ] AI 对话：发送消息 → SSE 流式返回 → Markdown 渲染 → 会话历史持久化
- [ ] AI 日报：手动触发 → PM Agent 查询任务数据 → 生成结构化日报
- [ ] Agent 委托→执行（ReAct 透明可见）→产出→Review（通过/打回）全流程走通
- [ ] 打回学习：驳回 Agent 产出 → 打回原因写入 Hermes Session Archive + 自定义记忆系统 → 后续任务引用

**预计总工时：10-12 周（50-60 个工作日）**
