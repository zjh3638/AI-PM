# 项目群（Project Group）功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增"项目群"功能，让用户能把多个工作空间组合成大项目，统一查看跨项目的任务、进度、成员、里程碑和动态。

**Architecture:** 新增独立的 `project_groups` 表 + 多对多中间表 `project_group_items`。项目群不持有成员/任务，所有聚合数据通过 SQL JOIN 实时查询。前端在工作空间列表页加 Tab 切换，新增项目群详情页（6 个 Tab）。后端走 FastAPI + SQLAlchemy async，权限复用现有 `PermissionChecker`。

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic 2, pytest-asyncio (后端)；React 18, Zustand, Ant Design, react-router-dom (前端)。

**重要说明：** 本代码库**不使用 Alembic 迁移**（无 `versions/` 目录），DB schema 在 `app/main.py` 启动时通过 `Base.metadata.create_all` 自动创建。新增模型只需在 `app/models/__init__.py` 导入即可。测试用 in-memory SQLite + 同样的 `create_all` 机制。

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|---|---|
| `server/app/models/project_group.py` | `ProjectGroup` + `ProjectGroupItem` 数据模型 |
| `server/app/schemas/project_group.py` | Pydantic 请求/响应 schema |
| `server/app/services/project_group_svc.py` | 聚合查询与 CRUD 业务逻辑 |
| `server/app/routers/project_groups.py` | HTTP 路由 |
| `server/tests/test_project_groups.py` | 后端测试 |
| `apps/web/src/stores/projectGroupStore.ts` | 项目群状态管理 |
| `apps/web/src/pages/project-group-list/ProjectGroupListPage.tsx` | 项目群列表视图（嵌入 WorkspaceListPage 的 Tab） |
| `apps/web/src/pages/project-group-detail/ProjectGroupDetailPage.tsx` | 项目群详情页（含 6 个 Tab） |

### 修改文件

| 文件 | 修改 |
|---|---|
| `server/app/models/__init__.py` | 导入新模型 |
| `server/app/main.py` | 注册新 router |
| `apps/web/src/types/index.ts` | 加 `ProjectGroup` 类型 |
| `apps/web/src/pages/workspace-list/WorkspaceListPage.tsx` | 顶部加 Tab 切换 |
| `apps/web/src/components/Layout/AppLayout.tsx` | 加 `/project-groups/:id` 路由 |

---

## Task 1: 后端数据模型

**Files:**
- Create: `server/app/models/project_group.py`
- Modify: `server/app/models/__init__.py`

- [ ] **Step 1: 创建模型文件**

创建 `server/app/models/project_group.py`：

```python
from typing import Optional

from sqlalchemy import String, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class ProjectGroup(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "project_groups"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    creator_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    items: Mapped[list["ProjectGroupItem"]] = relationship(
        "ProjectGroupItem", back_populates="group", cascade="all, delete-orphan"
    )


class ProjectGroupItem(Base, UUIDMixin):
    __tablename__ = "project_group_items"
    __table_args__ = (
        UniqueConstraint("group_id", "workspace_id", name="uq_group_workspace"),
    )

    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("project_groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )

    group: Mapped["ProjectGroup"] = relationship("ProjectGroup", back_populates="items")
```

- [ ] **Step 2: 在 `__init__.py` 注册模型**

修改 `server/app/models/__init__.py`，在 `TaskProgress` 导入后加：

```python
from app.models.project_group import ProjectGroup, ProjectGroupItem
```

并在 `__all__` 列表末尾加：

```python
    "ProjectGroup",
    "ProjectGroupItem",
```

- [ ] **Step 3: 验证模型可加载**

运行：

```bash
cd /Users/zhaojh/code/AI-PM/server && .venv/bin/python -c "from app.models import ProjectGroup, ProjectGroupItem; print('OK', ProjectGroup.__tablename__, ProjectGroupItem.__tablename__)"
```

预期输出：`OK project_groups project_group_items`

- [ ] **Step 4: 提交**

```bash
cd /Users/zhaojh/code/AI-PM && git add server/app/models/project_group.py server/app/models/__init__.py && git commit -m "feat: add ProjectGroup data model"
```

---

## Task 2: 后端 Pydantic Schema

**Files:**
- Create: `server/app/schemas/project_group.py`

- [ ] **Step 1: 创建 schema 文件**

创建 `server/app/schemas/project_group.py`：

```python
from typing import Optional, Literal
from pydantic import BaseModel, Field


class ProjectGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)


class ProjectGroupUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)


class ProjectGroupItemAdd(BaseModel):
    workspace_id: str


class ProjectGroupResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    creator_id: str
    creator_name: Optional[str] = None
    workspace_count: int = 0
    workspaces: list[dict] = []
    created_at: str
    updated_at: str
```

- [ ] **Step 2: 验证可导入**

运行：

```bash
cd /Users/zhaojh/code/AI-PM/server && .venv/bin/python -c "from app.schemas.project_group import ProjectGroupCreate; print(ProjectGroupCreate(name='x').model_dump())"
```

预期输出包含 `'name': 'x'`

- [ ] **Step 3: 提交**

```bash
cd /Users/zhaojh/code/AI-PM && git add server/app/schemas/project_group.py && git commit -m "feat: add project group schemas"
```

---

## Task 3: 后端 Service 层 - CRUD

**Files:**
- Create: `server/app/services/project_group_svc.py`

- [ ] **Step 1: 创建 service 文件（CRUD 部分）**

创建 `server/app/services/project_group_svc.py`：

