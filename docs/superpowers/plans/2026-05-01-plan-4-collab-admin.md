# AI-PM Plan 4 — 协作 + 系统管理 实施计划

> **Prerequisite:** Plan 2 任务系统完成（会议大屏需要任务数据），Plan 3 AI 引擎可用（自动化引擎需要 AI 辅助）
> **Goal:** 完成 MVP 全部功能。会议大屏（3 层级实时展示）、通知系统（站内+企微+邮件）、WeChat Work 深度集成（组织同步+消息推送+Bot）、自动化规则引擎、Webhook API、系统管理 6 个子模块。

**Duration:** 6-7 周（30-35 个工作日）

---

## Week 1: 会议大屏

### Task 4.1.1: 会议数据 API

**Files:**
- Create: `server/app/services/meeting.py`
- Create: `server/app/routers/meetings.py`

```python
# server/app/services/meeting.py
async def get_company_key_projects(db: AsyncSession):
    """公司重点项目：标记为 COMPANY_KEY 优先级的工作空间"""
    workspaces = await db.execute(
        select(Workspace).where(Workspace.priority == "COMPANY_KEY", Workspace.status == "ACTIVE")
    )
    result = []
    for ws in workspaces.scalars():
        # 聚合任务进度
        tasks_done = await _count_tasks(ws.id, status="DONE")
        tasks_total = await _count_tasks(ws.id)
        # 风险信号
        risks = await _get_active_risks(ws.id)
        # 里程碑进度
        milestones = await _get_milestones(ws.id)
        result.append({
            "id": ws.id, "name": ws.name,
            "progress": tasks_done / max(tasks_total, 1) * 100,
            "stage": ws.current_stage,
            "risks": risks,
            "milestones": milestones,
            "owner": await _get_workspace_owner(ws.id),
        })
    return result

async def get_department_key_projects(db: AsyncSession, department_id: str):
    """部门重点项目：本部门 + 优先级 DEPARTMENT_KEY 的工作空间"""
    ...

async def get_other_projects(db: AsyncSession, user_id: str):
    """其他项目：当前用户参与的，非重点标记的工作空间"""
    ...

async def get_standup_data(workspace_id: str, db: AsyncSession):
    """站会模式数据：昨日完成 / 今日计划 / 阻塞项"""
    ...

async def get_weekly_data(workspace_id: str, db: AsyncSession):
    """周会模式数据：健康度评分 / 风险登记表 / 下周计划"""
    ...
```

端点：
- `GET /api/meetings/company-key` — 公司重点项目数据
- `GET /api/meetings/department-key` — 部门重点项目数据
- `GET /api/meetings/other` — 其他项目数据
- `GET /api/meetings/workspace/{id}/standup` — 指定工作空间站会数据
- `GET /api/meetings/workspace/{id}/weekly` — 指定工作空间周会数据

### Task 4.1.2: 会议大屏前端

**Files:**
- Create: `apps/web/src/pages/meeting/MeetingScreen.tsx`
- Create: `apps/web/src/components/meeting/CompanyKeyView.tsx`
- Create: `apps/web/src/components/meeting/DepartmentKeyView.tsx`
- Create: `apps/web/src/components/meeting/OtherProjectsView.tsx`

- [ ] **3 层级 Tab 切换：** 公司重点 / 部门重点 / 其他项目
- [ ] **公司重点视图：**
  - 管线阶段条（每个项目显示当前阶段、进度百分比）
  - 风险/阻塞项高亮（红色感叹号）
  - 资源总体概览
- [ ] **部门重点视图：**
  - 3 列卡片布局（按项目阶段分组）
  - 每张卡片显示进度条 + 关键事项
- [ ] **其他项目视图：**
  - 紧凑卡片网格
  - 鼠标悬停显示详情 Tooltip
- [ ] **站会/周会模式切换：**
  - 站会：手风琴展开每个工作空间的昨日/今日/阻塞
  - 周会：健康度仪表盘 + 风险清单 + 下周计划
- [ ] **投屏模式：** 全屏按钮 → 暗色背景 + 大字体 + 隐藏非核心 UI

### Task 4.1.3: 会议权限控制

