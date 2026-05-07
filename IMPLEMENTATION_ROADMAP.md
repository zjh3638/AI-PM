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
| Plan 4 | 协作 + 系统管理 | 6-7 周 | 全部 8 页线框图完整可用的 MVP |

**总周期：32-36 周（约 8-9 个月，单人开发）**

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
| 1. 登录 | 完整实现 | -- | -- | LDAP/企微同步 |
| 2. 工作台 | 统计卡片(静态) | 任务统计、决策清单、项目关注 | AI 日报卡片 | 风险预警卡片 |
| 3. 工作空间列表 | 网格卡片、搜索、创建(模板) | AI 创建入口(占位) | AI 创建(真实) | -- |
| 4. 工作空间详情 | 壳 + 概览 + 成员 | 任务、知识、指引 | AI Agent 管理、AI 面板 | 分析、自动化、空间设置 |
| 5. 会议大屏 | -- | -- | -- | 完整实现(3 层级) |
| 6. AI 对话 | -- | -- | 完整实现 | -- |
| 7. 个人中心 | 个人信息 | 待办、Review 队列、消息 | -- | 通知偏好、已完成 |
| 8. 系统管理 | -- | -- | 模型管理 | 用户/权限/Agent/企微/系统设置 |

---

## 5. 数据库迁移策略

- **Foundation：** 仅建认证 + 工作空间 + 用户 + 角色相关表（约 6 张：users, departments, roles, user_roles, workspaces, workspace_members）
- **Plan 2：** 建任务相关表（tasks, task_dependencies, iterations, comments, documents, requirement_inbox 等）和工作流模板表
- **Plan 3：** 建 AI 相关表（ai_agents, agent_executions, model_configs, project_memories, prompt_templates）；初始化向量检索基础设施
- **Plan 4：** 建协作表（meeting_cache, notification_preferences, webhook_subscriptions, automation_rules, audit_logs）

每个 Phase 独立建表和迁移，不跨 Phase 预建表，降低早期设计锁定风险。

---

## 6. 竞品差距分析覆盖

| 差距 | 严重度 | 覆盖 Phase |
|------|--------|-----------|
| 无 Sprint/Iteration 模型 | 致命 | Plan 2 |
| 无任务类型层级 (Epic/Story/Task/Bug) | 致命 | Plan 2 |
| 无工作流引擎 | 致命 | Plan 2 + Plan 4 |
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

---

## 8. AgentScope 技术验证（Plan 2.5）

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

## 9. 测试策略（更新）

| 层 | 工具 | 范围 |
|----|------|------|
| 单元测试 | pytest / vitest | Service 函数 / React hooks & components |
| 集成测试 | FastAPI TestClient | 每个 Router 的 API + 权限矩阵 |
| E2E 测试 | Playwright (Plan 3+) | 关键用户旅程 |

---

## 10. 详细 Phase 计划索引

| # | 文件 | 说明 |
|---|------|------|
| 0 | `IMPLEMENTATION_ROADMAP.md` | 本文件 — 总路线图 |
| 1 | `docs/superpowers/plans/2026-05-01-foundation-plan.md` | Foundation — FastAPI 版基座计划 |
| 2 | `docs/superpowers/plans/2026-05-01-plan-2-tasks-kb.md` | Plan 2 — 任务系统 + 知识库 |
| 2.5 | 见本文档 §8 | Plan 2.5 — AgentScope 技术验证（关卡） |
| 3 | `docs/superpowers/plans/2026-05-01-plan-3-ai-engine.md` | Plan 3 — AI 引擎 |
| 4 | `docs/superpowers/plans/2026-05-01-plan-4-collab-admin.md` | Plan 4 — 协作 + 系统管理 |