```python
from typing import Optional
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project_group import ProjectGroup, ProjectGroupItem
from app.models.workspace import Workspace
from app.models.user import User
from app.exceptions import AppException


async def create_group(
    db: AsyncSession, creator_id: str, name: str, description: Optional[str] = None
) -> ProjectGroup:
    group = ProjectGroup(name=name, description=description, creator_id=creator_id)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


async def get_group(db: AsyncSession, group_id: str) -> Optional[ProjectGroup]:
    result = await db.execute(
        select(ProjectGroup)
        .where(ProjectGroup.id == group_id)
        .options(selectinload(ProjectGroup.items).selectinload(ProjectGroupItem.group))
    )
    return result.scalar_one_or_none()


async def list_groups(
    db: AsyncSession, keyword: Optional[str] = None, page: int = 1, page_size: int = 20
) -> tuple[list[ProjectGroup], int]:
    query = select(ProjectGroup).order_by(ProjectGroup.created_at.desc())
    if keyword:
        query = query.where(ProjectGroup.name.ilike(f"%{keyword}%"))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows_q = query.offset((page - 1) * page_size).limit(page_size)
    groups = (await db.execute(rows_q)).scalars().all()
    return list(groups), total


async def update_group(
    db: AsyncSession, group: ProjectGroup,
    name: Optional[str] = None, description: Optional[str] = None,
) -> ProjectGroup:
    if name is not None:
        group.name = name
    if description is not None:
        group.description = description
    await db.commit()
    await db.refresh(group)
    return group


async def delete_group(db: AsyncSession, group: ProjectGroup) -> None:
    await db.delete(group)
    await db.commit()


async def add_workspace(db: AsyncSession, group_id: str, workspace_id: str) -> ProjectGroupItem:
    # 校验 workspace 存在
    ws = (await db.execute(select(Workspace).where(Workspace.id == workspace_id))).scalar_one_or_none()
    if ws is None:
        raise AppException(404, "工作空间不存在", 404)

    # 校验未重复加入
    existing = (
        await db.execute(
            select(ProjectGroupItem).where(
                ProjectGroupItem.group_id == group_id,
                ProjectGroupItem.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise AppException(400, "该项目已在群中", 400)

    item = ProjectGroupItem(group_id=group_id, workspace_id=workspace_id)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def remove_workspace(db: AsyncSession, group_id: str, workspace_id: str) -> None:
    result = await db.execute(
        delete(ProjectGroupItem).where(
            ProjectGroupItem.group_id == group_id,
            ProjectGroupItem.workspace_id == workspace_id,
        )
    )
    if result.rowcount == 0:
        raise AppException(404, "该项目不在群中", 404)
    await db.commit()


async def get_group_workspaces(db: AsyncSession, group_id: str) -> list[Workspace]:
    result = await db.execute(
        select(Workspace)
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == Workspace.id)
        .where(ProjectGroupItem.group_id == group_id)
    )
    return list(result.scalars().all())


async def get_creator_name(db: AsyncSession, creator_id: str) -> Optional[str]:
    result = await db.execute(select(User.display_name).where(User.id == creator_id))
    return result.scalar_one_or_none()
```

- [ ] **Step 2: 验证可导入**

运行：

```bash
cd /Users/zhaojh/code/AI-PM/server && .venv/bin/python -c "from app.services import project_group_svc; print('OK')"
```

预期输出：`OK`

- [ ] **Step 3: 提交**

```bash
cd /Users/zhaojh/code/AI-PM && git add server/app/services/project_group_svc.py && git commit -m "feat: add project group CRUD service"
```

---

## Task 4: 后端 Service 层 - 聚合查询

**Files:**
- Modify: `server/app/services/project_group_svc.py`（追加聚合函数）

- [ ] **Step 1: 在文件末尾追加聚合函数**

在 `server/app/services/project_group_svc.py` 末尾追加：

```python
from app.models.task import Task
from app.models.workspace_member import WorkspaceMember
from app.models.milestone import Milestone
from app.models.iteration import Iteration
from app.models.activity_log import ActivityLog


async def aggregate_tasks(
    db: AsyncSession, group_id: str,
    status: Optional[str] = None, workspace_id: Optional[str] = None,
    assignee_id: Optional[str] = None, priority: Optional[str] = None,
    limit: int = 200,
) -> list[dict]:
    """聚合群内所有子项目的任务。"""
    query = (
        select(Task, Workspace.name.label("workspace_name"))
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == Task.workspace_id)
        .join(Workspace, Workspace.id == Task.workspace_id)
        .where(ProjectGroupItem.group_id == group_id)
    )
    if status:
        query = query.where(Task.status == status)
    if workspace_id:
        query = query.where(Task.workspace_id == workspace_id)
    if assignee_id:
        query = query.where(Task.assignee_id == assignee_id)
    if priority:
        query = query.where(Task.priority == priority)
    query = query.order_by(Task.created_at.desc()).limit(limit)

    result = await db.execute(query)
    rows = result.all()
    return [
        {
            "id": t.id, "title": t.title, "status": t.status, "phase": t.phase,
            "priority": t.priority, "task_type": t.task_type,
            "workspace_id": t.workspace_id, "workspace_name": ws_name,
            "assignee_id": t.assignee_id,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "created_at": t.created_at.isoformat() if t.created_at else "",
        }
        for t, ws_name in rows
    ]


async def aggregate_stats(db: AsyncSession, group_id: str) -> list[dict]:
    """按子项目统计任务数/完成数/逾期数。"""
    workspaces = await get_group_workspaces(db, group_id)
    stats = []
    for ws in workspaces:
        total_r = await db.execute(
            select(func.count(Task.id)).where(Task.workspace_id == ws.id)
        )
        total = total_r.scalar() or 0
        done_r = await db.execute(
            select(func.count(Task.id)).where(
                Task.workspace_id == ws.id, Task.status == "DONE"
            )
        )
        done = done_r.scalar() or 0
        from datetime import date
        overdue_r = await db.execute(
            select(func.count(Task.id)).where(
                Task.workspace_id == ws.id,
                Task.status != "DONE",
                Task.due_date < date.today(),
            )
        )
        overdue = overdue_r.scalar() or 0
        completion = round(done / total * 100, 1) if total else 0.0
        stats.append({
            "workspace_id": ws.id, "workspace_name": ws.name,
            "total": total, "done": done, "overdue": overdue,
            "completion": completion,
        })
    return stats


async def aggregate_members(db: AsyncSession, group_id: str) -> list[dict]:
    """群内所有子项目成员去重，标注参与哪些项目。"""
    result = await db.execute(
        select(
            User.id, User.display_name, User.avatar_url,
            WorkspaceMember.workspace_id, Workspace.name.label("workspace_name"),
        )
        .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == WorkspaceMember.workspace_id)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(ProjectGroupItem.group_id == group_id)
    )
    rows = result.all()

    members_map: dict[str, dict] = {}
    for uid, name, avatar, ws_id, ws_name in rows:
        if uid not in members_map:
            members_map[uid] = {
                "user_id": uid, "display_name": name, "avatar_url": avatar,
                "project_count": 0, "projects": [],
            }
        members_map[uid]["project_count"] += 1
        members_map[uid]["projects"].append({"workspace_id": ws_id, "workspace_name": ws_name})
    return list(members_map.values())


async def aggregate_milestones(db: AsyncSession, group_id: str) -> list[dict]:
    """跨项目聚合里程碑与迭代。"""
    # 里程碑
    ms_result = await db.execute(
        select(Milestone, Workspace.name.label("workspace_name"))
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == Milestone.workspace_id)
        .join(Workspace, Workspace.id == Milestone.workspace_id)
        .where(ProjectGroupItem.group_id == group_id)
        .order_by(Milestone.due_date.asc())
    )
    milestones = [
        {
            "type": "milestone", "id": m.id, "name": m.name,
            "workspace_id": m.workspace_id, "workspace_name": ws_name,
            "due_date": m.due_date.isoformat() if m.due_date else None,
            "status": getattr(m, "status", None),
        }
        for m, ws_name in ms_result.all()
    ]

    # 迭代
    it_result = await db.execute(
        select(Iteration, Workspace.name.label("workspace_name"))
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == Iteration.workspace_id)
        .join(Workspace, Workspace.id == Iteration.workspace_id)
        .where(ProjectGroupItem.group_id == group_id)
        .order_by(Iteration.start_date.asc())
    )
    iterations = [
        {
            "type": "iteration", "id": it.id, "name": it.name,
            "workspace_id": it.workspace_id, "workspace_name": ws_name,
            "start_date": it.start_date.isoformat() if it.start_date else None,
            "end_date": it.end_date.isoformat() if it.end_date else None,
            "status": it.status,
        }
        for it, ws_name in it_result.all()
    ]
    return milestones + iterations


async def aggregate_activity(db: AsyncSession, group_id: str, limit: int = 30) -> list[dict]:
    """跨项目活动流。"""
    result = await db.execute(
        select(ActivityLog, User.display_name.label("user_name"), Workspace.name.label("workspace_name"))
        .join(Task, Task.id == ActivityLog.task_id)
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == Task.workspace_id)
        .join(Workspace, Workspace.id == Task.workspace_id)
        .outerjoin(User, User.id == ActivityLog.user_id)
        .where(ProjectGroupItem.group_id == group_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "id": log.id, "task_id": log.task_id,
            "user_name": user_name or "系统",
            "workspace_name": ws_name,
            "action_type": log.action_type,
            "field_name": log.field_name,
            "old_value": log.old_value, "new_value": log.new_value,
            "created_at": log.created_at.isoformat() if log.created_at else "",
        }
        for log, user_name, ws_name in rows
    ]
```

