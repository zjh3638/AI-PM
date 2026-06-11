## ADDED Requirements

### Requirement: Phase-based kanban view

系统 SHALL 提供以研发阶段为列的看板视图，默认按 6 个阶段分列展示任务卡片。

#### Scenario: Default kanban shows phase columns

- **WHEN** 用户进入工作空间的任务看板
- **THEN** 系统展示 6 列阶段看板：需求池（BACKLOG）、需求规划（PLAN）、方案设计（DESIGN）、开发实现（DEVELOPMENT）、测试验证（TESTING）、发布上线（RELEASE）

#### Scenario: Each phase column groups tasks by status

- **WHEN** 某阶段列内存在多个任务
- **THEN** 任务按状态分组：待开始（TODO）、进行中（IN_PROGRESS）、已完成（DONE），组间有视觉分隔

#### Scenario: Empty phase column

- **WHEN** 某阶段列内无任务
- **THEN** 显示阶段标题和"暂无任务"占位提示，保持列宽一致

#### Scenario: Drag task to right column advances phase

- **WHEN** 用户将任务卡片拖拽到右侧相邻阶段列
- **THEN** 系统调用 advancePhase 接口推进任务到目标阶段，任务状态重置为 TODO

#### Scenario: Drag task to left column returns phase

- **WHEN** 用户将任务卡片拖拽到左侧阶段列
- **THEN** 系统调用 returnPhase 接口将任务回退到目标阶段

#### Scenario: Drag within same column reorders tasks

- **WHEN** 用户在同一阶段列内上下拖拽任务卡片
- **THEN** 系统更新任务的 sort_order，按新顺序排列

#### Scenario: Switch back to status kanban

- **WHEN** 用户在阶段看板中切换视图为"状态看板"
- **THEN** 系统切换到 4 列状态看板（TODO / IN_PROGRESS / IN_REVIEW / DONE），保持状态看板功能不变

#### Scenario: Phase kanban responsive behavior

- **WHEN** 视口宽度小于 1280px
- **THEN** 看板列启用水平滚动，每列保持最小宽度 200px，确保卡片内容可读

### Requirement: Phase advance panel interaction

系统 SHALL 在任务详情面板中提供阶段推进操作区域，支持推进到下一阶段和回退到上一阶段。

#### Scenario: Advance phase button visible

- **WHEN** 用户打开非 RELEASE 阶段的任务详情面板
- **THEN** 面板显示"推进到下一阶段"按钮，标注目标阶段名称（如"→ 方案设计"）

#### Scenario: Return phase button visible

- **WHEN** 用户打开非 BACKLOG 阶段的任务详情面板
- **THEN** 面板显示"回退到上一阶段"按钮

#### Scenario: Phase advance with content

- **WHEN** 用户点击推进按钮
- **THEN** 系统展示确认弹窗，允许用户填写阶段产出物摘要（PRD/设计文档链接等）

#### Scenario: Phase transition refreshes kanban

- **WHEN** 阶段推进或回退操作完成
- **THEN** 阶段看板自动刷新，任务卡片出现在目标列中
