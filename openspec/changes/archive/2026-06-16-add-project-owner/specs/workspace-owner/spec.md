## ADDED Requirements

### Requirement: 创建工作空间时可指定负责人
系统 SHALL 在创建工作空间时支持可选指定项目负责人（owner_id）。若未指定，默认以创建者作为负责人。指定负责人后，系统 MUST 自动为该用户添加 workspace member 记录，角色为 OWNER。

#### Scenario: 创建时指定负责人
- **WHEN** 用户创建工作空间并指定 owner_id 为其他用户
- **THEN** 工作空间创建成功，owner_id 设为指定用户，且该用户自动获得 OWNER 角色 member

#### Scenario: 创建时不指定负责人
- **WHEN** 用户创建工作空间未指定 owner_id
- **THEN** 工作空间创建成功，owner_id 默认为创建者，且创建者自动获得 OWNER 角色 member

### Requirement: 更换项目负责人同步 member 角色
系统 SHALL 在更新工作空间 owner_id 时自动同步 workspace member 角色。若旧负责人当前是 workspace 的 OWNER 角色成员，MUST 将其降级为 MEMBER。新负责人若还不是成员则自动添加 OWNER 角色，若已是成员（非 OWNER）则升级为 OWNER。

#### Scenario: 更换负责人
- **WHEN** 管理员将工作空间负责人从用户 A 更换为用户 B
- **THEN** 用户 A 的 member 角色降级为 MEMBER（若 A 原本是 OWNER），用户 B 自动获得或升级为 OWNER 角色 member

#### Scenario: 新负责人已是成员
- **WHEN** 管理员将负责人更换为用户 C，且 C 已是该空间的 MEMBER 角色成员
- **THEN** 用户 C 的 member 角色升级为 OWNER

### Requirement: 工作空间列表返回负责人信息
系统 SHALL 在工作空间列表 API 响应中包含 owner_id、owner_name（负责人姓名）和 department_name（负责人所属团队名称）。

#### Scenario: 列表返回负责人信息
- **WHEN** 用户请求工作空间列表
- **THEN** 每个工作空间对象包含 owner_id、owner_name、department_name 字段

### Requirement: 按负责人筛选工作空间
系统 SHALL 支持按 owner_id 筛选工作空间列表。

#### Scenario: 按负责人筛选
- **WHEN** 用户请求工作空间列表并传入 owner_id 参数
- **THEN** 仅返回该负责人负责的工作空间

### Requirement: 按团队筛选工作空间
系统 SHALL 支持按 department_id 筛选工作空间列表。筛选时匹配 workspace 自身的 department_id。

#### Scenario: 按团队筛选
- **WHEN** 用户请求工作空间列表并传入 department_id 参数
- **THEN** 仅返回该团队关联的工作空间