- [ ] **Step 2: 验证可导入**

运行：

```bash
cd /Users/zhaojh/code/AI-PM/server && .venv/bin/python -c "from app.services.project_group_svc import aggregate_tasks, aggregate_stats, aggregate_members, aggregate_milestones, aggregate_activity; print('OK')"
```

预期输出：`OK`

- [ ] **Step 3: 提交**

```bash
cd /Users/zhaojh/code/AI-PM && git add server/app/services/project_group_svc.py && git commit -m "feat: add project group aggregation service"
```

---

## Task 5: 后端 Router

**Files:**
- Create: `server/app/routers/project_groups.py`
- Modify: `server/app/main.py`

- [ ] **Step 1: 创建 router 文件**

创建 `server/app/routers/project_groups.py`：

```python
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.common import APIResponse
from app.schemas.project_group import (
    ProjectGroupCreate, ProjectGroupUpdate, ProjectGroupItemAdd,
)
from app.services import project_group_svc as svc
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/project-groups", tags=["project-groups"])


def _group_to_dict(group, creator_name=None, workspaces=None, workspace_count=None):
    return {
        "id": group.id, "name": group.name, "description": group.description,
        "creator_id": group.creator_id, "creator_name": creator_name,
        "workspace_count": workspace_count if workspace_count is not None else 0,
        "workspaces": workspaces or [],
        "created_at": group.created_at.isoformat() if group.created_at else "",
        "updated_at": group.updated_at.isoformat() if group.updated_at else "",
    }


async def _require_manage(pc: PermissionChecker, group, user: User):
    """管理权限：创建者 或 SUPER_ADMIN。"""
    if user.system_role == "SUPER_ADMIN":
        return
    if group.creator_id != user.id:
        raise AppException(403, "无权管理此项目群", 403)


@router.get("", response_model=APIResponse)
async def list_groups(
    keyword: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    groups, total = await svc.list_groups(db, keyword=keyword, page=page, page_size=page_size)
    data = []
    for g in groups:
        ws_list = await svc.get_group_workspaces(db, g.id)
        creator_name = await svc.get_creator_name(db, g.creator_id)
        data.append(_group_to_dict(
            g, creator_name=creator_name,
            workspaces=[{"id": w.id, "name": w.name} for w in ws_list],
            workspace_count=len(ws_list),
        ))
    return {"code": 0, "message": "ok", "data": data, "total": total}


@router.post("", response_model=APIResponse)
async def create_group(
    req: ProjectGroupCreate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    user: User = Depends(get_current_user),
):
    await pc.require_system_role("SUPER_ADMIN", "ADMIN")
    group = await svc.create_group(db, creator_id=user.id, name=req.name, description=req.description)
    return {"code": 0, "message": "ok", "data": _group_to_dict(group, creator_name=user.display_name)}


@router.get("/{group_id}", response_model=APIResponse)
async def get_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    ws_list = await svc.get_group_workspaces(db, group_id)
    creator_name = await svc.get_creator_name(db, group.creator_id)
    return {"code": 0, "message": "ok", "data": _group_to_dict(
        group, creator_name=creator_name,
        workspaces=[{"id": w.id, "name": w.name, "key": w.key} for w in ws_list],
        workspace_count=len(ws_list),
    )}


@router.patch("/{group_id}", response_model=APIResponse)
async def update_group(
    group_id: str,
    req: ProjectGroupUpdate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    await _require_manage(pc, group, user)
    group = await svc.update_group(db, group, name=req.name, description=req.description)
    return {"code": 0, "message": "ok", "data": _group_to_dict(group)}


@router.delete("/{group_id}", response_model=APIResponse)
async def delete_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    await _require_manage(pc, group, user)
    await svc.delete_group(db, group)
    return {"code": 0, "message": "ok", "data": None}


@router.post("/{group_id}/workspaces", response_model=APIResponse)
async def add_workspace(
    group_id: str,
    req: ProjectGroupItemAdd,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    await _require_manage(pc, group, user)
    await svc.add_workspace(db, group_id, req.workspace_id)
    return {"code": 0, "message": "ok", "data": None}


@router.delete("/{group_id}/workspaces/{workspace_id}", response_model=APIResponse)
async def remove_workspace(
    group_id: str,
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    await _require_manage(pc, group, user)
    await svc.remove_workspace(db, group_id, workspace_id)
    return {"code": 0, "message": "ok", "data": None}


@router.get("/{group_id}/tasks", response_model=APIResponse)
async def get_tasks(
    group_id: str,
    status: Optional[str] = Query(default=None),
    workspace_id: Optional[str] = Query(default=None),
    assignee_id: Optional[str] = Query(default=None),
    priority: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    tasks = await svc.aggregate_tasks(
        db, group_id, status=status, workspace_id=workspace_id,
        assignee_id=assignee_id, priority=priority,
    )
    return {"code": 0, "message": "ok", "data": tasks}


@router.get("/{group_id}/stats", response_model=APIResponse)
async def get_stats(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    stats = await svc.aggregate_stats(db, group_id)
    return {"code": 0, "message": "ok", "data": stats}


@router.get("/{group_id}/members", response_model=APIResponse)
async def get_members(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    members = await svc.aggregate_members(db, group_id)
    return {"code": 0, "message": "ok", "data": members}


@router.get("/{group_id}/milestones", response_model=APIResponse)
async def get_milestones(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    milestones = await svc.aggregate_milestones(db, group_id)
    return {"code": 0, "message": "ok", "data": milestones}


@router.get("/{group_id}/activity", response_model=APIResponse)
async def get_activity(
    group_id: str,
    limit: int = Query(default=30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    activity = await svc.aggregate_activity(db, group_id, limit=limit)
    return {"code": 0, "message": "ok", "data": activity}
```

