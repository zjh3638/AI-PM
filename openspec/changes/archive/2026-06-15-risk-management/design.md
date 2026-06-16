## Context

当前项目处于 Phase 1-2 开发阶段，已有 Task、Milestone、Workspace 等核心模型。产品设计文档（`2026-05-01-ai-pm-platform-design.md`）在 AI 增强层中规划了「风险预警」能力，但基础层尚无可人工操作的风险管理功能。

风险管理采用**简单模型**：人工登记、人工关闭，不依赖 AI 分析。与现有 `signal.py`（自动扫描逾期/阻塞）形成互补——信号是系统自动发现，风险是人工主动管理。

## Goals / Non-Goals

**Goals:**
- WorkSpace 维度下独立的 Risk 数据模型与 CRUD API
- 风险可关联到 Milestone（可选），实现项目级+里程碑级管理
- 简单的状态流转：IDENTIFIED → MITIGATING → CLOSED
- 工作空间新增「风险管理」Tab，提供列表、筛选、新建和关闭操作支撑
- 遵循现有项目架构：FastAPI + SQLAlchemy async + React + Ant Design + Zustand

**Non-Goals:**
- 不关联 Task（避免模型复杂化，可在描述中提及）
- 不引入 AI 自动风险分析（属于 Phase 3-4 范围）
- 不做风险矩阵评分自动化（概率×影响仅作为展示参考）
- 不扩展通知/企微推送（由信号系统后续统一处理）

## Decisions

### 1. 风险作为独立模型，而非 Task 扩展字段

**选择**: 新建 `risks` 表，独立 CRUD
**备选**: 在 Task 上增加 `risk_level` 字段

**理由**: 风险可能关联里程碑甚至独立存在，将其绑定到 Task 会遗漏非任务类风险（如资源风险、范围变更）。独立模型更自然地表达风险生命周期的管理过程。

### 2. 仅关联 Milestone，不关联 Task

**选择**: `milestone_id` FK（可选），不设 `task_id`
**理由**: 保持简单。风险描述中可以手动提及任务编号/标题。如果后续需要关联 Task，增加一个 JSON 字段 `related_task_ids` 即可，无需修改核心结构。

### 3. 风险状态机：3 状态线性流转

```
IDENTIFIED ──→ MITIGATING ──→ CLOSED
     │                            ↑
     └────────────────────────────┘
```

**理由**: 满足「登记→处理→关闭」的最简场景。不设 REOPEN（关闭后如需再处理，新建一条风险记录即可，保留历史完整性）。

### 4. 前端：工作空间 Tab 内嵌风险面板

**选择**: 在 `WorkspaceDetailPage` 中新增 Tab「风险管理」
**备选**: 独立页面

**理由**: 风险与项目上下文强绑定，放在工作空间内比独立页面更符合用户心智模型。Tab 是现有模式（任务看板、知识库、成员、报表都在工作空间内）。

### 5. 类型/概率/影响使用枚举值

- `risk_type`: `SCHEDULE`（进度）、`QUALITY`（质量）、`RESOURCE`（资源）、`SCOPE`（范围）、`OTHER`（其他）
- `probability`: `LOW` / `MEDIUM` / `HIGH`
- `impact`: `LOW` / `MEDIUM` / `HIGH`

不做数值化（0-1）避免用户困惑，简单低中高足够。

## Risks / Trade-offs

- **模型过于简单** → 未来如需更复杂的风险矩阵，可通过新增字段扩展（不影响现有 API）
- **不关联 Task** → 如果用户频繁需要关联任务，后续可加 `related_task_ids: JSON` 字段，无破坏性

## Open Questions

- 风险是否需要权限控制（如仅 Owner/Manager 可登记/关闭）？本次实现暂用工作空间成员角色做基本控制
