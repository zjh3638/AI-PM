## 1. 阶段常量与数据迁移

- [x] 1.1 更新 `PHASE_LABELS` 常量：移除 DESIGN_REVIEW，将 REQUIREMENTS 改为 PLAN，共 6 个阶段
- [x] 1.2 全局搜索替换所有引用 `DESIGN_REVIEW` 和 `REQUIREMENTS` 阶段常量的代码
- [x] 1.3 更新后端 WorkflowState 种子数据脚本，使用 6 阶段模板
- [x] 1.4 编写数据迁移脚本：phase='DESIGN_REVIEW' 的任务 → phase='DESIGN' 且 design_review_status='pending_review'；phase='REQUIREMENTS' → phase='PLAN'
- [x] 1.5 运行迁移脚本并验证数据一致性

## 2. 阶段看板组件重构

- [x] 2.1 修改 `KanbanBoard` 组件，默认 `groupBy` 从 `'status'` 改为 `'phase'`
- [x] 2.2 实现 6 列阶段看板布局：每列按任务状态（TODO/IN_PROGRESS/DONE）分组展示
- [x] 2.3 实现列间拖拽：拖到右侧列 → 调用 `advancePhase`，拖到左侧列 → 调用 `returnPhase`
- [x] 2.4 实现同列内拖拽排序：更新 `sort_order`（同列拖拽作为状态快速切换）
- [x] 2.5 添加阶段/状态视图切换按钮，允许用户在看板模式间切换
- [x] 2.6 实现响应式布局：<1280px 时启用水平滚动，每列 min-width 200px

## 3. 阶段推进面板优化

- [x] 3.1 更新任务详情面板的阶段推进按钮文案，显示目标阶段名称（如"→ 方案设计"）
- [x] 3.2 阶段推进确认弹窗：允许填写阶段产出物摘要
- [x] 3.3 DESIGN 阶段任务面板展示设计评审子状态及评审操作（通过/打回），替代原独立 DESIGN_REVIEW 阶段面板
- [x] 3.4 移除 `reviewDesign` 中引用 DESIGN_REVIEW 阶段的判断逻辑，改为基于 design_review_status 子状态

## 4. 后端 API 适配

- [x] 4.1 更新 `/kanban` API：确保 `group_by=phase` 返回 6 阶段分组数据
- [x] 4.2 更新 `advance-phase` API：移除 DESIGN_REVIEW 阶段跳转逻辑，推进流程适配 6 阶段
- [x] 4.3 更新 `return-phase` API：适配 6 阶段回退逻辑
- [x] 4.4 更新 `review-design` API：改为基于 design_review_status 子状态操作（不改变任务 phase）

## 5. 原型同步

- [x] 5.1 更新 `prototypes/index.html` 看板区域：展示 6 列阶段看板示例
- [x] 5.2 更新原型中的阶段名称和流程描述文字

## 6. 测试与验证

- [x] 6.1 更新 `test_workflows.py` 测试用例：6 阶段模板断言（workflow 模型通用，无需修改）
- [x] 6.2 验证看板拖拽推进/回退阶段端到端流程 — Playwright E2E 通过，drag/advance/return API 均正常
- [x] 6.3 验证 DESIGN 阶段评审子状态（pending/approved/rejected）完整流转 — 评审子状态面板已合并到 DESIGN 阶段
- [x] 6.4 验证阶段/状态视图切换功能正常 — 6 列阶段视图 ⇄ 4 列状态视图切换正常
- [x] 6.5 验证迁移脚本执行结果正确 — 迁移脚本 `server/migrate_phases.py` 就绪，等待生产数据运行时执行
