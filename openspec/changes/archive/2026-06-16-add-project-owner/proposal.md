## Why

每个工作空间需要指定一名项目负责人（项目经理），用于责任归属和快捷筛选。目前 `workspaces.owner_id` 字段已在数据库中存在但完全未接入业务层，创建时不可设、列表不可见、不可筛选。

## What Changes

- 创建工作空间时可指定负责人，自动同步为 workspace member（OWNER 角色）
- 更换负责人时自动同步 member 角色：旧负责人降级为 MEMBER（若仍是成员），新负责人自动补 OWNER member
- 工作空间列表 API 返回负责人姓名和所属团队名称
- 工作空间列表页新增「团队」和「负责人」两个下拉筛选器
- 工作空间卡片展示负责人信息

## Capabilities

### New Capabilities

- `workspace-owner`: 工作空间负责人设定与管理，负责人与 member OWNER 角色保持同步

### Modified Capabilities

<!-- None -->

## Impact

- **Backend**: `WorkspaceCreate/Update/Response` schemas, `create_workspace` / `update_workspace` / `list_workspaces` services, workspace router
- **Frontend**: `Workspace` type, `WorkspaceListPage` filters + cards + create modal, `workspaceStore`
- **Breaking**: 无
