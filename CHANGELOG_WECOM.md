# 企业微信集成 - 变更记录

## 变更日期
2026-07-09

## 变更类型
✨ Feature - 新增企业微信集成功能

## 变更概述
为 AI-PM 平台集成企业微信外部群聊，实现项目空间自动创建群聊、成员实时同步、任务动态通知等功能。

## 新增文件

### 核心服务
- `server/app/services/wecom_service.py` - 企业微信 API 封装（群聊管理、消息发送、Token 管理）
- `server/app/services/wecom_notification.py` - 通知模板与发送逻辑

### 数据库迁移
- `server/alembic/versions/b2c3d4e5f6a7_add_wecom_chat_id_to_workspaces.py` - 新增 wecom_chat_id 字段

### 文档
- `docs/integrations/wecom-integration.md` - 完整集成文档（配置、验证、故障排查）
- `server/WECOM_INTEGRATION.md` - 快速配置指南

## 修改文件

### 配置管理
- `server/app/config.py`
  - 新增 5 个企业微信配置项（wecom_enabled, corp_id, agent_id, agent_secret, api_base）

- `.env.example`
  - 新增企业微信配置段（第 49-55 行）

### 数据模型
- `server/app/models/workspace.py`
  - 新增 `wecom_chat_id` 字段（存储企业微信群聊ID）

### 业务逻辑
- `server/app/services/workspace.py`
  - `create_workspace()` - 创建工作空间时自动创建企业微信群
  - `add_member()` - 添加成员时同步到企业微信群 + 发送欢迎通知
  - `remove_member()` - 移除成员时同步到企业微信群 + 发送告别通知
  - 新增 logging 和 settings 导入

### 路由层
- `server/app/routers/workspaces.py`
  - `add_member()` - 新增 current_user 参数，调用成员加入通知
  - `remove_member()` - 新增 current_user 参数，调用成员移除通知

- `server/app/routers/tasks.py`
  - `update_task()` - 在记录活动日志后，发送任务分配/状态变更通知

## 功能清单

### ✅ 已实现
1. **自动创建群聊**：创建项目空间时自动创建企业微信外部群
2. **成员同步**：
   - 添加成员 → 自动加入企业微信群 + 欢迎消息
   - 移除成员 → 自动退出企业微信群 + 告别消息
3. **任务通知**：
   - 任务分配/变更负责人 → @提醒被分配人
   - 任务状态变更 → 群聊通知
4. **错误处理**：所有企业微信操作失败不阻断核心业务
5. **Token 管理**：access_token 内存缓存 + 自动刷新

### 🚧 预留接口
- `notify_milestone_changed()` - 里程碑变更通知
- `notify_iteration_changed()` - 迭代变更通知

## 技术要点

### 安全性
- 所有企业微信 API 调用包裹在 try-except 中
- Secret 通过环境变量管理，不硬编码
- Token 过期自动重试，避免服务中断

### 性能
- access_token 缓存 7000 秒，减少 API 调用
- 使用 asyncio.Lock 避免并发刷新冲突
- 消息发送异步执行，不阻塞主流程

### 可维护性
- 模块化设计：API 封装 + 通知模板分离
- 统一日志记录（logger.info / warning）
- 详细文档 + 故障排查指南

## 数据库变更

### workspaces 表
```sql
ALTER TABLE workspaces ADD COLUMN wecom_chat_id VARCHAR(100);
```

**迁移命令**：
```bash
cd server
uv run alembic upgrade head
```

## 配置示例

```bash
# .env
AI_PM_WECOM_ENABLED=True
AI_PM_WECOM_CORP_ID=ww1234567890abcdef
AI_PM_WECOM_AGENT_ID=1000002
AI_PM_WECOM_AGENT_SECRET=your_secret_32_chars_long
```

## 测试建议

### 手动测试清单
1. ✅ 创建项目 → 验证企业微信群创建
2. ✅ 添加成员 → 验证成员同步 + 欢迎消息
3. ✅ 分配任务 → 验证 @提醒
4. ✅ 变更任务状态 → 验证状态通知
5. ✅ 移除成员 → 验证成员退出 + 告别消息

### 异常测试
- 企业微信凭证错误 → 不影响工作空间创建
- 网络超时 → 日志记录 warning，业务继续
- 用户ID不匹配 → 跳过通知，不报错

## 依赖项

### Python 包
- `httpx>=0.27.0` ✅ 已安装（现有依赖）

### 可选优化
- `redis>=5.0.0` - 用于生产环境 Token 缓存（当前使用内存缓存）

### 外部服务
- 企业微信应用（需管理员创建）
- 企业微信 API 可达性

## 兼容性

- **向后兼容**：`wecom_enabled=False` 时完全跳过企业微信逻辑，对现有项目零影响
- **数据库兼容**：新增字段为 nullable，不影响已有数据
- **API 兼容**：路由签名变更（新增 current_user）向后兼容

## 已知限制

1. **外部群数量**：每个企业微信应用最多 500 个外部群
2. **API 限流**：100 次/分钟
3. **用户ID依赖**：要求系统 user.id 与企业微信 userid 一致

## 后续优化方向

1. 消息队列（Celery + Redis）实现异步发送
2. 消息模板自定义管理
3. 企业微信事件回调接收
4. 批量操作 API 聚合
5. 监控告警集成

## 相关 Issue/PR

- Feature Request: 企业微信集成 (#xxx)
- Design Doc: 见 `/home/knodo/.claude/plans/graceful-finding-bonbon.md`

## 审核者注意事项

- 请确认 `.env.example` 中的配置说明是否清晰
- 验证迁移文件是否正确执行（特别是字段类型和可空性）
- 测试企业微信集成关闭时的业务流程是否正常

---

**变更人**：Claude (AI Assistant)  
**审核状态**：待审核  
**部署状态**：待部署