```python
# 会议数据权限（参考 permissions.md Section 10）
# - 公司重点：SUPER_ADMIN 可见全部，ADMIN 可见本部门
# - 部门重点：部门成员可见
# - 其他项目：仅本人参与的工作空间
```

---

## Week 2: 通知系统

### Task 4.2.1: 通知系统后端

**Files:**
- Create: `server/app/services/notification.py`
- Create: `server/app/routers/notifications.py`

```python
# server/app/services/notification.py
from enum import Enum
from datetime import datetime

class NotificationType(str, Enum):
    TASK_ASSIGNED = "TASK_ASSIGNED"
    TASK_DUE_SOON = "TASK_DUE_SOON"
    TASK_OVERDUE = "TASK_OVERDUE"
    TASK_COMMENTED = "TASK_COMMENTED"
    AGENT_EXECUTION_COMPLETED = "AGENT_EXECUTION_COMPLETED"
    REVIEW_REQUESTED = "REVIEW_REQUESTED"
    MENTIONED = "MENTIONED"
    WORKSPACE_INVITED = "WORKSPACE_INVITED"
    DAILY_REPORT_READY = "DAILY_REPORT_READY"
    RISK_WARNING = "RISK_WARNING"

class NotificationService:
    async def send(self, user_id: str, type: NotificationType, title: str,
                   content: str, resource_type: str = None, resource_id: str = None):
        """创建通知记录 + 推送（WebSocket + 企微 + 邮件）"""
        notification = Notification(
            user_id=user_id, type=type, title=title, content=content,
            resource_type=resource_type, resource_id=resource_id,
        )
        self.db.add(notification)
        await self.db.commit()

        # 实时推送
        await self._push_ws(user_id, notification)
        # 企微推送（如启用）
        await self._push_wecom(user_id, notification)
        # 邮件推送（如启用）
        await self._push_email(user_id, notification)

    async def _push_ws(self, user_id: str, notification):
        """通过 WebSocket 向指定用户推送通知"""
        ...
```

端点：
- `GET /api/notifications` — 通知列表（分页，含未读计数）
- `GET /api/notifications/unread-count` — 未读计数
- `PATCH /api/notifications/{id}/read` — 标记已读
- `PATCH /api/notifications/read-all` — 全部标记已读
- `GET /api/notifications/ws` — WebSocket 连接端点

事件触发 Hook（在相关 Service 中调用 `NotificationService.send()`）：

| 事件 | 触发位置 | 接受者 |
|------|---------|--------|
| 任务分配 | `task.assign()` | 被分配者 |
| 任务即将到期 | 定时扫描 | 分配者 |
| 任务新增评论 | `comment.create()` | 任务关注者 |
| Agent 执行完成 | `agent_executor.execute()` 完成时 | 任务委托者 |
| Review 请求 | Agent 产出完成 | 任务委托者 |
| @提及 | 评论创建 | 被提及者 |
| 日报生成完成 | `report.generate_daily()` | 工作空间成员 |
| 风险预警 | `memory.warn_risks()` | 工作空间 Owner/Manager |

### Task 4.2.2: 通知偏好配置

**Files:**
- Create: `server/alembic/versions/xxxx_add_notification_prefs.sql`
- Create: `server/app/models/notification_preference.py`

```python
class NotificationPreference(Base, UUIDMixin):
    __tablename__ = "notification_preferences"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    event_type: Mapped[str]
    channel: Mapped[str]   # IN_APP / EMAIL / WECOM
    enabled: Mapped[bool] = mapped_column(default=True)
```

端点：
- `GET /api/users/me/notification-preferences` — 获取偏好
- `PUT /api/users/me/notification-preferences` — 更新偏好

### Task 4.2.3: 通知中心前端

**Files:**
- Create: `apps/web/src/components/notification/NotificationBell.tsx`
- Create: `apps/web/src/components/notification/NotificationDropdown.tsx`

