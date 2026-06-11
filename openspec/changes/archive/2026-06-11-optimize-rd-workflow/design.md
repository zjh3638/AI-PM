## Context

当前研发流程实现为 7 阶段：BACKLOG → REQUIREMENTS → DESIGN → DESIGN_REVIEW → DEVELOPMENT → TESTING → RELEASE。看板 (`KanbanBoard.tsx`) 当前按任务状态（TODO/IN_PROGRESS/IN_REVIEW/DONE）分 4 列展示，不支持按阶段分组视图。

关键现状：
- `PHASE_LABELS` 定义了 7 个阶段标签（`apps/web/src/types/index.ts:165`）
- Task 模型已有 `phase` 字段和 `design_review_status` 子状态字段
- `taskStore.fetchKanban` 已支持 `groupBy` 参数（`'status'` 或 `'phase'`），后端 kanban API 支持按阶段分组
- `advancePhase` / `returnPhase` 已存在，推进阶段后刷新 `groupBy='phase'` 的看板数据
- `WorkflowTemplate` + `WorkflowState` + `WorkflowTransition` 模型在后端支持灵活定义流程模板，不硬编码阶段数量
- `design_review_status` 字段已存在于 Task 模型（`requirement_review_status` 同理），表明评审能力已作为子状态存在

这意味着 infrastructure 层已基本就绪，改动集中在前端看板组件和阶段常量定义。

## Goals / Non-Goals

**Goals:**
- 将 7 阶段简化为 6 阶段，合并 DESIGN + DESIGN_REVIEW，设计评审改为 DESIGN 阶段的子状态
- 看板默认以阶段为列（6 列），每列内按任务状态分组
- 支持列间拖拽推进/回退阶段（替代当前仅支持状态变更的拖拽）
- 保留并优化阶段推进面板（advance/return 按钮），提升交互一致性

**Non-Goals:**
- 不改变后端 workflow 引擎（WorkflowTemplate/State/Transition 模型保持通用，只更新种子数据）
- 不改变任务状态模型（TODO/IN_PROGRESS/IN_REVIEW/DONE 不变）
- 不引入可配置的流程自定义（后续版本再考虑）
- 不改变 AI Agent 分配逻辑

## Decisions

### D1: 合并 DESIGN + DESIGN_REVIEW 为 DESIGN，评审作为子状态

**选择**: 将 DESIGN_REVIEW 从独立阶段改为 DESIGN 阶段内的子状态，通过 `design_review_status` 字段（已有）管理评审状态（pending / approved / rejected）。

**理由**:
- 设计评审本质是 DESIGN 阶段的一个 check point，不是独立的研发阶段
- `design_review_status` 字段已在 Task 模型中存在，无需数据库迁移
- 减少阶段数量降低看板列数（7→6），视觉上更易于一屏展示
- 评审功能完全保留：在 DESIGN 列内，待评审卡片有视觉标识，可在任务详情面板中完成评审操作

**备选方案**: 保持 7 阶段，仅优化 UI。
- 不采纳：7 列在 1440px 屏幕上每列约 180px，卡片信息展示受限；且 DESIGN_REVIEW 阶段的卡片数量通常很少，造成空间浪费。

### D2: 看板默认视图从状态列切换为阶段列

**选择**: `KanbanBoard` 组件默认 `groupBy='phase'`，渲染 6 列阶段视图，每列内按任务状态分组（TODO / IN_PROGRESS / DONE 三组，去掉 IN_REVIEW 分组因为它已融入各阶段的子状态）。

**理由**:
- 阶段看板直接反映研发流程进度，PM 一眼能看到项目所处阶段和各阶段任务量
- 现有 API 已支持 `group_by=phase`，无需后端改动
- 保留了视图切换能力（`kanbanGroupBy` 状态变量），用户可在阶段视图和状态视图间切换

**备选方案**: 阶段看板和状态看板作为两个视图并存，默认显示状态看板。
- 不采纳：阶段看板是更高级的项目视图，默认为阶段看板符合 PM 的使用场景。状态看板作为辅助视图保留。

### D3: 看板拖拽行为变更

**选择**: 列间拖拽改为调用 `advancePhase`（拖到右侧列）或 `returnPhase`（拖到左侧列），而非当前的状态变更 `moveTask`。同列内拖拽调整排序（`sort_order`）。

**理由**:
- 列间移动语义=阶段推进，这是主要操作路径
- 阶段推进时会自动重置任务状态（如进入新阶段重置为 TODO），由后端 `advancePhase` 处理
- 保留同列内上下拖拽排序能力

### D4: 阶段名称优化

**选择**: REQUIREMENTS → PLAN（需求规划）。

**理由**: "需求规划"更准确反映该阶段的工作内容——将需求池中的 idea 转化为可执行的需求规格。

## Risks / Trade-offs

- **6 列看板在窄屏体验**: 6 列在 <1280px 屏幕可能拥挤 → 增加水平滚动和列宽自适应（min-width 限制），小屏时支持折叠为 3-4 列并显示阶段选择器
- **DESIGN_REVIEW 阶段数据迁移**: 已有 `DESIGN_REVIEW` 阶段的任务需迁移 → 编写迁移脚本，将 phase='DESIGN_REVIEW' 改为 phase='DESIGN'，同时设置 design_review_status='pending_review'；开发环境无生产数据，影响小
- **向后兼容**: 修改 `PHASE_LABELS` 常量会影响所有引用 → 全局搜索替换，将 `DESIGN_REVIEW` 的出现改为 `DESIGN`（保留 design_review_status 子状态字段不变）
