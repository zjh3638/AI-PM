## ADDED Requirements

### Requirement: Risk data model
系统 SHALL 提供独立的 `risks` 表，字段包含：工作空间ID(必填)、里程碑ID(可选)、标题、描述、风险类型、可能性、影响程度、状态、应对措施、负责人ID、关闭时间、创建/更新时间。

#### Scenario: Create risk with minimal fields
- **WHEN** 用户填写标题并选择工作空间后提交
- **THEN** 系统创建一条风险记录，默认状态为 IDENTIFIED，类型为 OTHER，可能性和影响程度均为 MEDIUM

#### Scenario: Create risk linked to milestone
- **WHEN** 用户填写风险并关联到某个里程碑后提交
- **THEN** 系统创建风险记录并将 `milestone_id` 设置为指定值

### Requirement: Risk status lifecycle
系统 SHALL 支持风险的三状态流转：IDENTIFIED（已识别）→ MITIGATING（应对中）→ CLOSED（已关闭）。IDENTIFIED 可直接关闭（跳过 MITIGATING）。

#### Scenario: Start mitigation
- **WHEN** 风险处于 IDENTIFIED 状态且用户点击「开始应对」
- **THEN** 风险状态变更为 MITIGATING

#### Scenario: Close risk from identified
- **WHEN** 风险处于 IDENTIFIED 状态且用户点击「关闭」
- **THEN** 风险状态变更为 CLOSED，记录关闭时间

#### Scenario: Close risk from mitigating
- **WHEN** 风险处于 MITIGATING 状态且用户点击「关闭」
- **THEN** 风险状态变更为 CLOSED，记录关闭时间

### Requirement: List risks in workspace
系统 SHALL 支持按工作空间查看所有风险，并支持按状态、类型、关联里程碑进行筛选。

#### Scenario: List all risks in workspace
- **WHEN** 用户进入工作空间的「风险管理」Tab
- **THEN** 系统展示该工作空间下所有风险，按创建时间倒序

#### Scenario: Filter by status
- **WHEN** 用户选择按状态「MITIGATING」筛选
- **THEN** 系统仅展示状态为 MITIGATING 的风险

#### Scenario: Filter by milestone
- **WHEN** 用户选择按某个里程碑筛选
- **THEN** 系统仅展示关联到该里程碑的风险

### Requirement: Edit risk
系统 SHALL 支持编辑已有风险的字段：标题、描述、类型、可能性、影响程度、应对措施、关联里程碑、负责人。

#### Scenario: Update risk details
- **WHEN** 用户修改风险标题和应对措施后保存
- **THEN** 系统更新该风险的对应字段，更新时间戳自动刷新

### Requirement: Close risk
系统 SHALL 支持关闭风险，关闭时自动记录关闭时间。已关闭的风险不可再编辑（只读）。

#### Scenario: Close risk with confirmation
- **WHEN** 用户对一条 IDENTIFIED 或 MITIGATING 的风险点击「关闭风险」
- **THEN** 系统将该风险状态设为 CLOSED，记录当前时间为关闭时间，此后该风险只读

### Requirement: Risk types and severity
系统 SHALL 支持以下风险类型：SCHEDULE（进度）、QUALITY（质量）、RESOURCE（资源）、SCOPE（范围）、OTHER（其他）。可能性(probability)和影响程度(impact)各分三级：LOW / MEDIUM / HIGH。

#### Scenario: Select risk type when creating
- **WHEN** 用户在创建风险时选择类型为「SCHEDULE」
- **THEN** 系统将该风险类型记录为 SCHEDULE

#### Scenario: Set probability and impact
- **WHEN** 用户设置可能性为 HIGH，影响程度为 MEDIUM
- **THEN** 系统记录 probability=HIGH, impact=MEDIUM
