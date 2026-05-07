# AI-PM Plan 2 — 任务系统 + 知识库 实施计划

> **Prerequisite:** Foundation 完成（用户可登录、工作空间 CRUD 正常、RBAC 生效）
> **Goal:** 构建项目管理核心能力。实现 5 种任务类型层级、Sprint/Iteration、Kanban 看板、可配置工作流、估算、评论、需求摄入 Inbox、Git 版本化知识库、Markdown 编辑器、全文搜索。覆盖全部 5 个致命差距 + 3 个重要差距。

**Duration:** 6 周（30 个工作日）

---

## Week 1: 任务类型层级 + Sprint/Iteration

### Task 2.1.1: 任务类型层级 DB 迁移

**Files:**
- Create: `server/alembic/versions/xxxx_add_task_types.sql`

新增/修改字段：
- `tasks.task_type` ENUM: `EPIC`, `STORY`, `TASK`, `SUB_TASK`, `BUG`, `SPIKE`
- `tasks.parent_id` FK → tasks.id（自引用，建模层级关系）
- `tasks.epic_id` FK → tasks.id（Story → Epic 的直接链接，便于聚合查询）
- `tasks.priority` ENUM: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
- `tasks.severity` VARCHAR(20)（BUG 类型的严重级别）

### Task 2.1.2: 任务类型层级 API

**Files:**
- Create: `server/app/services/task.py`
- Create: `server/app/routers/tasks.py`

关键实现：
- **Epic CRUD** — 聚合子任务进度百分比、总计估算点数、风险信号灯
- **Story CRUD** — 链接到 Epic，非 Epics 可独立存在
- **Task/Sub-task** — 父任务状态自动更新规则（all children done → parent done）
- **Bug 类型** — 额外 severity 字段，可链接到 Story 或独立存在
- **Spike 类型** — 时间限制的任务，到期自动标记完成

端点：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/workspaces/{ws_id}/tasks` | 创建任务 |
| GET | `/api/workspaces/{ws_id}/tasks` | 任务列表（支持多条件筛选） |
| GET | `/api/workspaces/{ws_id}/tasks/{id}` | 任务详情（含子任务列表） |
| PATCH | `/api/workspaces/{ws_id}/tasks/{id}` | 更新任务 |
| DELETE | `/api/workspaces/{ws_id}/tasks/{id}` | 删除任务（软删除） |
| GET | `/api/workspaces/{ws_id}/tasks/{id}/children` | 子任务列表 |
| GET | `/api/workspaces/{ws_id}/epics` | Epic 列表（含聚合数据） |
| GET | `/api/workspaces/{ws_id}/epics/{id}/stories` | Epic 下的 Story 列表 |

### Task 2.1.3: Iteration/Sprint 模型

**Files:**
- Create: `server/alembic/versions/xxxx_add_iterations.sql`
- Create: `server/app/models/iteration.py`
- Create: `server/app/routers/iterations.py`

```python
# server/app/models/iteration.py
class Iteration(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "iterations"
    name: Mapped[str] = mapped_column(String(200))
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"))
    goal: Mapped[str] = mapped_column(Text, nullable=True)
    start_date: Mapped[date]
    end_date: Mapped[date]
    capacity_points: Mapped[float] = mapped_column(default=0)  # 团队容量
    committed_points: Mapped[float] = mapped_column(default=0)  # 已承诺点数
    status: Mapped[str] = mapped_column(String(20), default="PLANNING")  # PLANNING/ACTIVE/CLOSED

    tasks = relationship("Task", backref="iteration")
```

端点：
- CRUD: `/api/workspaces/{ws_id}/iterations`
- `POST /api/iterations/{id}/start` — 开启 Sprint
- `POST /api/iterations/{id}/close` — 关闭 Sprint（未完成任务迁移到 backlog）
- `GET /api/iterations/{id}/burndown` — 燃尽图数据

### Task 2.1.4: 前端 — 树形任务列表 + Sprint 规划视图

**Files:**
- Create: `apps/web/src/pages/workspace-detail/tabs/TasksTab.tsx`
- Create: `apps/web/src/components/task/TaskTree.tsx`
- Create: `apps/web/src/components/task/SprintPlanner.tsx`

- [ ] **TaskTree:** Epic 可折叠组 → Story 子项 → Task/Sub-task 缩进展示。每行显示类型徽章、分配者头像、优先级颜色、截止日期
- [ ] **SprintPlanner:** 左侧 backlog 池 + 右侧 Sprint 槽位（drag 任务进入 Sprint）。容量条显示 committed/capacity 百分比

---

## Week 2: 任务 CRUD + Kanban 看板

### Task 2.2.1: 扩展任务 CRUD

- [ ] 批量状态更新 `PATCH /api/tasks/batch-status`
- [ ] 批量分配 `PATCH /api/tasks/batch-assign`
- [ ] 多条件筛选 API：type, status, assignee_id, iteration_id, priority, due_date 范围, keyword 搜索
- [ ] 排序支持：priority, due_date, created_at, sort_order

### Task 2.2.2: 任务分配

- [ ] 分配人类：`PATCH /api/tasks/{id}/assign` — 更新 assignee_id
- [ ] 分配 AI Agent：`PATCH /api/tasks/{id}/assign` — 更新 agent_id（实际执行延迟到 Plan 3）
- [ ] 分配时触发通知事件（通知创建逻辑在 Plan 4 实现，此处留 hook）

### Task 2.2.3: Kanban 看板 — 后端

**Files:**
- Extend: `server/app/services/task.py`

```python
async def get_kanban_columns(workspace_id: str, db: AsyncSession):
    """按状态分组返回看板列数据"""
    columns = {}
    for state in ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]:
        tasks = await db.execute(
            select(Task).where(Task.workspace_id == workspace_id, Task.status == state)
            .order_by(Task.sort_order)
        )
        columns[state] = tasks.scalars().all()
    return columns

