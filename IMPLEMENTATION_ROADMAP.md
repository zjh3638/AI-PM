# AI-PM 平台 — 整体实施路线图

> 最后更新: 2026-05-07（已根据设计评审调整）

## 1. 项目定位

AI-native 项目管理平台，面向 50-200 人中型企业，核心差异化：4 个 AI Agent 角色（需求分析师 / 设计师 / 开发工程师 / 项目经理）像人类成员一样被分配任务、执行产出、接受 Review。

**技术栈：** Python FastAPI 后端 + React/Vite/Ant Design 前端 + MySQL 8 + Redis + Git(GitPython) + 本地 LLM (DeepSeek/Qwen)

---

## 2. Phase 总览

| Phase | 名称 | 周期 | 关键里程碑 |
|-------|------|------|-----------|
| Foundation | 基座：脚手架 + 认证 + 工作空间 + RBAC | 6-7 周 | 用户可登录、创建空间、RBAC 生效 |
| Plan 2 | 任务系统 + 知识库 | 8-10 周 | 完整任务管理 + Git 版本化知识库 |
| Plan 2.5 | AgentScope 技术验证 | 1-2 周 | ReActAgent 工具调用稳定、Webhook 可靠、Memory 摘要质量验证 |
| Plan 3 | AI 引擎 | 10-12 周 | AI Agent 被分配任务 → 执行 → 产出 → 人类 Review |
| Plan 4 | 协作 + 系统管理 | 6-7 周 | 全部 9 页完整可用的 MVP |

**总周期：32-36 周（约 8-9 个月，单人开发）**

### 2.1 里程碑定义

| 编号 | 里程碑 | 所属 Phase | 判定标准 |
|------|--------|-----------|---------|
| M0 | 开发环境就绪 | Foundation 前 | `pnpm dev` 启动前端(3000)，`uvicorn` 启动后端(8000)，MySQL/Redis 可连接 |
| M1 | 基座可用 | Foundation | 用户密码/企微登录 → 创建工作空间(含 OpenSpec) → 邀请成员 → 权限生效 |
| M2 | 核心 PM 可用 | Plan 2 | Epic→Story→Task 层级创建 → Kanban 拖拽 → Git 版本文档 CRUD → 全文搜索 |
| M3 | AgentScope 验证通过 | Plan 2.5 | 5 项验证全部通过，输出验证报告，Go/No-Go 决策 |
| M4 | AI 引擎可用 | Plan 3 | Agent 被委托任务 → ReAct 执行 → 产出 PRD/日报 → 人类 Review 通过/打回 |
| M5 | MVP 完整 | Plan 4 | 全部 9 页可用，通知/企微/自动化/会议大屏完整闭环 |

---

## 3. 依赖关系

```
Foundation (6-7 周)
    │
    ▼
Plan 2: 任务 + 知识库 (8-10 周)
    │
    ▼
Plan 2.5: AgentScope 技术验证 (1-2 周)
    │
    ├──────────┐
    │          │
    ▼          ▼
Plan 3:     Plan 4:
AI 引擎      协作 + 管理
(10-12 周)   (6-7 周)
    │          │
    └──────────┘
          │
          ▼
      MVP 完成
```

- **关键路径：** Foundation → Plan 2 → Plan 2.5 → Plan 3
- **可并行：** Plan 3 和 Plan 4 可在 Plan 2.5 后部分并行
- **Plan 2.5 是 P0 关卡**：验证 AgentScope 核心能力。若验证不通过，需要重新评估 AI 引擎方案

---

## 4. 前端-后端对齐矩阵

| 线框图页面 | Foundation | Plan 2 | Plan 3 | Plan 4 |
|-----------|:----------:|:------:|:------:|:------:|
| 1. 登录 | 完整实现 | -- | -- | LDAP(V1.2) |
| 2. 工作台 | 统计卡片(静态) | 任务统计、决策清单、项目关注 | AI 日报卡片 | 风险预警卡片 |
| 3. 工作空间列表 | 网格卡片、搜索、创建(模板+OpenSpec初始化) | AI 创建入口(占位) | AI 创建(真实) | -- |
| 4. 工作空间详情 | 壳 + 概览 + 成员 + OpenSpec目录 | 任务、知识、指引 | AI Agent 管理、AI 面板 | 分析、自动化、空间设置 |
| 5. 会议大屏 | -- | -- | -- | 完整实现(3 层级) |
| 6. AI 对话 | -- | -- | 完整实现 | -- |
| 7. 个人中心 | 个人信息 | 待办、Review 队列、消息 | -- | 通知偏好、已完成 |
| 8. 系统管理 | -- | -- | 模型管理 | 用户/权限/Agent/企微/系统设置 |
| 9. 需求处理流 | -- | 完整实现 | -- | -- |

