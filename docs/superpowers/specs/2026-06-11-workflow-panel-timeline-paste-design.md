# 流程面板增强：时间线 + 图片粘贴 + 原型同步

## 背景

`workflow-ui-docs-panel` 变更的核心任务（移除冗余按钮、独立流程操作栏、文档 tab 系统、附件增强）已完成。剩余三个子任务：

1. **流程时间线** — 面板底部展示阶段流转历史
2. **图片粘贴上传** — 文档编辑器中粘贴图片自动上传为附件
3. **原型同步** — 将面板改造同步到 `prototypes/index.html`

## 设计

### 流程时间线 — 卡片列表

**数据来源**: Activity API `GET /workspaces/{id}/tasks/{taskId}/activity`，筛选 `field_name='阶段'` 的记录。

**布局**: 卡片列表，每条一条卡片。卡片左边缘有颜色条区分操作类型：
- 🚀 推进：蓝色边框
- ↩ 退回：琥珀色边框

**卡片内容**:
- 操作图标 + 变更描述（如「方案设计 → 开发实现」）
- 时间 + 操作人
- 产出物摘要（从 activity 的 `new_value` 中提取）

**位置**: 面板底部，文档 tab 区域下方、删除按钮上方。标题「📜 流程记录」，空态显示「暂无流程记录」。

**实现**: 复用已有的 `fetchActivity` 函数和 `activityLogs` 状态，过滤后渲染。新增 ~30 行 JSX。

### 图片粘贴上传 — 即时占位 + 后台替换

**流程**:
1. 监听文档 textarea 的 `paste` 事件
2. 检测 `event.clipboardData.items` 中是否有 `image/*` 类型
3. 拦截默认粘贴行为
4. 在光标位置插入占位符 `⏳ 图片上传中...`
5. 前端压缩图片：Canvas resize → max 1200px 宽/高 → JPEG quality 0.8
6. 通过 `FormData` 调用附件上传 API
7. 成功后替换占位符为 `![filename](download-url)`
8. 失败后替换为 `⚠️ 图片上传失败`

**压缩参数**: maxWidth=1200, maxHeight=1200, quality=0.8, outputFormat='image/jpeg'

**适用范围**: 所有文档 tab 的 textarea（需求/设计/测试），STORY 类型任务。

**错误处理**: 单张 >10MB 跳过并提示「图片过大，请手动压缩后上传」。

### 原型同步

**prototypes/index.html** 任务详情面板更新：

- **流程操作栏**: 蓝色背景卡片，「🔄 流程操作」标题 + 推进按钮 + 退回按钮（模拟）
- **文档 tab**: 替换 phase 条件区为固定 tab 栏（📋需求 / 📝设计 / 🧪测试 / 📎附件）
- **附件区域**: 拖拽上传虚线框 + 图片缩略图预览 + 文件类型图标

原型中为静态 HTML 展示，不实现实际交互逻辑。

## 数据模型

无新增模型。复用：
- `Attachment` — 图片上传
- `Activity` (activity 表) — 阶段流转记录
- `Task.prd_doc / design_doc / self_test_report / test_report` — 文档内容

## 组件结构

```
WorkspaceDetailPage (已有)
├── 流程操作栏 (已有) ← 本次不改
├── 文档 Tab 区 (已有) ← 本次不改
│   ├── 需求 Tab (已有)
│   │   └── textarea + paste handler ← 本次新增
│   ├── 设计 Tab (已有)  
│   │   └── textarea + paste handler ← 本次新增
│   └── 测试 Tab (已有)
│       └── textarea + paste handler ← 本次新增
├── 附件 Tab (已有) ← 本次不改
├── 流程时间线 ← 本次新增
└── 删除按钮 (已有)
```

## 测试

- 时间线卡片从 activity 数据正确渲染
- 时间线空态展示
- 粘贴图片触发上传流程（需 mock paste event）
- 粘贴非图片内容正常粘贴
- 超大图片拒绝提示
- 原型看板/面板视觉走查