- [ ] **Step 2: 在 `main.py` 注册 router**

修改 `server/app/main.py` 第 9 行的 routers 导入，在 `task_progress` 后加 `project_groups`：

```python
from app.routers import auth, users, workspaces, tasks, iterations, comments, requirements, documents, workflows, search, dashboard, milestones, departments, attachments, signals, risks, task_progress, project_groups
```

在 `app.include_router(task_progress.router)` 之后（第 46 行后）加：

```python
app.include_router(project_groups.router)
```

- [ ] **Step 3: 验证后端可启动且新接口注册成功**

重启后端（或确认 `--reload` 已生效）后运行：

```bash
curl -s http://localhost:8000/openapi.json | python3 -c "import sys,json; paths=json.load(sys.stdin)['paths']; print([p for p in paths if 'project-groups' in p][:3])"
```

预期输出包含 `/api/project-groups` 等路径。

- [ ] **Step 4: 提交**

```bash
cd /Users/zhaojh/code/AI-PM && git add server/app/routers/project_groups.py server/app/main.py && git commit -m "feat: add project group REST API"
```

---

## Task 6: 后端测试

**Files:**
- Create: `server/tests/test_project_groups.py`

- [ ] **Step 1: 创建测试文件**

创建 `server/tests/test_project_groups.py`：

```python
"""Project groups API tests: CRUD, permissions, aggregations."""
import pytest
from httpx import AsyncClient


class TestProjectGroupCRUD:
    async def test_member_cannot_create(self, client: AsyncClient, member_headers: dict):
        resp = await client.post("/api/project-groups", headers=member_headers, json={
            "name": "群1", "description": "描述",
        })
        assert resp.status_code == 403

    async def test_admin_can_create(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/project-groups", headers=auth_headers, json={
            "name": "测试群", "description": "一个测试群",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["data"]["name"] == "测试群"
        assert body["data"]["workspace_count"] == 0

    async def test_list_groups(self, client: AsyncClient, auth_headers: dict):
        await client.post("/api/project-groups", headers=auth_headers, json={"name": "群A"})
        resp = await client.get("/api/project-groups", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        assert body["total"] >= 1

    async def test_get_group_not_found(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/project-groups/nonexistent", headers=auth_headers)
        assert resp.status_code == 404

    async def test_update_group(self, client: AsyncClient, auth_headers: dict):
        create = await client.post("/api/project-groups", headers=auth_headers, json={"name": "原名"})
        gid = create.json()["data"]["id"]
        resp = await client.patch(f"/api/project-groups/{gid}", headers=auth_headers, json={"name": "新名"})
        assert resp.status_code == 200
        assert resp.json()["data"]["name"] == "新名"

    async def test_member_cannot_update(self, client: AsyncClient, auth_headers: dict, member_headers: dict):
        create = await client.post("/api/project-groups", headers=auth_headers, json={"name": "群"})
        gid = create.json()["data"]["id"]
        resp = await client.patch(f"/api/project-groups/{gid}", headers=member_headers, json={"name": "篡改"})
        assert resp.status_code == 403

    async def test_delete_group(self, client: AsyncClient, auth_headers: dict):
        create = await client.post("/api/project-groups", headers=auth_headers, json={"name": "待删"})
        gid = create.json()["data"]["id"]
        resp = await client.delete(f"/api/project-groups/{gid}", headers=auth_headers)
        assert resp.status_code == 200
        # 再查应 404
        resp2 = await client.get(f"/api/project-groups/{gid}", headers=auth_headers)
        assert resp2.status_code == 404


class TestProjectGroupWorkspaces:
    @pytest.fixture
    async def group_id(self, client: AsyncClient, auth_headers: dict) -> str:
        resp = await client.post("/api/project-groups", headers=auth_headers, json={"name": "群"})
        return resp.json()["data"]["id"]

    async def test_add_workspace(
        self, client: AsyncClient, auth_headers: dict, group_id: str, workspace: dict
    ):
        ws_id = workspace["workspace"].id
        resp = await client.post(
            f"/api/project-groups/{group_id}/workspaces",
            headers=auth_headers, json={"workspace_id": ws_id},
        )
        assert resp.status_code == 200

        # 详情应包含该 workspace
        detail = await client.get(f"/api/project-groups/{group_id}", headers=auth_headers)
        ws_ids = [w["id"] for w in detail.json()["data"]["workspaces"]]
        assert ws_id in ws_ids
        assert detail.json()["data"]["workspace_count"] == 1

    async def test_add_duplicate_workspace(
        self, client: AsyncClient, auth_headers: dict, group_id: str, workspace: dict
    ):
        ws_id = workspace["workspace"].id
        await client.post(
            f"/api/project-groups/{group_id}/workspaces",
            headers=auth_headers, json={"workspace_id": ws_id},
        )
        resp = await client.post(
            f"/api/project-groups/{group_id}/workspaces",
            headers=auth_headers, json={"workspace_id": ws_id},
        )
        assert resp.status_code == 400

    async def test_remove_workspace(
        self, client: AsyncClient, auth_headers: dict, group_id: str, workspace: dict
    ):
        ws_id = workspace["workspace"].id
        await client.post(
            f"/api/project-groups/{group_id}/workspaces",
            headers=auth_headers, json={"workspace_id": ws_id},
        )
        resp = await client.delete(
            f"/api/project-groups/{group_id}/workspaces/{ws_id}", headers=auth_headers
        )
        assert resp.status_code == 200
        detail = await client.get(f"/api/project-groups/{group_id}", headers=auth_headers)
        assert detail.json()["data"]["workspace_count"] == 0

    async def test_add_nonexistent_workspace(
        self, client: AsyncClient, auth_headers: dict, group_id: str
    ):
        resp = await client.post(
            f"/api/project-groups/{group_id}/workspaces",
            headers=auth_headers, json={"workspace_id": "nonexistent"},
        )
        assert resp.status_code == 404


class TestProjectGroupAggregations:
    @pytest.fixture
    async def group_with_ws(self, client: AsyncClient, auth_headers: dict, workspace: dict) -> str:
        gid = (await client.post("/api/project-groups", headers=auth_headers, json={"name": "群"})).json()["data"]["id"]
        await client.post(
            f"/api/project-groups/{gid}/workspaces",
            headers=auth_headers, json={"workspace_id": workspace["workspace"].id},
        )
        return gid

    async def test_stats(self, client: AsyncClient, auth_headers: dict, group_with_ws: str):
        resp = await client.get(f"/api/project-groups/{group_with_ws}/stats", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["workspace_id"] is not None

    async def test_members(self, client: AsyncClient, auth_headers: dict, group_with_ws: str):
        resp = await client.get(f"/api/project-groups/{group_with_ws}/members", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        # workspace fixture 中有一个 OWNER 成员
        assert any(m["project_count"] >= 1 for m in data)

    async def test_tasks(self, client: AsyncClient, auth_headers: dict, group_with_ws: str):
        resp = await client.get(f"/api/project-groups/{group_with_ws}/tasks", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json()["data"], list)

    async def test_milestones(self, client: AsyncClient, auth_headers: dict, group_with_ws: str):
        resp = await client.get(f"/api/project-groups/{group_with_ws}/milestones", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json()["data"], list)

    async def test_activity(self, client: AsyncClient, auth_headers: dict, group_with_ws: str):
        resp = await client.get(f"/api/project-groups/{group_with_ws}/activity", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json()["data"], list)


class TestProjectGroupCascadeDelete:
    async def test_delete_group_keeps_workspace(
        self, client: AsyncClient, auth_headers: dict, workspace: dict
    ):
        ws_id = workspace["workspace"].id
        gid = (await client.post("/api/project-groups", headers=auth_headers, json={"name": "群"})).json()["data"]["id"]
        await client.post(
            f"/api/project-groups/{gid}/workspaces",
            headers=auth_headers, json={"workspace_id": ws_id},
        )
        # 删群
        await client.delete(f"/api/project-groups/{gid}", headers=auth_headers)
        # workspace 仍存在
        ws_resp = await client.get(f"/api/workspaces/{ws_id}", headers=auth_headers)
        assert ws_resp.status_code == 200
```

