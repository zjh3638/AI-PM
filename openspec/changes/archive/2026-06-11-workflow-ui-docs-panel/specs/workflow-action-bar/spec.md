## ADDED Requirements

### Requirement: Independent workflow action bar

系统 SHALL 在任务详情面板中展示独立的流程操作栏，根据任务当前阶段和状态动态显示阶段推进/回退操作按钮。状态变更（TODO→IN_PROGRESS→DONE）统一在看板卡片上操作，面板内不再显示状态流转按钮。

#### Scenario: Workflow bar visible for STORY tasks

- **WHEN** 用户在 PROJECT 类型工作空间中打开 STORY 类型任务的详情面板
- **THEN** 面板中展示独立的流程操作栏，包含与当前 phase+status 匹配的阶段操作按钮

#### Scenario: Phase advance as primary CTA

- **WHEN** 任务 status 为 DONE 且非最后阶段
- **THEN** 流程操作栏显示醒目的主操作按钮（如「🚀 推进到开发实现」），点击后触发阶段推进（含 gate check）

#### Scenario: Phase advance disabled when not done

- **WHEN** 任务 status 非 DONE
- **THEN** 推进按钮置灰，提示「需先完成任务」

#### Scenario: Phase return as secondary action

- **WHEN** 任务处于 DESIGN 或 TESTING 阶段
- **THEN** 流程操作栏显示次要按钮「↩ 退回上一阶段」

#### Scenario: No workflow bar for non-STORY or TOPIC workspace

- **WHEN** 任务类型非 STORY，或在 TOPIC 类型工作空间
- **THEN** 不展示独立的流程操作栏

### Requirement: No redundant status buttons in panel

系统 SHALL NOT 在任务详情面板中展示状态流转按钮（▶开始处理 / ✔标记完成 / ↩标记未完），状态变更通过看板卡片上的状态标签循环切换和快速完成按钮完成。

#### Scenario: Status transition only on kanban cards

- **WHEN** 用户打开任务详情面板
- **THEN** 面板中不存在「▶开始处理」「✔标记完成」「↩标记未完」按钮

### Requirement: Phase transition timeline

系统 SHALL 在任务详情面板底部展示阶段流转时间线。

#### Scenario: Timeline displays phase changes

- **WHEN** 任务发生过阶段推进或回退
- **THEN** 面板底部展示时间线，每项包含：时间、操作人、变更描述（如「需求规划 → 方案设计」）、产出物摘要

#### Scenario: Timeline empty state

- **WHEN** 任务尚未发生阶段变更
- **THEN** 时间线区域显示「暂无流程记录」
