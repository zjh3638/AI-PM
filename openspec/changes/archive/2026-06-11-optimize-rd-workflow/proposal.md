## Why

当前 7 阶段研发流程（需求池→需求分析→方案设计→设计评审→开发实现→测试验证→发布上线）阶段划分过细，"方案设计"与"设计评审"本质是同一阶段的两个子步骤，分开为独立阶段增加了不必要的操作成本。同时看板视图仅展示任务状态（TODO/IN_PROGRESS/IN_REVIEW/DONE），无法以阶段维度可视化项目全貌，阶段推进与看板拖拽的交互体验需要统一优化。

## What Changes

- **合并 DESIGN + DESIGN_REVIEW 为单一 DESIGN 阶段**：设计评审改为 DESIGN 阶段内的子状态（评审中），减少阶段切换的认知负担和操作步骤
- **看板改版为阶段列**：看板从 4 列状态视图改为按阶段分列（backlog→plan→design→development→testing→release），每列内按任务状态分组
- **阶段推进交互优化**：支持看板列间拖拽推进阶段（拖卡片到右侧列 = 进入下一阶段），同时保留面板内阶段推进按钮
- **阶段名称优化**：REQUIREMENTS → PLAN（需求规划），使名称更直观统一

## Capabilities

### New Capabilities

- `phase-kanban`: 以研发阶段为列的看板视图，每列内按任务状态（TODO/IN_PROGRESS/DONE）分组展示卡片，支持列间拖拽推进阶段
- `phase-simplification`: 简化研发流程为 6 阶段（BACKLOG → PLAN → DESIGN → DEVELOPMENT → TESTING → RELEASE），DESIGN_REVIEW 合并为 DESIGN 阶段的子状态

### Modified Capabilities

<!-- 此次为新增能力，不涉及已有 spec 的修改 -->

## Impact

- **前端**: 看板组件重构（`KanbanBoard` 从 4 列状态视图改为 6 列阶段视图），`PHASE_LABELS` 常量更新
- **后端**: `WorkflowState` 模型可能需要调整（若硬编码了 7 阶段的模板种子数据）
- **数据迁移**: 已有任务的 `DESIGN_REVIEW` 阶段数据需迁移为 `DESIGN`（开发环境，暂无生产数据）
- **原型**: `prototypes/index.html` 看板区域需要同步更新