async def move_task(task_id: str, new_status: str, new_sort_order: int):
    """拖拽移动任务：更新状态和排序位置"""
```

端点：
- `GET /api/workspaces/{ws_id}/kanban` — 看板列数据
- `PATCH /api/tasks/{id}/move` — 拖拽移动（body: `{new_status, sort_order}`）

### Task 2.2.4: Kanban 看板 — 前端

**Files:**
- Create: `apps/web/src/components/task/KanbanBoard.tsx`

- [ ] 使用 `@dnd-kit/core` + `@dnd-kit/sortable` 实现拖拽
- [ ] 按工作流状态分列（默认 5 列：待开始/人工处理中/AI 执行中/待 Review/已完成）
- [ ] TaskCard 组件：类型徽章、分配者头像、优先级色条、截止日期
- [ ] 拖拽到不同列 = 状态变更，同一列内拖拽 = 重排序
- [ ] 空列显示「暂无任务」占位

### Task 2.2.5: 任务详情抽屉

**Files:**
- Create: `apps/web/src/components/task/TaskDetailDrawer.tsx`

- [ ] 右侧抽屉面板（Ant Design Drawer）
- [ ] 内容区块：基本信息、描述(Markdown 渲染)、验收标准、父任务/子任务列表、附件(占位)、评论(Week 3)、操作历史(时间线)
- [ ] 编辑模式：内联编辑标题、描述(Markdown 编辑器)、状态、优先级、类型、分配者

---

## Week 3: 工作流引擎 + 评论 + 估算

### Task 2.3.1: 工作流引擎 — DB + API

**Files:**
- Create: `server/alembic/versions/xxxx_add_workflow.sql`
- Create: `server/app/models/workflow.py`
- Create: `server/app/services/workflow.py`

```python
# server/app/models/workflow.py
class WorkflowTemplate(Base, UUIDMixin):
    __tablename__ = "workflow_templates"
    name: Mapped[str]
    description: Mapped[str] = mapped_column(nullable=True)
    is_builtin: Mapped[bool] = mapped_column(default=False)