- [ ] **铃铛图标：** 顶栏右侧，显示未读计数 Badge
- [ ] **下拉面板：** 最近 10 条通知，每条含类型图标、标题、时间、已读/未读状态
- [ ] **全部通知页：** 完整列表，筛选（全部/未读/按类型），批量标记已读
- [ ] **点击跳转：** 任务通知 → 跳转任务详情；评论通知 → 跳转评论位置
- [ ] **通知偏好设置页：** 事件类型(行) × 渠道(列) 的 Toggle 网格

### Task 4.2.4: 个人中心消息中心

**Files:**
- Update: `apps/web/src/pages/personal/tabs/MessageCenterTab.tsx`

- [ ] 消息列表（全部/未读/按类型筛选）
- [ ] 搜索消息
- [ ] 批量操作：标记已读、删除

---

## Week 3: WeChat Work 深度集成 + LDAP 同步

### Task 4.3.1: 组织架构同步

**Files:**
- Extend: `server/app/integrations/wecom.py`

```python
# server/app/integrations/wecom.py (扩展)

async def sync_departments(access_token: str, db: AsyncSession):
    """从企微同步部门树到本地 departments 表"""
    dept_list = await _fetch_wecom_departments(access_token)
    for dept in dept_list:
        existing = await db.get(Department, str(dept["id"]))
        if existing:
            existing.name = dept["name"]
            existing.parent_id = str(dept["parentid"])
        else:
            db.add(Department(
                id=str(dept["id"]), name=dept["name"],
                parent_id=str(dept["parentid"]) if dept.get("parentid") else None,
            ))
    await db.commit()

async def sync_users(access_token: str, db: AsyncSession):
    """从企微同步用户到本地 users 表"""
    dept_users = await _fetch_wecom_users(access_token, department_id=1)
    for wu in dept_users:
        existing = await db.execute(select(User).where(User.username == wu["userid"]))
        user = existing.scalar_one_or_none()
        if user:
            user.display_name = wu["name"]
            user.department_id = str(wu.get("department", [None])[-1])
        else:
            db.add(User(
                username=wu["userid"], display_name=wu["name"],
                email=wu.get("email"), source="WECOM",
                department_id=str(wu.get("department", [None])[-1]),
            ))
    await db.commit()

async def scheduled_sync(db: AsyncSession):
    """定时同步任务（每 2 小时）"""
    token = await wecom_get_access_token()
    await sync_departments(token, db)
    await sync_users(token, db)
```

### Task 4.3.2: 消息推送

```python
async def send_wecom_message(user_id: str, content: dict):
    """通过企微应用消息 API 推送通知"""
    token = await wecom_get_access_token()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://qyapi.weixin.qq.com/cgi-bin/message/send",
            params={"access_token": token},
            json={
                "touser": user_id,
                "msgtype": "textcard",
                "agentid": settings.wecom_agent_id,
                "textcard": {
                    "title": content["title"],
                    "description": content["description"],
                    "url": content.get("url", ""),
                }
            }
        )
        return resp.json()
```

支持的消息类型：
- 任务分配通知
- 任务即将到期提醒
- Agent 执行完成通知
- 风险预警（仅推送给 Owner/Manager）
- 每日站报摘要

### Task 4.3.3: 企微 Bot

```python
# server/app/routers/wecom_bot.py

@router.post("/api/wecom/bot/callback")
async def wecom_bot_callback(
    msg_signature: str, timestamp: str, nonce: str, echostr: str = None,
    body: dict = None,
):
    """企微 Bot 回调处理"""
    # 验证签名
    # 解密消息
    # 路由到命令处理器

async def handle_bot_command(user_id: str, command: str, args: str, db: AsyncSession):
    """处理 Bot 命令"""
    commands = {
        "/tasks": cmd_my_tasks,        # 查询我的任务
        "/status": cmd_workspace_status, # 查询工作空间状态
        "/create": cmd_create_task,     # 创建简单任务（调用 AI PM Agent）
        "/help": cmd_help,              # 显示可用命令
    }
    handler = commands.get(command)
    if handler:
        return await handler(user_id, args, db)
    return "未知命令。可用命令：/tasks /status /create /help"
```

### Task 4.3.4: LDAP 用户同步

**Files:**
- Extend: `server/app/integrations/ldap.py`