- [ ] **Step 2: 运行测试**

运行：

```bash
cd /Users/zhaojh/code/AI-PM/server && .venv/bin/python -m pytest tests/test_project_groups.py -v
```

预期：全部通过（约 15 个测试）。

如有失败，根据报错修正 service 或 router。常见问题：
- `selectinload(ProjectGroupItem.group)` 循环引用 → 移除该 option
- 字段名与模型不一致 → 对照模型修正

- [ ] **Step 3: 跑全量回归**

运行：

```bash
cd /Users/zhaojh/code/AI-PM/server && .venv/bin/python -m pytest -x --tb=short
```

预期：全部通过，无回归。

- [ ] **Step 4: 提交**

```bash
cd /Users/zhaojh/code/AI-PM && git add server/tests/test_project_groups.py && git commit -m "test: add project group API tests"
```

---

## Task 7: 前端类型与 Store

**Files:**
- Modify: `apps/web/src/types/index.ts`
- Create: `apps/web/src/stores/projectGroupStore.ts`

- [ ] **Step 1: 在 types 加 ProjectGroup 类型**

在 `apps/web/src/types/index.ts` 的 `Workspace` interface 之后（约第 29 行）加：

```typescript
export interface ProjectGroup {
  id: string;
  name: string;
  description: string | null;
  creator_id: string;
  creator_name: string | null;
  workspace_count: number;
  workspaces: { id: string; name: string; key?: string }[];
  created_at: string;
  updated_at: string;
}

export interface ProjectGroupStats {
  workspace_id: string;
  workspace_name: string;
  total: number;
  done: number;
  overdue: number;
  completion: number;
}

export interface ProjectGroupMember {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  project_count: number;
  projects: { workspace_id: string; workspace_name: string }[];
}

export interface ProjectGroupActivity {
  id: string;
  task_id: string;
  user_name: string;
  workspace_name: string;
  action_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface ProjectGroupMilestone {
  type: 'milestone' | 'iteration';
  id: string;
  name: string;
  workspace_id: string;
  workspace_name: string;
  due_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status: string | null;
}
```

- [ ] **Step 2: 创建 store**

创建 `apps/web/src/stores/projectGroupStore.ts`：

```typescript
import { create } from 'zustand';
import type {
  ProjectGroup, ProjectGroupStats, ProjectGroupMember,
  ProjectGroupActivity, ProjectGroupMilestone, Task,
} from '../types';
import api from '../api/client';

interface ProjectGroupState {
  groups: ProjectGroup[];
  total: number;
  loading: boolean;
  current: ProjectGroup | null;
  stats: ProjectGroupStats[];
  members: ProjectGroupMember[];
  milestones: ProjectGroupMilestone[];
  activity: ProjectGroupActivity[];
  tasks: Task[];

  fetchList: (params?: Record<string, any>) => Promise<void>;
  fetchDetail: (id: string) => Promise<void>;
  create: (data: { name: string; description?: string }) => Promise<ProjectGroup>;
  update: (id: string, data: Partial<ProjectGroup>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addWorkspace: (groupId: string, workspaceId: string) => Promise<void>;
  removeWorkspace: (groupId: string, workspaceId: string) => Promise<void>;
  fetchStats: (id: string) => Promise<void>;
  fetchMembers: (id: string) => Promise<void>;
  fetchMilestones: (id: string) => Promise<void>;
  fetchActivity: (id: string) => Promise<void>;
  fetchTasks: (id: string, params?: Record<string, any>) => Promise<void>;
}

export const useProjectGroupStore = create<ProjectGroupState>((set, get) => ({
  groups: [],
  total: 0,
  loading: false,
  current: null,
  stats: [],
  members: [],
  milestones: [],
  activity: [],
  tasks: [],

  fetchList: async (params = {}) => {
    set({ loading: true });
    const data = await api.get('/project-groups', { params });
    set({ groups: data.data, total: data.total, loading: false });
  },

  fetchDetail: async (id) => {
    const data = await api.get(`/project-groups/${id}`);
    set({ current: data.data });
  },

  create: async (payload) => {
    const data = await api.post('/project-groups', payload);
    return data.data;
  },

  update: async (id, payload) => {
    await api.patch(`/project-groups/${id}`, payload);
    await get().fetchDetail(id);
  },

  remove: async (id) => {
    await api.delete(`/project-groups/${id}`);
    await get().fetchList();
  },

  addWorkspace: async (groupId, workspaceId) => {
    await api.post(`/project-groups/${groupId}/workspaces`, { workspace_id: workspaceId });
    await get().fetchDetail(groupId);
  },

  removeWorkspace: async (groupId, workspaceId) => {
    await api.delete(`/project-groups/${groupId}/workspaces/${workspaceId}`);
    await get().fetchDetail(groupId);
  },

  fetchStats: async (id) => {
    const data = await api.get(`/project-groups/${id}/stats`);
    set({ stats: data.data });
  },

  fetchMembers: async (id) => {
    const data = await api.get(`/project-groups/${id}/members`);
    set({ members: data.data });
  },

  fetchMilestones: async (id) => {
    const data = await api.get(`/project-groups/${id}/milestones`);
    set({ milestones: data.data });
  },

  fetchActivity: async (id) => {
    const data = await api.get(`/project-groups/${id}/activity`);
    set({ activity: data.data });
  },

  fetchTasks: async (id, params = {}) => {
    const data = await api.get(`/project-groups/${id}/tasks`, { params });
    set({ tasks: data.data });
  },
}));
```

