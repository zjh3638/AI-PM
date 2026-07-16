# 企业微信集成快速指南

## 配置步骤（5分钟）

### 1. 获取企业微信凭证

1. 登录 [企业微信管理后台](https://work.weixin.qq.com/)
2. 创建自建应用，记录：
   - 企业ID（CorpID）
   - AgentId
   - Secret

### 2. 配置环境变量

编辑 `.env` 文件：

```bash
AI_PM_WECOM_ENABLED=True
AI_PM_WECOM_CORP_ID=ww1234567890abcdef
AI_PM_WECOM_AGENT_ID=1000002
AI_PM_WECOM_AGENT_SECRET=your_secret_here
```

### 3. 运行数据库迁移

```bash
cd server
uv run alembic upgrade head
```

### 4. 重启服务

```bash
docker compose restart backend
```

## 功能列表

✅ 项目空间创建时自动创建企业微信群  
✅ 成员变更实时同步到企业微信群  
✅ 任务分配时 @提醒被分配人  
✅ 任务状态变更通知  
✅ 成员加入/退出通知  

## 详细文档

查看完整文档：[docs/integrations/wecom-integration.md](../docs/integrations/wecom-integration.md)
