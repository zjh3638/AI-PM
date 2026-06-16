## 1. Backend Schemas

- [x] 1.1 WorkspaceCreate 增加 owner_id 可选字段
- [x] 1.2 WorkspaceUpdate 增加 owner_id 可选字段
- [x] 1.3 WorkspaceResponse 增加 owner_id、owner_name、department_name 字段

## 2. Backend Service

- [x] 2.1 create_workspace: 保存 owner_id（默认创建者），为 owner 同步添加 OWNER member
- [x] 2.2 update_workspace: 更换 owner 时同步 member 角色（旧降级、新升级）
- [x] 2.3 list_workspaces: 增加 owner_id / department_id 筛选参数，返回 owner_name / department_name

## 3. Backend Router

- [x] 3.1 workspaces router: list_workspaces 增加 owner_id / department_id query 参数

## 4. Frontend Types & Store

- [x] 4.1 Workspace 类型增加 owner_id、owner_name、department_name
- [x] 4.2 workspaceStore.fetchList 参数支持 owner_id / department_id

## 5. Frontend Workspace List Page

- [x] 5.1 增加「团队」下拉筛选器（department_id）
- [x] 5.2 增加「负责人」下拉筛选器（owner_id）
- [x] 5.3 筛选器选项数据获取（复用现有 users/departments API 或 store）
- [x] 5.4 工作空间卡片展示负责人姓名和团队名称
- [x] 5.5 创建工作空间 Modal 增加负责人选择