- [ ] **Step 3: 验证 TS 编译**

运行：

```bash
cd /Users/zhaojh/code/AI-PM/apps/web && npx tsc --noEmit 2>&1 | head -20
```

预期：无错误输出（或仅有与本次改动无关的既有警告）。

- [ ] **Step 4: 提交**

```bash
cd /Users/zhaojh/code/AI-PM && git add apps/web/src/types/index.ts apps/web/src/stores/projectGroupStore.ts && git commit -m "feat(web): add project group types and store"
```

---

## Task 8: 前端 - 工作空间列表页 Tab + 项目群列表视图

**Files:**
- Create: `apps/web/src/pages/project-group-list/ProjectGroupListPage.tsx`
- Modify: `apps/web/src/pages/workspace-list/WorkspaceListPage.tsx`

- [ ] **Step 1: 创建项目群列表组件**

创建 `apps/web/src/pages/project-group-list/ProjectGroupListPage.tsx`：

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Form, Input, message } from 'antd';
import { useProjectGroupStore } from '../../stores/projectGroupStore';
import { useAuthStore } from '../../stores/authStore';

export default function ProjectGroupListPage() {
  const navigate = useNavigate();
  const { groups, loading, fetchList, create } = useProjectGroupStore();
  const user = useAuthStore((s) => s.user);
  const canCreate = user?.system_role === 'SUPER_ADMIN' || user?.system_role === 'ADMIN';
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { fetchList(); }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const g = await create(values);
      setModalOpen(false);
      form.resetFields();
      message.success('项目群创建成功');
      navigate(`/project-groups/${g.id}`);
    } catch {
      // validation error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="stream-header">
        <h2>项目群</h2>
        <div className="actions">
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
              + 新建项目群
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><div className="empty-icon">⏳</div><div>加载中...</div></div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗂️</div>
          <div>暂无项目群</div>
          {canCreate && (
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setModalOpen(true)}>
              创建第一个项目群
            </button>
          )}
        </div>
      ) : (
        <div className="stream-grid">
          {groups.map((g) => (
            <div key={g.id} className="ws-card" onClick={() => navigate(`/project-groups/${g.id}`)}>
              <div className="ws-head">
                <span className="ws-name">{g.name}</span>
                <span className="ws-tier company">项目群</span>
              </div>
              <div className="ws-summary">
                <div>{g.description || '暂无描述'}</div>
                <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {g.creator_name ? <span>创建者: {g.creator_name}</span> : null}
                  <span> · 包含 {g.workspace_count} 个项目</span>
                </div>
              </div>
              <div className="ws-stats">
                <span>子项目 <span className="sv">{g.workspace_count}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        title="创建项目群"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={submitting}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="项目群名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：Q2 重点产品线" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="项目群描述（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: 在 WorkspaceListPage 顶部加 Tab 切换**

修改 `apps/web/src/pages/workspace-list/WorkspaceListPage.tsx`：

在文件顶部 import 区加：

```tsx
import ProjectGroupListPage from '../project-group-list/ProjectGroupListPage';
```

在 `WorkspaceListPage` 函数内（第 26 行 `const [modalOpen, setModalOpen] = useState(false);` 之前）加：

```tsx
  const [view, setView] = useState<'workspaces' | 'groups'>('workspaces');
```

在 `return (` 之后、`{/* Header */}` 之前插入 Tab 切换 UI：

```tsx
      {/* View Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border-light)' }}>
        <button
          className={`btn ${view === 'workspaces' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ borderRadius: '0', borderBottom: view === 'workspaces' ? '2px solid var(--blue-500)' : '2px solid transparent' }}
          onClick={() => setView('workspaces')}
        >
          我的项目
        </button>
        <button
          className={`btn ${view === 'groups' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ borderRadius: '0', borderBottom: view === 'groups' ? '2px solid var(--blue-500)' : '2px solid transparent' }}
          onClick={() => setView('groups')}
        >
          项目群
        </button>
      </div>

      {view === 'groups' && <ProjectGroupListPage />}
      {view === 'workspaces' && (
```

然后在文件最末尾的 `</div>`（第 243 行，闭合最外层 div）之前加一个 `)}`：

即把原本的：

```tsx
      </Modal>
    </div>
  );
}
```

改为：

```tsx
      </Modal>
      )}
    </div>
  );
}
```

**注意：** 这一步把原有的 Header/Filters/Grid/Modal 包裹进 `{view === 'workspaces' && ( ... )}` 条件块。要确保 JSX 嵌套正确：原 `return (` 后紧跟条件渲染开头 `{view === 'workspaces' && (`，原 `</Modal>` 后紧跟 `)}`。

- [ ] **Step 3: 验证 TS 编译**

运行：

```bash
cd /Users/zhaojh/code/AI-PM/apps/web && npx tsc --noEmit 2>&1 | head -20
```

预期：无新增错误。

- [ ] **Step 4: 浏览器手动验证**

确认前端 dev server 运行中（端口 3000）。打开 http://localhost:3000/workspaces：
- 应看到 `[我的项目] [项目群]` 两个 Tab
- 默认显示"我的项目"，原工作空间列表正常
- 点击"项目群"切换到项目群列表视图（普通用户看不到"新建"按钮；admin 可见）
- 点击"新建项目群"创建一个，应跳转到详情页（详情页下一步实现，此步会报 404 路由是正常的）

- [ ] **Step 5: 提交**

```bash
cd /Users/zhaojh/code/AI-PM && git add apps/web/src/pages/project-group-list apps/web/src/pages/workspace-list/WorkspaceListPage.tsx && git commit -m "feat(web): add project group list view with tab switch"
```

---

## Task 9: 前端 - 项目群详情页路由与框架

**Files:**
- Create: `apps/web/src/pages/project-group-detail/ProjectGroupDetailPage.tsx`
- Modify: `apps/web/src/components/Layout/AppLayout.tsx`

- [ ] **Step 1: 创建详情页（框架 + 概览 + 设置 Tab）**

创建 `apps/web/src/pages/project-group-detail/ProjectGroupDetailPage.tsx`：

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Modal, Form, Input, Select, message, Tag } from 'antd';
import { useProjectGroupStore } from '../../stores/projectGroupStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useAuthStore } from '../../stores/authStore';
import api from '../../api/client';

type TabKey = 'overview' | 'tasks' | 'milestones' | 'members' | 'activity' | 'settings';

export default function ProjectGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const {
    current, stats, members, milestones, activity, tasks,
    fetchDetail, fetchStats, fetchMembers, fetchMilestones, fetchActivity, fetchTasks,
    update, remove, addWorkspace, removeWorkspace,
  } = useProjectGroupStore();
  const { workspaces, fetchList: fetchWsList } = useWorkspaceStore();

  const [tab, setTab] = useState<TabKey>('overview');
  const [addWsModalOpen, setAddWsModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [addWsForm] = Form.useForm();

  const canManage = user?.system_role === 'SUPER_ADMIN' || (current && current.creator_id === user?.id);

  useEffect(() => {
    if (!id) return;
    fetchDetail(id);
    fetchStats(id);
    fetchMembers(id);
    fetchMilestones(id);
    fetchActivity(id);
    fetchTasks(id);
  }, [id]);

  useEffect(() => {
    if (tab === 'settings') fetchWsList({ page_size: 100 });
  }, [tab]);

  if (!current) return <div className="empty-state"><div>加载中...</div></div>;

  const tabLabels: Record<TabKey, string> = {
    overview: '概览', tasks: '任务', milestones: '里程碑',
    members: '成员', activity: '动态', settings: '设置',
  };

  const handleDelete = async () => {
    Modal.confirm({
      title: '确认删除项目群',
      content: '删除后不可恢复，子项目不受影响。',
      okText: '删除', okType: 'danger', cancelText: '取消',
      onOk: async () => {
        await remove(current.id);
        message.success('已删除');
        navigate('/workspaces');
      },
    });
  };

  const handleEdit = async () => {
    const values = await editForm.validateFields();
    await update(current.id, values);
    setEditModalOpen(false);
    message.success('已更新');
  };

  const handleAddWs = async () => {
    const values = await addWsForm.validateFields();
    await addWorkspace(current.id, values.workspace_id);
    await fetchStats(current.id);
    await fetchMembers(current.id);
    setAddWsModalOpen(false);
    addWsForm.resetFields();
    message.success('已添加');
  };

  return (
    <div>
      <div className="stream-header">
        <div>
          <h2>{current.name}</h2>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {current.description || '暂无描述'}
            {current.creator_name && <span> · 创建者: {current.creator_name}</span>}
            <span> · {current.workspace_count} 个子项目</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-light)', marginBottom: 18 }}>
        {(Object.keys(tabLabels) as TabKey[]).map((k) => (
          <button
            key={k}
            className={`btn ${tab === k ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: '0', borderBottom: tab === k ? '2px solid var(--blue-500)' : '2px solid transparent' }}
            onClick={() => setTab(k)}
            disabled={k === 'settings' && !canManage}
          >
            {tabLabels[k]}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="stream-grid">
          {stats.map((s) => (
            <div key={s.workspace_id} className="ws-card"
                 onClick={() => navigate(`/workspaces/${s.workspace_id}`)}>
              <div className="ws-head">
                <span className="ws-name">{s.workspace_name}</span>
                <Tag color={s.completion >= 80 ? 'green' : s.completion >= 50 ? 'blue' : 'orange'}>
                  {s.completion}%
                </Tag>
              </div>
              <div className="ws-stats">
                <span>任务 <span className="sv">{s.total}</span></span>
                <span>完成 <span className="sv">{s.done}</span></span>
                <span style={{ color: s.overdue > 0 ? 'var(--red-500)' : undefined }}>
                  逾期 <span className="sv">{s.overdue}</span>
                </span>
              </div>
              <div className="health-bar" style={{ marginTop: 8 }}>
                <span className="fill good" style={{ width: `${s.completion}%` }} />
              </div>
            </div>
          ))}
          {stats.length === 0 && <div className="empty-state">暂无子项目，请到「设置」添加</div>}
        </div>
      )}

      {/* Tasks */}
      {tab === 'tasks' && (
        <div>
          <div style={{ marginBottom: 12, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            共 {tasks.length} 个任务
          </div>
          {tasks.length === 0 ? <div className="empty-state">暂无任务</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tasks.map((t: any) => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)', cursor: 'pointer',
                }} onClick={() => navigate(`/workspaces/${t.workspace_id}`)}>
                  <Tag>{t.workspace_name}</Tag>
                  <span style={{ flex: 1, fontWeight: 600 }}>{t.title}</span>
                  <Tag color={t.status === 'DONE' ? 'green' : t.status === 'IN_PROGRESS' ? 'blue' : 'default'}>
                    {t.status}
                  </Tag>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{t.priority}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Milestones */}
      {tab === 'milestones' && (
        <div>
          {milestones.length === 0 ? <div className="empty-state">暂无里程碑或迭代</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {milestones.map((m) => (
                <div key={`${m.type}-${m.id}`} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                }}>
                  <Tag color={m.type === 'milestone' ? 'purple' : 'cyan'}>
                    {m.type === 'milestone' ? '里程碑' : '迭代'}
                  </Tag>
                  <Tag>{m.workspace_name}</Tag>
                  <span style={{ flex: 1, fontWeight: 600 }}>{m.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                    {m.due_date || m.end_date || ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Members */}
      {tab === 'members' && (
        <div>
          {members.length === 0 ? <div className="empty-state">暂无成员</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.map((m) => (
                <div key={m.user_id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                }}>
                  <span style={{ fontWeight: 600 }}>{m.display_name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                    参与 {m.project_count} 个项目
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {m.projects.map((p) => <Tag key={p.workspace_id}>{p.workspace_name}</Tag>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity */}
      {tab === 'activity' && (
        <div>
          {activity.length === 0 ? <div className="empty-state">暂无动态</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activity.map((a) => (
                <div key={a.id} style={{
                  padding: '10px 16px', background: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
                  fontSize: '0.82rem',
                }}>
                  <Tag>{a.workspace_name}</Tag>
                  <strong>{a.user_name}</strong>
                  <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
                    {a.action_type}
                    {a.field_name ? ` · ${a.field_name}` : ''}
                    {a.new_value ? ` → ${a.new_value}` : ''}
                  </span>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {a.created_at}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings */}
      {tab === 'settings' && canManage && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => setEditModalOpen(true)}>编辑项目群</button>
            <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={handleDelete}>删除项目群</button>
          </div>

          <h3 style={{ marginBottom: 12 }}>子项目管理</h3>
          <div style={{ marginBottom: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setAddWsModalOpen(true)}>+ 添加项目</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {current.workspaces.map((w) => (
              <div key={w.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
              }}>
                <span style={{ flex: 1, fontWeight: 600 }}>{w.name}</span>
                {w.key && <Tag>{w.key}</Tag>}
                <button className="btn btn-ghost btn-sm" onClick={() => removeWorkspace(current.id, w.id)}>
                  移除
                </button>
              </div>
            ))}
            {current.workspaces.length === 0 && <div className="empty-state">尚未添加子项目</div>}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <Modal title="编辑项目群" open={editModalOpen} onOk={handleEdit}
             onCancel={() => setEditModalOpen(false)} okText="保存" cancelText="取消">
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}
              initialValues={{ name: current.name, description: current.description }}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add Workspace Modal */}
      <Modal title="添加项目到群" open={addWsModalOpen} onOk={handleAddWs}
             onCancel={() => { setAddWsModalOpen(false); addWsForm.resetFields(); }}
             okText="添加" cancelText="取消">
        <Form form={addWsForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="workspace_id" label="选择项目" rules={[{ required: true }]}>
            <Select
              placeholder="选择要加入群的项目"
              showSearch
              filterOption={(input, option) => (option?.label as string || '').includes(input)}
              options={workspaces
                .filter((w) => !current.workspaces.find((cw) => cw.id === w.id))
                .map((w) => ({ label: w.name, value: w.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: 在 AppLayout 注册路由**

修改 `apps/web/src/components/Layout/AppLayout.tsx`，在 import 区（约第 1-10 行）找到 WorkspaceListPage 的 import，下面加：

```tsx
import ProjectGroupDetailPage from '../../pages/project-group-detail/ProjectGroupDetailPage';
```

（import 路径相对位置请对照该文件已有的 `WorkspaceListPage` import 调整。若已有 import 集中在文件顶部，按相同相对路径风格添加。）

在第 124-130 行的 `<Routes>` 块中，`<Route path="/workspaces/:id/*" ...>` 之后加：

```tsx
          <Route path="/project-groups/:id" element={<ProjectGroupDetailPage />} />
```

- [ ] **Step 3: 验证 TS 编译**

运行：

```bash
cd /Users/zhaojh/code/AI-PM/apps/web && npx tsc --noEmit 2>&1 | head -20
```

预期：无新增错误。

- [ ] **Step 4: 浏览器手动验证**

打开 http://localhost:3000/workspaces，切到"项目群"Tab，新建一个项目群：
- 跳转到详情页，应显示 6 个 Tab
- "概览"显示空（尚未添加子项目）
- 切到"设置"（仅 admin 可见），点击"+ 添加项目"，从下拉选择一个已有工作空间
- 回到"概览"，应看到该项目的统计卡（任务/完成/逾期/完成率）
- "成员"Tab 应显示该项目的成员
- 点统计卡应跳转到对应工作空间

- [ ] **Step 5: 提交**

```bash
cd /Users/zhaojh/code/AI-PM && git add apps/web/src/pages/project-group-detail apps/web/src/components/Layout/AppLayout.tsx && git commit -m "feat(web): add project group detail page with 6 tabs"
```

---

## Task 10: 端到端验证与回归

**Files:** 无新增，仅验证

- [ ] **Step 1: 后端全量测试**

运行：

```bash
cd /Users/zhaojh/code/AI-PM/server && .venv/bin/python -m pytest -x --tb=short
```

预期：全部通过。

- [ ] **Step 2: 前端 TS 编译**

运行：

```bash
cd /Users/zhaojh/code/AI-PM/apps/web && npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 3: 浏览器端到端走查**

在 http://localhost:3000 完成以下流程：

1. 以 admin 登录
2. 访问"工作空间"页 → 看到 `[我的项目] [项目群]` Tab
3. 切到"项目群" → 点击"+ 新建项目群" → 输入名称"测试群" → 跳转详情页
4. 在"设置"Tab 添加 2 个已有工作空间
5. 在"概览"Tab 看到 2 个项目统计卡
6. 在"任务"Tab 看到聚合任务列表
7. 在"成员"Tab 看到去重成员
8. 在"动态"Tab 看到活动流
9. 切到普通用户登录 → "项目群"Tab 可见列表但无"新建"按钮 → 进入详情页"设置"Tab 灰显
10. 删除项目群 → 子工作空间仍可在"我的项目"中正常访问

- [ ] **Step 4: 最终提交（如有遗漏的修复）**

```bash
cd /Users/zhaojh/code/AI-PM && git status
# 如有未提交修复
git add -A && git commit -m "fix: project group end-to-end polish"
```

---

## Self-Review 检查

**Spec 覆盖：**
- ✅ 数据模型（Task 1）
- ✅ 后端 API CRUD（Task 5）
- ✅ 后端聚合接口 6 个（Task 5）
- ✅ 权限：ADMIN 创建、创建者管理（Task 5 的 `_require_manage`）
- ✅ 前端 Tab 入口（Task 8）
- ✅ 前端 6 Tab 详情页（Task 9）
- ✅ 测试（Task 6）
- ⚠️ Alembic 迁移：spec 提到但代码库不用迁移（用 `create_all`），已在开头说明

**占位符扫描：** 无 TBD/TODO，所有代码块完整。

**类型一致性：** `ProjectGroup` interface 字段与后端 `_group_to_dict` 返回字段对齐；store 方法名与详情页调用一致。