---

## 5. 数据库迁移策略

- **Foundation：** 仅建认证 + 工作空间 + 用户 + 角色相关表（约 6 张：users, departments, roles, user_roles, workspaces, workspace_members）
- **Plan 2：** 建任务相关表（tasks, task_dependencies, iterations, comments, documents, requirement_inbox 等）和工作流模板表
- **Plan 3：** 建 AI 相关表（agent_executions, model_configs, project_memories, prompt_templates）；初始化 MySQL FULLTEXT 索引（向量检索延后至 V1.1）
- **Plan 4：** 建协作表（meeting_cache, notification_preferences, webhook_subscriptions, automation_rules, audit_logs）

每个 Phase 独立建表和迁移，不跨 Phase 预建表，降低早期设计锁定风险。

---

## 6. 竞品差距分析覆盖

| 差距 | 严重度 | 覆盖 Phase |
|------|--------|-----------|
| 无 Sprint/Iteration 模型 | 致命 | Plan 2 |
| 无任务类型层级 (Epic/Story/Task/Bug) | 致命 | Plan 2 |
| 无工作流引擎 | 致命 | Plan 2 (预置模板) + V1.3 (可自定义) |
| 无需求摄入管理 | 致命 | Plan 2 |
| 无估算/容量规划 | 致命 | Plan 2 + Plan 4 |
| 无评论/讨论系统 | 重要 | Plan 2 |
| 无全文搜索 | 重要 | Plan 2 |
| 无自动化规则引擎 | 重要 | Plan 4 |
| 无通知偏好 | 重要 | Plan 4 |
| 无 Webhook API | 重要 | Plan 4 |

---

## 7. 关键技术决策

1. **Router(薄) → Service(逻辑) → Model(ORM)。** AI Engine 独立为 `app/ai/` 包
2. **Zustand stores 按 feature 划分**（authStore, workspaceStore, taskStore），非全局 store
3. **数据库按 Phase 增量建表**，每个 Phase 独立建表和迁移，不跨 Phase 预建表
4. **Agent 任务异步执行**（asyncio 后台 + SSE 流式），MVP 不引入 Celery
5. **3 级 RBAC 从 Foundation 即为所有路由统一入口**，后续新增路由无需改动权限架构
6. **认证和通知层使用接口抽象**（`auth/AuthProvider`、`notify/NotifyProvider`），企微作为首个实现，后续可扩展飞书/钉钉/邮件
7. **AI Agent 全链路可观测**：AgentScope 执行日志结构化输出 + FastAPI 侧 tracing + 关键指标（任务成功率/延迟/摘要质量）监控
8. **OpenSpec 项目宪法**：工作空间创建时自动初始化 OpenSpec（设计规范 §4.3），AI 调用时注入 System Prompt。OpenSpec 定义行为边界，记忆系统提供历史上下文，二者独立管理
9. **AuthProvider + NotifyProvider 接口抽象**：外部集成通过接口隔离，企微为首个实现，后续可扩展飞书/钉钉/邮件而不影响业务逻辑

---

## 8. 开发环境与项目结构

### 8.1 开发环境要求

| 依赖 | 版本 | 用途 |
|------|------|------|
| Python | >= 3.11 | 后端运行时 |
| Node.js | >= 20 | 前端运行时 |
| pnpm | >= 9.15.0 | 前端包管理 (monorepo) |
| MySQL | 8.0+ | 核心数据库 |
| Redis | 7.0+ | 会话缓存 + 任务队列 |
| Git | 2.40+ | 知识库版本化 (GitPython) |
| Docker | 24+ | 本地开发环境容器化 (可选) |

### 8.2 推荐本地开发工作流

```bash
# 1. 克隆仓库
git clone <repo-url> ai-pm && cd ai-pm

# 2. 启动基础设施 (MySQL + Redis)
docker compose -f docker-compose.dev.yml up -d

# 3. 初始化数据库
cd server && alembic upgrade head && cd ..

# 4. 安装依赖
pnpm install          # 前端 monorepo
cd server && pip install -e ".[dev]" && cd ..

# 5. 启动开发服务器
pnpm dev              # 前端 :3000 + 后端 :8000 (concurrently)
```

