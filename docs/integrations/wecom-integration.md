# 企业微信集成文档

## 功能概述

AI-PM 平台已集成企业微信，支持：

1. **自动创建群聊**：创建项目空间时自动创建企业微信外部群
2. **成员同步**：项目成员增删时实时同步到企业微信群
3. **动态通知**：
   - 任务分配/变更负责人（@提醒对应成员）
   - 任务状态变更（TODO → IN_PROGRESS → DONE）
   - 成员加入/退出项目
   - 里程碑/迭代变更（预留接口）

## 配置步骤

### 1. 企业微信应用创建

1. 登录企业微信管理后台：[https://work.weixin.qq.com/](https://work.weixin.qq.com/)
2. 进入「应用管理」→「应用」→「创建应用」
3. 填写应用名称（如"AI-PM"）、上传应用图标
4. 创建成功后，记录以下信息：
   - **企业ID**（CorpID）：在「我的企业」→「企业信息」中查看
   - **AgentId**：应用详情页的「AgentId」
   - **Secret**：应用详情页的「Secret」（点击「查看」）

### 2. 应用权限配置

在应用详情页配置以下权限：

- **管理外部群**：企业管理 → 应用管理 → 配置权限 → 勾选「创建及管理外部群」
- **发送消息到群聊**：默认已开启

### 3. 服务器配置

编辑 `/workspace/.env` 文件（如不存在则复制 `.env.example`）：

```bash
# 企业微信集成
AI_PM_WECOM_ENABLED=True
AI_PM_WECOM_CORP_ID=ww1234567890abcdef
AI_PM_WECOM_AGENT_ID=1000002
AI_PM_WECOM_AGENT_SECRET=your_secret_here_32_chars_long
```

### 4. 数据库迁移

运行以下命令应用数据库变更（新增 `workspaces.wecom_chat_id` 字段）：

```bash
cd server
uv run alembic upgrade head
```

### 5. 重启服务

```bash
docker compose restart backend
# 或
pm2 restart ai-pm-backend
```

## 验证步骤

### 1. 创建项目空间

通过前端创建一个新的项目空间，检查：

- [ ] 企业微信中是否自动创建了名为「【项目名称】项目群」的群聊
- [ ] 创建人和项目负责人是否自动加入群聊
- [ ] 后端日志是否有成功记录：`工作空间 xxx 企业微信群聊创建成功`

### 2. 添加成员

在项目空间中添加一个新成员，检查：

- [ ] 该成员是否自动加入企业微信群
- [ ] 群聊中是否收到「👋 欢迎新成员」通知

### 3. 任务分配

创建一个任务并分配给某个成员，检查：

- [ ] 群聊中是否收到「📋 任务分配通知」
- [ ] 被分配人是否收到 @ 提醒（企业微信红点）

### 4. 任务状态变更

修改任务状态（如从「待处理」改为「进行中」），检查：

- [ ] 群聊中是否收到「🔄 任务状态变更」通知

### 5. 移除成员

从项目中移除一个成员，检查：

- [ ] 该成员是否自动从企业微信群移除
- [ ] 群聊中是否收到「👋 成员离开」通知

## 故障排查

### 问题：群聊创建失败

**症状**：项目空间创建成功，但企业微信中没有群聊

**排查步骤**：

1. 查看后端日志是否有错误信息：
   ```bash
   docker compose logs backend | grep -i wecom
   ```

2. 检查常见错误码：
   - `60011`：无权限创建群聊，需在企业微信后台配置应用权限
   - `40014` / `42001`：access_token 过期，系统会自动重试
   - `81011`：群聊数量达到上限（500个/应用）

3. 手动测试企业微信 API：
   ```bash
   curl "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=YOUR_CORP_ID&corpsecret=YOUR_SECRET"
   ```

### 问题：成员无法加入群聊

**症状**：添加成员成功，但未加入企业微信群

**可能原因**：

1. **用户ID不匹配**：系统中的 `user.id` 必须与企业微信中的 `userid` 一致
   - 检查方法：查看企业微信通讯录中该成员的「账号」字段
   - 解决方案：确保 LDAP 同步时使用企业微信 userid 作为用户名

2. **成员不在企业微信通讯录**：该用户未加入企业微信
   - 解决方案：先在企业微信中添加该员工

### 问题：消息发送失败

**症状**：群聊存在，但收不到通知消息

**排查步骤**：

1. 检查 `wecom_chat_id` 是否正确：
   ```sql
   SELECT id, name, wecom_chat_id FROM workspaces WHERE wecom_chat_id IS NOT NULL;
   ```

2. 查看后端日志中的错误信息

3. 常见错误码：
   - `86001`：不存在的群聊ID，可能群聊已被手动解散
   - `86003`：群聊不存在，需要重新创建

## 配置参数说明

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `AI_PM_WECOM_ENABLED` | 是否启用企业微信集成 | `False` |
| `AI_PM_WECOM_CORP_ID` | 企业微信企业ID | 必填 |
| `AI_PM_WECOM_AGENT_ID` | 企业微信应用AgentId | 必填 |
| `AI_PM_WECOM_AGENT_SECRET` | 企业微信应用Secret | 必填 |
| `AI_PM_WECOM_API_BASE` | 企业微信API地址 | `https://qyapi.weixin.qq.com/cgi-bin` |

## 技术细节

### access_token 缓存

- 有效期：7200 秒（2小时）
- 缓存策略：内存缓存，提前 200 秒刷新
- 并发控制：使用 `asyncio.Lock` 避免重复刷新

### 错误处理

- 所有企业微信 API 调用失败**不会阻断业务流程**
- 失败日志记录为 `WARNING` 级别
- Token 过期时自动重试一次

### API 限流

- 企业微信 API 限流：**100 次/分钟**
- 建议：批量操作时控制频率，避免触发限流

### 外部群限制

- 每个应用最多创建 **500 个外部群**
- 达到限制后无法创建新群，建议：
  - 使用多个应用分散群聊
  - 或改用群机器人方案（无数量限制，但功能受限）

## 后续优化建议

1. **消息队列**：使用 Celery + Redis 实现异步消息发送
2. **消息模板管理**：支持自定义通知格式
3. **回调接收**：监听企业微信事件（成员主动退群、群解散等）
4. **批量操作优化**：成员批量导入时聚合 API 调用
5. **监控告警**：API 调用失败率监控

## 企业微信API文档

- 官方文档：[https://developer.work.weixin.qq.com/document/](https://developer.work.weixin.qq.com/document/)
- 外部群管理：[群聊管理 - 企业微信API](https://developer.work.weixin.qq.com/document/path/90245)
- 消息发送：[发送应用消息](https://developer.work.weixin.qq.com/document/path/90236)

## 联系支持

如遇到问题，请提供以下信息：

1. 错误日志片段（`docker compose logs backend --tail 100`）
2. 企业微信返回的错误码和错误信息
3. 操作步骤和复现方式

---

**文档版本**：v1.0  
**更新日期**：2026-07-09
