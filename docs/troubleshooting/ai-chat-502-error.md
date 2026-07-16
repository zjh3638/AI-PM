# AI 对话 502 错误排查指南

## 问题描述
AI 对话界面发送消息后报错：
```
Client error '400 Bad Request' for url 'http://7.24.28.9:8080/v1/chat/completions'
```

## 根本原因
实际错误是 **502 Bad Gateway**，说明：
- ✅ LLM 网关服务正常运行（能接收和处理请求）
- ❌ **网关的上游模型服务不可用**（如 DeepSeek、Qwen、vLLM 等）

```bash
# 测试结果
$ curl -X POST http://7.24.28.9:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"你好"}]}'

HTTP/1.1 502 Bad Gateway
Bad Gateway: upstream error
```

## 代码改进
已优化后端错误处理（`server/app/services/ai_chat_stream.py`），现在会显示更清晰的错误提示：

| HTTP 状态码 | 错误提示 |
|------------|---------|
| 502 | LLM 网关上游服务不可用（502 Bad Gateway），请联系管理员检查模型服务是否正常运行。 |
| 401 | API Key 认证失败，请到个人中心 → AI 配置检查密钥是否正确。 |
| 400 | 请求格式错误（400）：[详细错误信息] |
| 超时 | LLM 请求超时，请稍后重试或联系管理员检查网关服务。 |
| 连接失败 | 无法连接到 LLM 网关（[网关地址]），请联系管理员检查网络和服务状态。 |

## 解决方案

### 1️⃣ 检查上游模型服务（推荐）

**步骤 1：登录网关服务器**
```bash
ssh user@7.24.28.9
```

**步骤 2：检查模型服务进程**
```bash
# 查找模型服务进程
ps aux | grep -E 'vllm|xinference|ollama|deepseek|qwen'

# 或检查常见端口
netstat -tlnp | grep -E '8000|8080|11434'
```

**步骤 3：查看网关配置**
```bash
# 根据网关类型查看配置文件
cat /etc/llm-gateway/config.yaml
# 或
cat /path/to/gateway/.env

# 找到 upstream_url 或类似配置项，确认上游地址
```

**步骤 4：测试上游服务**
```bash
# 假设上游地址是 http://localhost:8000
curl http://localhost:8000/v1/models
curl http://localhost:8000/health
```

**步骤 5：启动模型服务**
```bash
# 根据实际使用的框架启动
# vLLM 示例
vllm serve deepseek-ai/DeepSeek-V3 --port 8000

# Xinference 示例
xinference-local --host 0.0.0.0 --port 8000

# Ollama 示例
ollama serve
```

**步骤 6：查看日志**
```bash
# 网关日志
journalctl -u llm-gateway -n 100 --no-pager
tail -f /var/log/llm-gateway/error.log

# 模型服务日志
journalctl -u vllm -n 100 --no-pager
```

### 2️⃣ 更换网关地址

如果有其他可用的 LLM 网关或想切换到云端 API：

**方式 A：通过管理界面（推荐）**
1. 登录系统（超级管理员账号）
2. 进入 **系统管理 → AI 配置**
3. 修改 **LLM 网关地址**
4. 保存后自动生效

**方式 B：直接修改配置文件**
```bash
cd /workspace/server

# 编辑 settings.json
cat > settings.json << 'EOF'
{
  "llm_gateway_url": "http://新的网关地址/v1"
}
EOF

# 或使用云端 API
cat > settings.json << 'EOF'
{
  "llm_gateway_url": "https://api.deepseek.com/v1"
}
EOF

# 重启后端服务
# 方式取决于部署方式（systemd/docker/supervisor）
systemctl restart ai-pm-backend
# 或
docker restart ai-pm-backend
# 或
uv run uvicorn app.main:app --reload
```

**常用云端 API 地址**
| 服务商 | Base URL | 获取 API Key |
|--------|----------|-------------|
| DeepSeek | `https://api.deepseek.com/v1` | https://platform.deepseek.com |
| 阿里云百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | https://bailian.console.aliyun.com |
| 硅基流动 | `https://api.siliconflow.cn/v1` | https://cloud.siliconflow.cn |

### 3️⃣ 配置用户 API Key

如果使用云端 API，每个用户需要配置自己的 API Key：

1. 登录系统
2. 进入 **个人中心 → AI 配置**
3. 填入 **API Key** 和选择 **模型**（如 `deepseek-chat`）
4. 保存

## 验证修复

### 测试网关连接
```bash
# 测试模型列表
curl http://7.24.28.9:8080/v1/models

# 测试聊天接口（需要有效的 API Key）
curl -X POST http://7.24.28.9:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <有效的API-Key>" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "你好"}],
    "temperature": 0.3,
    "max_tokens": 50
  }'
```

**预期响应**（200 OK）：
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "你好！有什么我可以帮助你的吗？"
    },
    "finish_reason": "stop"
  }]
}
```

### 前端测试
1. 打开系统 **AI 对话** 面板
2. 选择 Agent（如"项目经理"）
3. 发送消息："你好"
4. 应该能收到 AI 回复

## 常见问题

### Q1: 仍然显示 502 错误
**A:** 检查以下项：
- 模型服务是否真的在运行（`ps aux | grep model-name`）
- 网关配置的上游地址是否正确
- 上游服务端口是否可访问（防火墙/网络策略）
- 上游服务日志是否有报错

### Q2: 显示"API Key 认证失败"
**A:** 
1. 确认用户已在"个人中心 → AI 配置"填写了 API Key
2. 确认 API Key 有效且未过期
3. 确认 API Key 对应的模型名称正确

### Q3: 网关地址修改后不生效
**A:** 
1. 确认 `settings.json` 格式正确（有效 JSON）
2. 重启后端服务
3. 清除浏览器缓存并刷新页面

### Q4: 想切换回本地模型
**A:** 
1. 启动本地模型服务（vLLM/Xinference/Ollama）
2. 确认服务监听正确端口
3. 修改网关地址为 `http://localhost:<端口>/v1`
4. 测试连接后重启后端

## 相关文件
- 后端错误处理：`server/app/services/ai_chat_stream.py`
- 前端对话组件：`apps/web/src/pages/workspace-detail/panels/AiChatPanel.tsx`
- 网关配置读取：`server/app/services/ai_service.py` (`get_gateway_url()`)
- 系统配置文件：`server/settings.json`

## 更新日志
- **2026-07-08**: 优化错误处理，添加 502/401/400/超时等详细错误提示
- **2026-07-08**: 创建本排查指南