### 8.3 项目目录结构

```
ai-pm/
├── server/                          # FastAPI 后端
│   ├── alembic/                     # 数据库迁移
│   ├── app/
│   │   ├── main.py                  # 应用入口
│   │   ├── config.py                # 配置 (pydantic-settings)
│   │   ├── database.py              # 数据库连接
│   │   ├── security.py              # JWT + 密码哈希
│   │   ├── deps.py                  # 依赖注入 (get_current_user)
│   │   ├── exceptions.py            # 统一异常处理
│   │   ├── middleware.py            # 请求日志/审计
│   │   ├── routers/                 # API 路由层 (薄)
│   │   ├── services/                # 业务逻辑层
│   │   ├── schemas/                 # Pydantic 请求/响应模型
│   │   ├── models/                  # SQLAlchemy ORM 模型
│   │   ├── integrations/            # 外部集成 (企微/AuthProvider)
│   │   └── ai/                      # AI 引擎 (独立包, Plan 3+)
│   │       ├── gateway.py           # LLM 网关
│   │       ├── agentscope_bridge.py # AgentScope 桥接
│   │       ├── agent_config.py      # Agent 角色定义
│   │       ├── prompt_manager.py    # Prompt 模板管理
│   │       ├── memory.py            # 记忆系统
│   │       └── tools/               # Agent 工具集 (MCP)
│   ├── tests/
│   └── pyproject.toml
│
├── apps/web/                        # React 前端
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/client.ts            # Axios 实例
│   │   ├── pages/                   # 页面组件 (9 页)
│   │   ├── components/              # 共享组件
│   │   ├── stores/                  # Zustand stores
│   │   ├── hooks/                   # 自定义 hooks
│   │   └── types/                   # TypeScript 类型
│   ├── vite.config.ts
│   └── package.json
│
├── docs/
│   └── superpowers/
│       ├── specs/                   # 产品设计文档
│       ├── plans/                   # 实施计划 (各 Phase)
│       └── reports/                 # 技术验证报告
│
├── prototypes/                      # HTML 原型 (前期验证)
├── package.json                     # pnpm workspace root
├── pnpm-workspace.yaml
├── docker-compose.dev.yml           # 本地开发基础设施
├── IMPLEMENTATION_ROADMAP.md        # 本文件
└── CLAUDE.md                        # AI 助手指引
```

### 8.4 分支策略与代码约定

**分支策略：**
- `master` — 始终可部署，合并通过 PR
- `feature/<phase>-<name>` — 每 Phase 一个 feature 分支
- 示例：`feature/foundation-auth`、`feature/plan2-tasks`、`feature/plan3-ai`

**代码约定：**
- Python: Black (formatter) + Ruff (linter) + mypy (type check)
- TypeScript: Prettier + ESLint
- 提交信息：`type(scope): description` (如 `feat(auth): add wecom oauth login`)
- API 设计：RESTful，统一响应格式 `{"code": 0, "message": "ok", "data": ...}`
- 数据库：表名复数 (users, tasks)，字段名 snake_case，主键 VARCHAR(36) UUID

---

## 9. 风险登记表

| 编号 | 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|------|---------|
| R1 | AgentScope 本地 LLM tool calling 准确率不达标 | Plan 3 阻塞 | 中 | Plan 2.5 提前验证；备选 LangGraph |
| R2 | DeepSeek/Qwen API 不可用或限流 | Plan 3 开发停滞 | 低 | Mock LLM 开发模式；多模型备选 |
| R3 | AI 摘要质量无法达到可用标准 (3/5) | Memory 系统降级 | 中 | MVP 人工标注 + AI 辅助；非全自动摘要 |
| R4 | 企微 API 接口变更或审批延迟 | 企微集成延期 | 低 | AuthProvider 接口抽象；密码登录兜底 |
| R5 | 知识库 Git 仓库在多人并发写入时冲突 | 文档丢失风险 | 低 | 文件锁 + 自动合并 + 冲突告警 |
| R6 | 单人开发瓶颈——AI 引擎开发周期超预期 | 整体延期 4-6 周 | 中 | Mock LLM 并行开发；Plan 3/4 部分并行 |
| R7 | MySQL FULLTEXT ngram 中文分词质量不足 | 搜索体验差 | 低 | V1.1 升级向量搜索；Plan 2 阶段即可验证 |
| R8 | AgentScope 与 FastAPI 进程通信延迟过高 | 同步调用超时 | 低 | Plan 2.5 提前验证；降级为同进程调用 |