```python
async def sync_ldap_users(db: AsyncSession):
    """从 LDAP 目录同步用户"""
    if not settings.ldap_enabled:
        return

    server = ldap3.Server(settings.ldap_url)
    conn = ldap3.Connection(server, auto_bind=True)
    conn.search(settings.ldap_base_dn, "(objectClass=person)",
                attributes=["uid", "cn", "mail", "departmentNumber"])

    for entry in conn.entries:
        # 创建或更新本地用户
        ...
    conn.unbind()
```

- [ ] LDAP 组 → 系统角色映射配置（Super Admin/Admin/Member）
- [ ] 定时同步调度（每天凌晨）
- [ ] 同步日志记录

### Task 4.3.5: 企微配置页（系统管理）

**Files:**
- Create: `apps/web/src/pages/admin/tabs/WecomConfigTab.tsx`

- [ ] CorpID / AgentID / Secret / Token / EncodingAESKey 配置表单
- [ ] 测试连接按钮 → 调用企微 API 验证
- [ ] 手动同步触发按钮
- [ ] 同步状态指示灯（上次同步时间、同步人数）
- [ ] Bot 状态指示灯

---

## Week 4: 系统管理 6 子模块

### Task 4.4.1: 用户管理

**Files:**
- Create: `apps/web/src/pages/admin/AdminPage.tsx` — 管理页入口 + 侧边栏
- Create: `apps/web/src/pages/admin/tabs/UserManagementTab.tsx`

- [ ] 用户列表表格（用户名、显示名、邮箱、部门、系统角色、来源、状态）
- [ ] 搜索筛选：用户名/邮箱关键词、部门下拉、状态筛选
- [ ] 添加用户表单（手动创建 / LDAP 导入）
- [ ] 编辑用户：部门、角色、状态
- [ ] 批量操作：启用/禁用、角色分配
- [ ] 列表分页

### Task 4.4.2: 权限/角色管理

**Files:**
- Create: `apps/web/src/pages/admin/tabs/RoleManagementTab.tsx`

- [ ] 角色列表（内置 4 个 + 自定义角色）
- [ ] 角色详情：系统角色级别、数据范围、页面权限矩阵、操作权限矩阵
- [ ] 创建自定义角色：克隆内置角色 + 修改权限
- [ ] 为角色分配用户
- [ ] 权限矩阵编辑器（表格，复选框开关）

### Task 4.4.3: Agent 管理

**Files:**
- Create: `apps/web/src/pages/admin/tabs/AgentManagementTab.tsx`

- [ ] Agent 列表（角色图标 + 名称 + 绑定模型 + 状态）
- [ ] 编辑 Agent：
  - System Prompt（代码编辑器，Monaco Editor 或简洁 textarea）
  - 模型绑定（下拉选择已注册的模型）
  - 工具选择（复选框：task_tools / doc_tools / report_tools）
  - 启用/禁用开关
  - 工作空间范围（全局 / 限定部分工作空间）
- [ ] 「测试 Agent」按钮 → 发送测试任务 → 查看响应

### Task 4.4.4: 系统设置

**Files:**
- Create: `apps/web/src/pages/admin/tabs/SystemSettingsTab.tsx`

- [ ] 编辑企业名称 + Logo 上传
- [ ] 默认语言（中文/英文）
- [ ] 时区选择
- [ ] 密码策略：最小长度、复杂度要求（大小写+数字+符号）
- [ ] 会话超时（分钟）
- [ ] IP 白名单（可选）
- [ ] 保存 → 写入 `system_settings` 表

### Task 4.4.5: 审计日志

**Files:**
- Create: `apps/web/src/pages/admin/tabs/AuditLogTab.tsx`

- [ ] 日志表格（时间、用户、操作、资源类型、资源 ID、IP 地址）
- [ ] 筛选：用户、操作类型、资源类型、日期范围
- [ ] 导出 CSV
- [ ] 日志自动记录（在关键操作中间件记录）：

```python
# 审计日志中间件（扩展 server/app/middleware.py）
async def audit_log_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.method in ("POST", "PATCH", "PUT", "DELETE"):
        # 记录变更操作
        await _log_audit(user_id, action, resource_type, resource_id, ip)
    return response
```

