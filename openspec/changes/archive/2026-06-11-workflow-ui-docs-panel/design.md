## Context

当前 `WorkspaceDetailPage.tsx` 任务详情面板结构：
- 顶部：阶段标签、角色字段
- 中部：phase 条件渲染的文档编辑区（PRD textarea / design_doc textarea / 测试报告 textarea / 评审 UI）
- 底部：`form-actions` 操作栏混合了「取消/保存」按钮 + 流程按钮（▶开始处理 / ✔标记完成 / 🚀推进到XX阶段）

问题：
1. 文档区域随 phase 切换而改变入口，无法跨阶段查看文档（如开发阶段想看需求文档）
2. 流程按钮与表单按钮平级，无主次之分
3. 附件功能已存在但入口隐蔽（仅一个 tab 按钮）

## Goals / Non-Goals

**Goals:**
- 流程操作按钮独立成「流程操作」卡片，视觉上高于表单保存按钮
- 文档区域从 phase 条件渲染改为固定 4 tab（需求/设计/测试/附件），允许跨阶段查看
- 附件 tab 支持拖拽上传、图片缩略图预览
- 流程历史时间线展示阶段变更记录

**Non-Goals:**
- 不改造后端文档存储模型（复用 Task.prd_doc / design_doc / test_report 字段）
- 不引入富文本编辑器库（继续使用 Markdown textarea，后续版本可替换）
- 不改动文档搜索/全文检索功能
- 不引入图片存储服务（前端压缩后通过附件 API 上传）

## Decisions

### D1: 流程操作栏布局

**选择**: 在任务面板中，将流程按钮从 `form-actions` 提取到面板中部独立卡片区域（在角色字段下方、文档 tabs 上方），作为醒目的主操作区。状态流转按钮横排展示，阶段推进按钮作为主 CTA（大按钮），回退作为次要按钮。

**理由**:
- 流程操作是高频动作，应与低频的表单保存分离
- 独立卡片有明确的视觉层次，用户一眼看到「现在能做什么」
- 与 Notion / Linear 的任务详情面板布局一致

**备选方案**: 顶部固定流程浮条（sticky header with action buttons）。
- 不采纳：占用过多垂直空间，在 520px 面板宽度下过于拥挤。

### D2: 文档 Tab 架构

**选择**: 4 个固定 tab（📋需求 / 📝设计 / 🧪测试 / 📎附件），每个 tab 内容独立，不随 phase 切换消失。Tab 内容区：
- 需求 tab：`prd_doc` textarea（始终可编辑）
- 设计 tab：`design_doc` textarea（始终可编辑）
- 测试 tab：`self_test_report` textarea（DEVELOPMENT 阶段可编辑，其他阶段只读）+ `test_report` textarea（TESTING 阶段可编辑）
- 附件 tab：已有附件列表 + 上传区域

**理由**:
- 用户可以跨阶段查看所有文档（如在开发阶段回顾需求 PRD）
- 文档内容编辑权限由 phase 控制，只读/可编辑状态通过视觉提示区分
- 复用现有 Task 字段，无需数据库迁移

**备选方案**: 动态 tab（根据 phase 只显示当前阶段的 tab）。
- 不采纳：限制了跨阶段文档查看能力。

### D3: 图片粘贴实现

**选择**: 监听 textarea 的 paste 事件，检测剪贴板中的图片数据 → 前端压缩（canvas resize to max 1200px）→ 通过附件 API 上传 → 在 textarea 中插入 Markdown 图片语法 `![image](url)`。

**理由**:
- 无需引入图片存储服务，复用已有附件上传 API
- Markdown 格式保持文档的纯文本可版本化特性
- 附件表已有 `mime_type` 字段，支持图片预览

## Risks / Trade-offs

- **图片粘贴依赖前端压缩**：大图片可能消耗内存 → 限制单张图片最大 10MB，超限提示用户手动压缩
- **文档 tab 内容自动保存时机**：textarea 内容变更需自动保存 → 复用已有的 debounce auto-save 机制（如 design_doc 的 1.5s timer）
- **流程时间线数据来源**：当前 activity 表记录了阶段变更，但格式不够结构化 → 新增 activity type `PHASE_CHANGE` 或复用 `UPDATE` type 中 field_name='阶段' 的记录

## Open Questions

- 是否需要文档内容变更历史（diff）？—— 优先级低，后续版本考虑
- 附件数量是否需要限制？—— 暂定每个任务最多 50 个附件
