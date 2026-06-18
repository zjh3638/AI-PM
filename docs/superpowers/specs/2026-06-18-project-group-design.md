# 项目群（Project Group）功能设计

**日期**：2026-06-18
**状态**：已确认，待实现

## 背景与目标

当前系统的"工作空间"（Workspace）是扁平结构，无法把多个相关项目组织在一起统一查看。用户希望能在工作空间列表页把多个项目组合成一个"大项目"（项目群），便于跨项目查看任务、进度、成员和动态。

项目群**不是实体性容器**（不持有自己的成员或任务），而是项目的轻量分组标签。一个项目可以同时属于多个项目群（多对多）。

## 关键决策

1. **数据模型**：新增独立的 `project_groups` 表，不作为 Workspace 的子类型。项目群不存储成员/任务，所有数据通过 `workspace_id` 关联到子项目实时聚合。
2. **层级**：固定两层 —— 项目群下直接挂普通项目，不支持嵌套。
3. **成员关系**：项目群无独立成员，其成员 = 所有子项目成员的并集（只读视图）。
4. **多对多**：一个项目可属于多个项目群，通过中间表 `project_group_items` 实现。
5. **权限**：仅 `SUPER_ADMIN` / `ADMIN` 可创建项目群；所有登录用户可查看；管理（改/删/增删子项目）仅创建者或 `SUPER_ADMIN`。
6. **入口**：工作空间列表页顶部加 Tab `[我的项目] [项目群]`，切换查看。

## 数据模型

新增 `server/app/models/project_group.py`：

```python
class ProjectGroup(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "project_groups"
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    creator_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    members: Mapped[list["ProjectGroupItem"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )
    workspaces: Mapped[list["Workspace"]] = relationship(
        secondary="project_group_items", viewonly=True
    )

class ProjectGroupItem(Base, UUIDMixin):
    __tablename__ = "project_group_items"
    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("project_groups.id", ondelete="CASCADE")
    )
    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE")
    )
    __table_args__ = (UniqueConstraint("group_id", "workspace_id"),)
```

- 删除项目群 → 中间表通过 `ON DELETE CASCADE` 自动清理，子项目不受影响
- 子项目删除 → 中间表记录自动清理
- 联合唯一约束防止同一项目重复加入同一群

## 后端 API

新增 `server/app/routers/project_groups.py`，路由前缀 `/api/project-groups`：

### 项目群 CRUD
- `GET /api/project-groups` — 列表（支持搜索、分页）
- `POST /api/project-groups` — 创建（仅 `SUPER_ADMIN` / `ADMIN`）
- `GET /api/project-groups/{id}` — 详情（含子项目列表）
- `PATCH /api/project-groups/{id}` — 更新（创建者或 `SUPER_ADMIN`）
- `DELETE /api/project-groups/{id}` — 删除（创建者或 `SUPER_ADMIN`）

### 成员项目管理
- `POST /api/project-groups/{id}/workspaces` — 添加项目到群 `{workspace_id}`
- `DELETE /api/project-groups/{id}/workspaces/{ws_id}` — 从群移除项目

### 聚合数据接口
- `GET /api/project-groups/{id}/tasks` — 任务聚合（支持按状态/项目/负责人筛选）
- `GET /api/project-groups/{id}/stats` — 进度统计（各子项目完成率/任务数/逾期数）
- `GET /api/project-groups/{id}/members` — 成员总览（去重 + 标注所属项目）
- `GET /api/project-groups/{id}/milestones` — 里程碑/迭代时间线聚合
- `GET /api/project-groups/{id}/activity` — 动态流（跨项目活动，按时间倒序）

### 权限策略
- **创建**：`require_system_role("SUPER_ADMIN", "ADMIN")`
- **查看 / 聚合**：所有登录用户可看。聚合时用户未加入的子项目，不返回其任务详情，仅在统计里显示总数
- **管理**：创建者 或 `SUPER_ADMIN`

聚合查询逻辑放在新建的 `server/app/services/project_group_svc.py`，避免 router 臃肿。

## 前端

### 入口
工作空间列表页顶部加 Tab 切换：`[我的项目] [项目群]`。纯前端状态，默认显示"我的项目"。

### 项目群列表视图
- 卡片网格：群名称、描述、子项目数量、成员总数、整体进度条
- 右上角"新建项目群"按钮（仅 ADMIN 可见）
- 点击卡片进入群详情页

### 项目群详情页
新路由 `/project-groups/:id`，顶部信息栏 + 6 个 Tab：

| Tab | 内容 |
|---|---|
| 概览 | 群信息 + 各子项目进度统计卡（完成率/任务数/逾期数），可点进子项目 |
| 任务 | 聚合任务看板/列表，筛选器（子项目、状态、负责人、优先级） |
| 里程碑 | 跨项目时间线，按日期排列所有子项目的里程碑和迭代 |
| 成员 | 去重成员表格：头像/姓名/部门/参与项目数/参与项目列表 |
| 动态 | 所有子项目活动流汇总，按时间倒序，标注来源项目 |
| 设置 | （仅创建者/ADMIN）编辑群信息、添加/移除子项目、删除群 |

### Store 与类型
- 新建 `apps/web/src/stores/projectGroupStore.ts`，方法对应上述 API
- `apps/web/src/types/index.ts` 加 `ProjectGroup` interface

## 实现范围（YAGNI 裁剪）

- 聚合查询用 SQL 直接 JOIN 聚合，不引入缓存层
- 任务聚合复用现有 Task 模型字段，不新建数据库视图
- 不做项目群级别的"群成员"概念 —— 成员是子项目成员的并集，只读
- 不做项目群级别的通知/订阅
- 里程碑/迭代聚合只读展示，不跨项目编辑

## 数据迁移

- 新建 Alembic 迁移：`project_groups` 表 + `project_group_items` 表
- 无需 backfill 现有数据（全新功能）

## 测试

后端 `server/tests/test_project_groups.py`：
- CRUD 权限校验（普通用户创建应 403、ADMIN 可创建）
- 添加/移除子项目、重复添加报错
- 聚合接口：跨项目任务统计正确、成员去重正确
- 删除项目群后子项目不受影响

前端：暂不强制单测，靠手动验证。

## 不影响现有功能

- 不改动 Workspace 模型
- 不改动现有工作空间页面逻辑
- Tab 切换是纯前端状态，默认显示"我的项目"