### Task 4.4.6: 系统管理导航

- [ ] 侧边栏 6 个子模块导航
- [ ] 管理首页：系统概览（用户数、工作空间数、Agent 执行统计、近期错误数）

---

## Week 5: 自动化引擎 + Webhook + 分析 + 测试

### Task 4.5.1: 自动化规则引擎

**Files:**
- Create: `server/alembic/versions/xxxx_add_automation.sql`
- Create: `server/app/models/automation_rule.py`
- Create: `server/app/services/automation.py`

```python
# server/app/models/automation_rule.py
class AutomationRule(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "automation_rules"
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"))
    name: Mapped[str]
    description: Mapped[str] = mapped_column(nullable=True)
    trigger_type: Mapped[str]  # STATUS_CHANGE / TIME_SCHEDULE / TASK_CREATED / AGENT_COMPLETED
    trigger_config: Mapped[dict] = mapped_column(JSON)  # trigger 的参数
    conditions: Mapped[list] = mapped_column(JSON, default=list)  # 条件列表
    actions: Mapped[list] = mapped_column(JSON)  # 动作列表
    enabled: Mapped[bool] = mapped_column(default=True)
```

```python
# server/app/services/automation.py
class AutomationEngine:
    """规则引擎。事件驱动：触发器匹配 → 条件评估 → 动作执行。"""

    async def on_event(self, event_type: str, workspace_id: str, payload: dict):
        """事件发生时检查所有匹配规则"""
        rules = await self._get_matching_rules(workspace_id, event_type)
        for rule in rules:
            if await self._evaluate_conditions(rule.conditions, payload):
                await self._execute_actions(rule.actions, payload)

    async def _evaluate_conditions(self, conditions: list, payload: dict) -> bool:
        """评估条件是否满足"""
        for cond in conditions:
            field_value = payload.get(cond["field"])
            if not self._match(field_value, cond["operator"], cond["value"]):
                return False
        return True

    async def _execute_actions(self, actions: list, payload: dict):
        """执行动作"""
        for action in actions:
            if action["type"] == "CREATE_TASK":
                await self._create_task_from_template(action["config"])
            elif action["type"] == "UPDATE_STATUS":
                await self._update_task_status(action["config"])
            elif action["type"] == "SEND_NOTIFICATION":
                await self._send_notification(action["config"])
            elif action["type"] == "DELEGATE_AGENT":
                await self._delegate_to_agent(action["config"])
            elif action["type"] == "CALL_WEBHOOK":
                await self._call_webhook(action["config"])
```

预置自动化规则示例：

| 规则名 | 触发器 | 条件 | 动作 |
|--------|--------|------|------|
| 每日站报生成 | TIME_SCHEDULE (9:00) | — | DELEGATE_AGENT (PM Agent → 生成日报) |
| 延期预警 | TIME_SCHEDULE (每小时) | 有任务超过截止日期 | SEND_NOTIFICATION (Owner + 分配者) |
| PR 待审提醒 | TASK_CREATED (状态=IN_REVIEW) | — | SEND_NOTIFICATION (Reviewer) |
| Agent 完成通知 | AGENT_COMPLETED | — | SEND_NOTIFICATION (委托者) |

前端：
- [ ] 自动化规则列表（名称、触发器、状态开关）
- [ ] 「创建规则」向导：选择触发器 → 配置条件 → 选择动作
- [ ] AI 辅助规则创建：自然语言描述 → PM Agent 建议规则配置

### Task 4.5.2: Webhook API

**Files:**
- Create: `server/app/models/webhook_subscription.py`
- Create: `server/app/routers/webhooks.py`

```python
# server/app/models/webhook_subscription.py
class WebhookSubscription(Base, UUIDMixin):
    __tablename__ = "webhook_subscriptions"
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"))
    name: Mapped[str]
    url: Mapped[str]
    events: Mapped[list] = mapped_column(JSON)  # 订阅的事件类型列表
    secret: Mapped[str]                         # HMAC 签名密钥
    active: Mapped[bool] = mapped_column(default=True)
```