---

## 10. Phase 启动条件与完成标准

### 10.1 各 Phase 入口条件

| Phase | 启动条件 |
|-------|---------|
| Foundation | 开发环境就绪 (M0)：MySQL/Redis 可连接，`server/` 骨架存在，`apps/web/` 骨架存在 |
| Plan 2 | Foundation 完成 (M1)：用户可登录、空间 CRUD 正常、RBAC 权限生效 |
| Plan 2.5 | Plan 2 完成 (M2)：任务 CRUD 正常、知识库 Git 版本化可用（Agent 需要读写任务数据验证） |
| Plan 3 | Plan 2.5 通过 (M3)：5 项验证全部通过，Go 决策确认 |
| Plan 4 | Plan 3 核心完成 (M4)：至少 Agent 委托→执行→Review 全流程走通 |

### 10.2 各 Phase 完成标准

| Phase | Definition of Done |
|-------|-------------------|
| Foundation | ① 全部 API 端点有 pytest 集成测试覆盖 ② 权限矩阵参数化测试全部通过 ③ 前端 3 页面 (登录/工作空间列表/工作空间详情壳) 可用 |
| Plan 2 | ① 5 条端到端用户旅程走通（见 plan-2 §Week 6） ② MySQL FULLTEXT 中文搜索可用 ③ Git 文档版本历史可查看和 diff |
| Plan 2.5 | ① 5 项验证全部通过 ② 验证报告归档 ③ Go/No-Go 决策完成 |
| Plan 3 | ① Agent 委托→执行→产出→Review 全流程走通 ② Memory 人工标注工作流可用 ③ AI 对话 SSE 流式返回正常 |
| Plan 4 | ① 全部 9 页可用 ② 通知/企微/自动化/会议大屏闭环 ③ Playwright E2E 覆盖关键旅程 |

---

## 11. AgentScope 技术验证（Plan 2.5）关卡详情

在 Plan 2 完成后、Plan 3 AI 引擎开发前，必须通过此验证关卡。

**目标：** 确认 AgentScope 框架在真实场景下满足项目需求。

**验证项：**

| 验证项 | 成功标准 | 方法 |
|--------|---------|------|
| ReActAgent 工具调用稳定性 | 连续 50 次工具调用零异常 | 自动化循环测试 |
| Webhook 回调可靠性 | 回调延迟 < 3s，成功率 > 99% | 压力测试 |
| Memory 摘要质量 | 人工评分 ≥ 3/5（5 分制） | 样例盲评 |
| AgentScope + FastAPI 集成 | RTT < 5s（同步模式） | 端到端集成测试 |
| 本地 LLM 兼容性 | DeepSeek/Qwen 均可正常运行 | 模型切换测试 |

**交付物：** 验证报告（通过/不通过 + 数据 + 风险项）

**若不通过：** 重新评估 AI 引擎方案（备选：LangGraph / 自建 Agent 编排 / 降级为 API 直调）

---

## 12. 测试策略

| 层 | 工具 | 范围 |
|----|------|------|
| 单元测试 | pytest / vitest | Service 函数 / React hooks & components |
| 集成测试 | FastAPI TestClient | 每个 Router 的 API + 权限矩阵 |
| E2E 测试 | Playwright (Plan 3+) | 关键用户旅程 |

---

## 13. 详细 Phase 计划索引

| # | 文件 | 说明 |
|---|------|------|
| 0 | `IMPLEMENTATION_ROADMAP.md` | 本文件 — 总路线图 |
| 1 | `docs/superpowers/plans/2026-05-01-foundation-plan.md` | Foundation — FastAPI 版基座计划 |
| 2 | `docs/superpowers/plans/2026-05-01-plan-2-tasks-kb.md` | Plan 2 — 任务系统 + 知识库 |
| 2.5 | `docs/superpowers/plans/2026-05-01-plan-2.5-agentscope-spike.md` | Plan 2.5 — AgentScope 技术验证（关卡） |
| 3 | `docs/superpowers/plans/2026-05-01-plan-3-ai-engine.md` | Plan 3 — AI 引擎 |
| 4 | `docs/superpowers/plans/2026-05-01-plan-4-collab-admin.md` | Plan 4 — 协作 + 系统管理 |
