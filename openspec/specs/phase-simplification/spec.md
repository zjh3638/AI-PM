## ADDED Requirements

### Requirement: Six-phase R&D workflow

系统 SHALL 将研发流程简化为 6 个阶段，设计评审作为方案设计阶段的子状态存在。

#### Scenario: Phase list

- **WHEN** 系统定义研发流程阶段
- **THEN** 阶段列表为：BACKLOG（需求池）、PLAN（需求规划）、DESIGN（方案设计）、DEVELOPMENT（开发实现）、TESTING（测试验证）、RELEASE（发布上线），共 6 个阶段

#### Scenario: DESIGN phase with review sub-status

- **WHEN** 任务处于 DESIGN 阶段且设计产出物提交评审
- **THEN** 任务的设计评审子状态设为 `pending_review`，评审通过后设为 `approved`，打回后设为 `rejected`，通过 `design_review_status` 字段承载

#### Scenario: Design review in task detail panel

- **WHEN** 用户打开 DESIGN 阶段的任务详情面板
- **THEN** 面板展示设计评审子状态（pending / approved / rejected）及评审人信息，评审人可在面板内完成通过/打回操作

#### Scenario: Review sub-status does not create a separate phase column

- **WHEN** 任务处于 DESIGN 阶段且 design_review_status 为任意值
- **THEN** 任务卡片始终显示在 DESIGN 阶段的看板列中，按任务状态分组展示，不因为评审子状态而出现在额外列中

### Requirement: Phase label renaming

系统 SHALL 将 REQUIREMENTS 阶段重命名为 PLAN。

#### Scenario: Updated phase label

- **WHEN** 系统展示阶段名称
- **THEN** "需求分析"（REQUIREMENTS）显示为"需求规划"（PLAN）

#### Scenario: Compatibility with existing data

- **WHEN** 系统中存在 phase='REQUIREMENTS' 的历史任务数据
- **THEN** 系统将其映射为 PLAN 阶段展示，后台数据迁移脚本将 REQUIREMENTS 更新为 PLAN

### Requirement: DESIGN_REVIEW phase data migration

系统 SHALL 将历史任务中 phase='DESIGN_REVIEW' 的数据迁移为 phase='DESIGN' 并保留评审上下文。

#### Scenario: Migrate DESIGN_REVIEW tasks

- **WHEN** 执行阶段迁移脚本
- **THEN** 所有 phase='DESIGN_REVIEW' 的任务更新为 phase='DESIGN'，design_review_status 设为 'pending_review'（保留原评审人、评审意见等关联数据不变）

#### Scenario: Seed data updated

- **WHEN** 系统初始化工作流模板种子数据
- **THEN** 种子数据使用 6 阶段模板，WorkflowState 表包含 6 条阶段记录，不含 DESIGN_REVIEW
