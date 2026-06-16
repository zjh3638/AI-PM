## Context

`workspaces` 表已存在 `owner_id`（FK → users）和 `department_id`（FK → departments）字段，但均未在业务层使用。现有 workspace member 机制通过 `workspace_members` 表管理，创建者自动成为 OWNER 角色。需要将 owner_id 接入业务层并保持与 member 角色的同步。

## Goals / Non-Goals

**Goals:**
- 创建/编辑工作空间时可指定项目负责人
- owner_id 与 workspace member OWNER 角色保持同步
- 工作空间列表返回负责人姓名和团队名称
- 列表页支持按团队和负责人筛选

**Non-Goals:**
- 不改变现有 workspace member 权限模型
- 不改变工作空间详情页的成员管理
- 不涉及 AI agent 作为负责人的场景

## Decisions

### Decision 1: owner 与 OWNER member 角色同步策略
- **创建时**: 若指定 owner_id，为该用户添加 OWNER member（若该用户还不在 members 中）；创建者仍自动获得 OWNER member
- **更新时**: 旧 owner 若存在且 role=OWNER → 降为 MEMBER；新 owner 若不在 members 中 → 添加为 OWNER，若已是 member → 升级为 OWNER
- **理由**: 保证 owner 始终拥有 OWNER 权限，同时变更负责人时不会遗留多余 OWNER

### Decision 2: 筛选参数
- 使用 `owner_id` 和 `department_id` 作为可选 query 参数
- 在 service 层用 `.ilike` / `.where()` 添加条件，与现有 keyword 筛选逻辑一致
- **理由**: 不引入新的路由或查询模式，与现有 `list_workspaces` 参数风格一致

### Decision 3: 负责人信息返回
- 在 `list_workspaces` 的 data 构建中，对每个 workspace 查询 owner 的 display_name 和 department.name
- 使用 joinedload 或单独查询（与现有 member_count 查询模式一致）
- **理由**: 保持响应字段扁平，避免嵌套 user 对象

## Risks / Trade-offs

- **N+1 查询**: 每个 workspace 查 owner → 列表数据量小时可接受，后续可优化为 joinedload
- **并发更新**: 两人同时更换负责人 → 后提交者覆盖，影响小，不做乐观锁

## Migration Plan

无需数据迁移。现有 workspace 的 owner_id 为空，前端展示时显示「未指定」即可。
