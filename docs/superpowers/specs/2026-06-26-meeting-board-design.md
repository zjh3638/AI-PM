# 会议功能升级 — 设计文档

## 1. 概述

当前会议功能（BigScreenPage）仅为一次性投屏视图，无持久化会议实体，不支持项目群维度。本次升级将会议变为完整的生命周期管理。

### 核心变化

| 维度 | 当前 | 目标 |
|------|------|------|
| 会议实体 | 无 | Meeting 模型，可追溯历史 |
| 组织维度 | 公司/部门/项目 | 项目群 + 项目 |
| 看板内容 | KPI卡片 + 简单脉搏 | 里程碑审查 + 完成/延期/风险详情 |
| 会议记录 | 无 | 聊天式记录 + AI 优化纪要 |
| 纪要导出 | 无 | 下载 Markdown/PDF + 发送邮件 |

## 2. 用户流程

```
创建会议 → 选择维度(项目群/项目) → 开会看板
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                      整体进展     里程碑审查     风险列表
                          │            │            │
                          └────────────┼────────────┘
                                       ▼
                              右侧面板实时记录
                                       │
                                       ▼
                              AI 优化生成纪要
                                       │
                                       ▼
                              确认 → 下载/发送邮件
```

## 3. 数据模型

### 3.1 Meeting 表

```python
class Meeting(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "meetings"

    title: str                          # 会议标题
    dimension: str                      # "PROJECT_GROUP" | "PROJECT"
    dimension_id: str                   # 项目群ID 或 项目(workspace)ID
    meeting_type: str                   # "STANDUP" | "WEEKLY" | "ADHOC"
    status: str                         # "ACTIVE" | "CLOSED"
    summary: Optional[str]              # AI 生成的会议纪要
    notes: Optional[list]               # JSON，会议记录列表
    host_id: str                        # 主持人
```

- `dimension` + `dimension_id` 确定会议归属
- `notes` 存储聊天式记录：`[{who, text, time, type: "speech"|"decision"|"action"}]`
- `summary` 存储 AI 优化后的结构化纪要

### 3.2 API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/meetings` | 创建会议 |
| GET | `/meetings/{id}` | 会议详情 |
| GET | `/meetings/{id}/board?workspace_id=` | 看板聚合数据 |
| POST | `/meetings/{id}/notes` | 添加会议记录 |
| POST | `/meetings/{id}/generate-summary` | AI 生成纪要 |
| POST | `/meetings/{id}/close` | 结束会议 |

## 4. 看板 API 数据结构

`GET /meetings/{id}/board?workspace_id=xxx`

```json
{
  "project": {
    "id": "...", "name": "AI-PM平台", "owner_name": "张三",
    "health": "on-track", "pct": 68, "total_tasks": 120,
    "done": 82, "overdue": 3
  },
  "milestones": [{
    "id": "...", "name": "MVP v1", "phase": "ACTIVE",
    "pct": 80, "due_date": "2026-07-15", "overdue": false,
    "total_tasks": 15, "done_tasks": 12,
    "completed": [{ "title": "...", "assignee_name": "张三", "completed_at": "..." }],
    "in_progress": [{ "title": "...", "assignee_name": "李四", "status": "IN_PROGRESS" }],
    "delayed": [{ "title": "...", "assignee_name": "张三", "due_date": "...", "reason": "..." }]
  }],
  "risks": [{
    "id": "...", "title": "...", "description": "...",
    "level": "HIGH", "owner_name": "张三", "status": "MITIGATING",
    "milestone_name": "MVP v1"
  }],
  "recent_completed": [{ "title": "...", "assignee_name": "...", "completed_at": "..." }]
}
```

## 5. 前端页面结构

### 5.1 路由

- `/meetings/:id` → MeetingBoardPage

### 5.2 页面布局

```
┌─ Header ─────────────────────────────────────────────┐
│ 面包屑 · 会议标题 · 时间  │ 步骤: [看板] [纪要]      │
├──────────────────────────────────┬────────────────────┤
│ 项目切换器（项目群维度时显示）   │                    │
│ 摘要条（项目名 + 完成率 + 统计） │  📝 会议记录       │
│                                  │                    │
│ [整体进展] [里程碑] [风险]       │  🧑 张三: ...      │
│ ┌────────────────────────────┐  │  🧑 李四: ...      │
│ │ 里程碑详情                  │  │  📌 决议: ...      │
│ │  ✅ 已完成                  │  │                    │
│ │  🔄 进行中                  │  │  ┌──────────────┐  │
│ │  ⚠️ 延期                    │  │  │ 快速输入框   │  │
│ └────────────────────────────┘  │  └──────────────┘  │
│                                  │  [🤖 AI优化纪要]   │
└──────────────────────────────────┴────────────────────┘
```

### 5.3 三个看板 Tab

**整体进展**：完成率大数字 + 进度条 + 状态分布 + 最近7天完成列表

**里程碑**：每个里程碑一个可折叠卡片
- **折叠态**：显示里程碑名称、完成进度条、百分比、截止日、逾期状态，以及最近的关键动态摘要（如"张三完成了用户登录模块 · 2小时前"）
- **展开态**：展开三组表格（已完成/进行中/延期），里程碑逾期红色高亮
- 默认全部折叠，点击卡片展开/收起

**风险**：风险条目列表，关联到对应里程碑，显示等级/描述/负责人/状态

### 5.4 会议记录面板

- 宽度 320px，右侧固定
- 聊天式展示：头像 + 发言人 + 内容 + 时间
- 支持系统消息类型（决议/待办）
- 底部快速输入框，回车发送
- 「AI 优化纪要」按钮

### 5.5 纪要页面

- 切换步骤到「纪要」，全宽展示
- AI 结构化输出：概览 / 里程碑进展 / 风险 / 记录摘要 / 待办
- 操作按钮：下载 Markdown / 导出 PDF / 发送邮件 / 编辑

### 5.6 投屏模式

- 页面级 CSS class 切换（`presenting`）
- 亮色 → 深色主题
- 右侧记录面板隐藏，看板全宽

## 6. 文件规划

### 后端

| 文件 | 内容 |
|------|------|
| `server/app/models/meeting.py` | Meeting 模型 |
| `server/app/routers/meetings.py` | 会议 CRUD + 看板 API |
| `server/app/services/meeting.py` | 会议服务层（聚合查询 + AI 纪要生成） |
| `server/app/schemas/meeting.py` | Pydantic schema |

### 前端

| 文件 | 内容 |
|------|------|
| `apps/web/src/pages/meeting/MeetingBoardPage.tsx` | 页面主组件 |
| `apps/web/src/pages/meeting/ProjectSwitcher.tsx` | 项目切换器 |
| `apps/web/src/pages/meeting/OverviewTab.tsx` | 整体进展 Tab |
| `apps/web/src/pages/meeting/MilestoneTab.tsx` | 里程碑 Tab |
| `apps/web/src/pages/meeting/RiskTab.tsx` | 风险 Tab |
| `apps/web/src/pages/meeting/NotesPanel.tsx` | 会议记录面板 |
| `apps/web/src/pages/meeting/MinutesView.tsx` | 纪要视图 |
| `apps/web/src/styles/meeting.css` | 会议样式 |

## 7. 里程碑数据迁移

本次升级新增 `meetings` 表，需生成 Alembic 迁移文件。

## 8. 状态

- [x] 设计文档完成
- [ ] 实现计划
- [ ] 后端实现
- [ ] 前端实现
- [ ] 联调测试