端点：
- `GET /api/workspaces/{ws_id}/webhooks` — 订阅列表
- `POST /api/workspaces/{ws_id}/webhooks` — 创建订阅
- `DELETE /api/webhooks/{id}` — 删除订阅
- `GET /api/webhooks/{id}/deliveries` — 投递日志

Webhook 投递逻辑：
```python
import hmac, hashlib, json

async def dispatch_webhook(subscription: WebhookSubscription, event: str, payload: dict):
    body = json.dumps({"event": event, "payload": payload, "timestamp": datetime.now().isoformat()})
    signature = hmac.new(
        subscription.secret.encode(), body.encode(), hashlib.sha256
    ).hexdigest()

    retries = 3
    for i in range(retries):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    subscription.url,
                    content=body,
                    headers={
                        "Content-Type": "application/json",
                        "X-AIPM-Signature": signature,
                        "X-AIPM-Event": event,
                    }
                )
                if resp.status_code < 400:
                    return  # 成功
        except Exception:
            if i < retries - 1:
                await asyncio.sleep(2 ** i)  # 指数退避
    # 记录投递失败日志
```

### Task 4.5.3: 工作空间分析子视图

**Files:**
- Create: `apps/web/src/pages/workspace-detail/tabs/AnalyticsTab.tsx`
- Create: `apps/web/src/components/charts/`

- [ ] 任务完成率趋势（折线图）
- [ ] 任务状态分布（饼图）
- [ ] 任务按分配者分布（柱状图）
- [ ] Sprint 速率趋势（柱状图，velocity over iterations）
- [ ] 累积流量图（面积图，Cumulative Flow Diagram）
- [ ] 使用 `@ant-design/charts` 或 `recharts`

### Task 4.5.4: 工作空间自动化子视图 + 成员管理完善

**Files:**
- Create: `apps/web/src/pages/workspace-detail/tabs/AutomationTab.tsx`
- Update: `apps/web/src/pages/workspace-detail/tabs/MembersTab.tsx`

- [ ] 自动化 Tab：显示当前工作空间的自动化规则列表 + 启用/禁用开关
- [ ] 成员 Tab：补充添加成员流程（搜索用户 → 选择角色 → 添加）

### Task 4.5.5: 端到端测试（覆盖全 9 页）

验证全用户旅程：
1. 管理员登录 → 系统管理 → 配置模型 + Agent + 企微
2. 用户登录 → 工作台 → 看到实时统计 + AI 日报
3. 创建/进入工作空间 → 任务 Tab → 创建 Epic → Kanban 拖拽
4. 知识 Tab → 创建文档 → 编辑 → 查看版本历史
5. 分析 Tab → 查看图表
6. 自动化 Tab → 创建规则 → 触发验证
7. 成员 Tab → 邀请成员 + 添加 AI Agent
8. 会议大屏 → 公司重点 → 部门重点 → 其他项目 → 站会/周会切换 → 投屏模式
9. AI 对话 → 切换 Agent → 发送消息 → 流式返回 → 引用知识库
10. 个人中心 → 待办 → Review Agent 产出 → 消息中心查看通知
11. 企微收到推送 → Bot 命令测试

---

## 验证清单

- [ ] 会议大屏：3 层级切换正常 → 项目数据实时准确 → 投屏模式布局完整
- [ ] 通知系统：任务分配 → 铃铛显示未读 → 点击跳转任务 → 企微收到推送
- [ ] 通知偏好：关闭企微渠道 → 验证下次通知仅站内收到
- [ ] 企微同步：手动触发同步 → 部门树和用户正确导入
- [ ] 企微 Bot：在企微中发送 `/tasks` → 返回我的任务列表
- [ ] LDAP 同步：触发同步 → 验证用户按映射规则创建
- [ ] 系统管理：修改 Agent System Prompt → 测试 Agent → 验证新 Prompt 生效
- [ ] 审计日志：执行关键操作 → 验证日志记录完整
- [ ] 自动化规则：创建「任务完成→通知创建者」→ 完成任务 → 验证收到通知
- [ ] Webhook：配置订阅 URL → 任务创建 → 验证外部收到 POST 请求
- [ ] 全 9 页可用，无 404 占位页

**预计总工时：6-7 周（30-35 个工作日）**