class WorkflowState(Base, UUIDMixin):
    __tablename__ = "workflow_states"
    template_id: Mapped[str] = mapped_column(ForeignKey("workflow_templates.id"))
    name: Mapped[str]              # TODO / In Progress / In Review / Done
    order: Mapped[int]
    category: Mapped[str]          # TODO / IN_PROGRESS / DONE

class WorkflowTransition(Base, UUIDMixin):
    __tablename__ = "workflow_transitions"
    template_id: Mapped[str] = mapped_column(ForeignKey("workflow_templates.id"))
    from_state_id: Mapped[str] = mapped_column(ForeignKey("workflow_states.id"))
    to_state_id: Mapped[str] = mapped_column(ForeignKey("workflow_states.id"))
    name: Mapped[str]
```

- [ ] 预置「标准软件开发」模板：Backlog → To Do → In Progress → In Review → QA → Done
- [ ] 预置「运营项目」模板：Backlog → Doing → Review → Done
- [ ] 工作流选用 API：`PUT /api/workspaces/{ws_id}/workflow`

### Task 2.3.2: 工作流可视化（前端）

**Files:**
- Create: `apps/web/src/components/workflow/WorkflowEditor.tsx`

- [ ] 状态列展示，带颜色编码
- [ ] 过渡箭头连接状态
- [ ] 工作空间设置中显示当前使用的工作流模板

### Task 2.3.3: 评论系统

**Files:**
- Create: `server/alembic/versions/xxxx_add_comments.sql`
- Create: `server/app/models/comment.py`
- Create: `server/app/routers/comments.py`

```python
# server/app/models/comment.py
class Comment(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "comments"
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    parent_comment_id: Mapped[str] = mapped_column(ForeignKey("comments.id"), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    mentions: Mapped[dict] = mapped_column(JSON, default=list)  # @提及的用户 ID 列表
```

端点：
- `GET /api/tasks/{id}/comments` — 评论列表（线程化）
- `POST /api/tasks/{id}/comments` — 发表评论
- `PATCH /api/comments/{id}` — 编辑评论
- `DELETE /api/comments/{id}` — 删除评论

前端：
- [ ] 线程化回复（盖楼）
- [ ] @提及自动补全（从工作空间成员列表中搜索）
- [ ] 评论 Markdown 渲染

### Task 2.3.4: 任务估算

- [ ] 数据库加列：`tasks.estimation` DECIMAL，`tasks.estimation_unit` ENUM（STORY_POINTS / HOURS / T_SHIRT）
- [ ] 前端：任务表单中估算输入（数字 + 单位下拉）
- [ ] Epic 聚合显示总估算点数
- [ ] Sprint 承诺点数 vs 容量对比

---

## Week 4: 需求摄入 + 知识库基础

### Task 2.4.1: 需求摄入 Inbox

**Files:**
- Create: `server/alembic/versions/xxxx_add_requirement_inbox.sql`
- Create: `server/app/models/requirement_inbox.py`
- Create: `server/app/routers/requirements.py`

```python
# server/app/models/requirement_inbox.py
class RequirementInbox(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "requirement_inbox"
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(20))  # MANUAL / WECOM_BOT / EMAIL
    submitter_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="TRIAGE")  # TRIAGE / ACCEPTED / REJECTED / CONVERTED
    converted_task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    triage_note: Mapped[str] = mapped_column(Text, nullable=True)  # 评审意见
```

端点：
- `POST /api/requirements` — 提交需求
- `GET /api/requirements` — 需求列表（按状态筛选）
- `PATCH /api/requirements/{id}/triage` — 评审：接受/拒绝/转换
- `POST /api/requirements/{id}/convert` — 转换为任务/Epic

前端：
- [ ] Inbox 页面/面板：需求列表 + 操作按钮（接受→创建任务、拒绝+理由、延迟）
- [ ] 状态筛选：待评审/已接受/已拒绝/已转换

### Task 2.4.2: 知识库 CRUD API

**Files:**
- Create: `server/app/services/document.py`
- Create: `server/app/routers/documents.py`

端点：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/workspaces/{ws_id}/docs` | 创建文档（Markdown 文本或文件上传） |
| GET | `/api/workspaces/{ws_id}/docs` | 文档列表（支持分类/标签筛选） |
| GET | `/api/docs/{id}` | 获取文档内容 |
| PATCH | `/api/docs/{id}` | 更新文档 |
| DELETE | `/api/docs/{id}` | 删除文档 |
| GET | `/api/docs/{id}/versions` | 版本历史列表 |
| GET | `/api/docs/{id}/versions/{version}` | 获取特定版本内容 |
| POST | `/api/docs/{id}/revert/{version}` | 回滚到指定版本 |
| GET | `/api/docs/{id}/diff?v1=X&v2=Y` | 两个版本 Diff |

### Task 2.4.3: Git 版本化

**Files:**
- Create: `server/app/services/git_storage.py`

```python
# server/app/services/git_storage.py
from git import Repo
from pathlib import Path

class GitDocumentStore:
    def __init__(self, repos_path: str):
        self.repos_path = Path(repos_path)

    def get_or_init_repo(self, workspace_id: str) -> Repo:
        """获取或初始化工作空间的 Git 仓库"""
        repo_path = self.repos_path / workspace_id
        if not repo_path.exists():
            repo_path.mkdir(parents=True)
            return Repo.init(repo_path)
        return Repo(repo_path)

    def save_document(self, workspace_id: str, doc_id: str, content: str, author_name: str):
        """保存文档并提交到 Git"""
        repo = self.get_or_init_repo(workspace_id)
        doc_path = repo.working_dir / f"{doc_id}.md"
        doc_path.write_text(content, encoding="utf-8")
        repo.index.add([str(doc_path)])
        repo.index.commit(f"Update {doc_id}\n\nAuthor: {author_name}")

    def get_version_history(self, workspace_id: str, doc_id: str):
        """获取文档的提交历史"""
        repo = self.get_or_init_repo(workspace_id)
        return list(repo.iter_commits(paths=f"{doc_id}.md"))

    def get_version_content(self, workspace_id: str, doc_id: str, commit_hash: str):
        """获取特定版本的文档内容"""
        repo = self.get_or_init_repo(workspace_id)
        return repo.git.show(f"{commit_hash}:{doc_id}.md")
```

### Task 2.4.4: 知识库标签页（前端基础）

**Files:**
- Create: `apps/web/src/pages/workspace-detail/tabs/KnowledgeTab.tsx`

- [ ] 左侧文件树（按分类/文件夹组织，MVP 阶段用标签/tag 模拟文件夹）
- [ ] 右侧文档列表（类型图标、标题、最后修改时间、版本号、作者）
- [ ] 新建文档按钮（Markdown / 文件上传）

---

## Week 5: Markdown 编辑器 + 版本历史 + 搜索

### Task 2.5.1: Markdown 编辑器

**Files:**
- Create: `apps/web/src/components/editor/MarkdownEditor.tsx`

- [ ] 集成 `@uiw/react-md-editor`（或 Milkdown），分栏（左编辑右预览）
- [ ] 工具栏：B/I/H1/H2/H3/列表/引用/链接/图片/表格/代码块
- [ ] 自动保存（debounced 2s），保存状态指示器
- [ ] 暗色/亮色切换（跟随编辑器主题）

### Task 2.5.2: 文件预览

- [ ] PDF：iframe 内嵌预览或 pdf.js
- [ ] Word/Excel：服务端转 HTML 预览或提供下载链接
- [ ] 图片：lightbox 灯箱查看

### Task 2.5.3: 版本历史 UI

**Files:**
- Create: `apps/web/src/components/document/VersionHistory.tsx`

- [ ] 时间线显示提交记录（版本号、作者、时间、提交信息）
- [ ] 点击查看旧版本渲染内容
- [ ] Diff 视图：选中两个版本 → 并排文本 diff（绿色=新增，红色=删除）

### Task 2.5.4: 全文搜索

**Files:**
- Create: `server/app/services/search.py`
- Create: `server/app/routers/search.py`

```sql
-- MySQL FULLTEXT 索引，ngram parser 支持中文
ALTER TABLE tasks ADD FULLTEXT INDEX ft_tasks (title, description) WITH PARSER ngram;
ALTER TABLE documents ADD FULLTEXT INDEX ft_docs (title, content) WITH PARSER ngram;
```

```python
# server/app/services/search.py
async def search(db: AsyncSession, keyword: str, workspace_id: str = None, type: str = "all"):
    results = {"tasks": [], "documents": []}
    if type in ("all", "task"):
        query = select(Task).where(
            Task.title.contains(keyword) | Task.description.contains(keyword)
        ).limit(20)
        results["tasks"] = (await db.execute(query)).scalars().all()
    if type in ("all", "doc"):
        query = select(Document).where(
            Document.title.contains(keyword) | Document.content.contains(keyword)
        ).limit(20)
        results["documents"] = (await db.execute(query)).scalars().all()
    return results
```

端点：`GET /api/search?q=keyword&type=task|doc|all&workspace_id=`

前端：全局顶栏搜索框 → 下拉结果面板（任务结果 + 文档结果，按类型分组）

---

## Week 6: 页面富化 + 集成测试

### Task 2.6.1: 工作台富化

- [ ] 统计卡片 → 真实数据（我的待办数、逾期任务数、活跃 Sprint 数、团队负载）
- [ ] 待决策清单 → IN_REVIEW 状态的任务列表
- [ ] 项目关注列表 → 用户 star 的工作空间 + 进度条

### Task 2.6.2: 个人中心待办 + Review 队列

**Files:**
- Create: `apps/web/src/pages/personal/tabs/TodosTab.tsx`
- Create: `apps/web/src/pages/personal/tabs/ReviewQueueTab.tsx`

- [ ] **我的待办：** 分配给我的所有任务，按工作空间分组，按优先级+截止日期排序
- [ ] **Review 队列：** Agent 产出的 Review 任务列表，接受/驳回操作按钮
- [ ] 任务内联状态快速切换

### Task 2.6.3: 工作指引子视图

**Files:**
- Create: `apps/web/src/pages/workspace-detail/tabs/GuideTab.tsx`

- [ ] 工作空间元数据展示（名称、类型、状态、创建时间）
- [ ] 关键里程碑时间线（Iteration 汇总）
- [ ] 团队活跃度摘要

### Task 2.6.4: 端到端测试

- [ ] 创建 Epic → 添加 3 个 Story → 分解为 Tasks → 分配成员 → 看板拖拽
- [ ] 创建 Sprint → 从 backlog 拖任务到 Sprint → 开始 Sprint → 完成部分任务 → 查看燃尽图
- [ ] 创建文档 → 编辑 3 次 → 查看版本历史 → Diff 两个版本 → 回滚
- [ ] 全文搜索中文关键词 → 验证返回任务和文档结果
- [ ] 需求摄入：提交需求 → 评审 → 接受 → 转换为 Epic → 确认在任务列表可见

---

## 验证清单

- [ ] 创建 Epic → 添加 Story → 创建 Task/Sub-task → 验证层级展开/折叠
- [ ] 开始 Sprint → 添加 20 pts 任务到 30 pts 容量 → 验证容量条 67%
- [ ] 看板拖拽任务从 TODO → IN_PROGRESS → 刷新验证状态持久化
- [ ] 切换工作流模板 → 验证看板列相应变化
- [ ] 评论区 @mention 同事 → 验证被提及者收到提示
- [ ] 上传 Markdown 文档 → 编辑 3 次 → 查看版本历史 → Diff 两个版本
- [ ] 搜索「数据库设计」→ 验证返回标题或内容包含该关键词的任务和文档
- [ ] 需求摄入：提交 → Triage → 接受并转换为 Epic → 验证 Epic 在工作空间可见

**预计总工时：6 周（30 个工作日）**
