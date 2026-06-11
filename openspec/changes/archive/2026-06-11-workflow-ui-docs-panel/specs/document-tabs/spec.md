## ADDED Requirements

### Requirement: Multi-tab document area

系统 SHALL 提供固定的分 tab 文档区域，允许用户在不同文档类型间切换查看和编辑，不随 phase 变化而隐藏。

#### Scenario: Four document tabs visible

- **WHEN** 用户打开 STORY 类型任务详情面板
- **THEN** 文档区域显示 4 个 tab：📋 需求文档、📝 设计文档、🧪 测试文档、📎 附件

#### Scenario: PRD tab content

- **WHEN** 用户点击「需求文档」tab
- **THEN** 显示 `prd_doc` 内容编辑器（Markdown textarea），支持编辑和自动保存

#### Scenario: Design doc tab content

- **WHEN** 用户点击「设计文档」tab
- **THEN** 显示 `design_doc` 内容编辑器，支持编辑和自动保存

#### Scenario: Test doc tab content

- **WHEN** 用户点击「测试文档」tab
- **THEN** 显示自测报告和测试报告编辑区

#### Scenario: Cross-phase document viewing

- **WHEN** 任务处于 DEVELOPMENT 阶段
- **THEN** 用户仍可切换到「需求文档」tab 查看之前编写的 PRD 内容

### Requirement: Document tabs with editing controls

系统 SHALL 为每个文档 tab 提供统一的编辑控制（自动保存状态指示、只读模式标识、文档字数统计）。

#### Scenario: Auto-save indicator

- **WHEN** 用户在文档编辑器中输入内容
- **THEN** 显示保存状态指示（「保存中...」/「已保存」），使用 debounce 1.5s 自动保存

#### Scenario: Read-only mode for irrelevant phases

- **WHEN** 当前 phase 与文档类型不相关（如 DEVELOPMENT 阶段打开测试报告）
- **THEN** 编辑器显示为只读模式（灰色边框 + 「只读」标签），提示用户在对应阶段编辑

#### Scenario: Document word count

- **WHEN** 文档编辑器中有内容
- **THEN** 编辑器底部显示字符数统计

### Requirement: Document and attachment interlinking

系统 SHALL 支持在文档内容中引用附件图片，图片展示为内联缩略图。

#### Scenario: Attachment image appears inline in document

- **WHEN** 文档内容包含 `![image](http://localhost:8000/api/attachments/{id}/download)` Markdown 语法
- **THEN** 在文档预览模式中渲染为图片（而非原始 Markdown）

#### Scenario: Click to insert attachment reference

- **WHEN** 用户在附件 tab 中点击附件旁的「复制引用」按钮
- **THEN** 系统复制该附件的 Markdown 引用语法到剪贴板，用户可粘贴到文档中

### Requirement: Image paste in document editor

系统 SHALL 支持在文档编辑器中粘贴图片，自动上传为附件并插入 Markdown 图片语法。

#### Scenario: Paste image into document editor

- **WHEN** 用户在文档编辑器中粘贴剪贴板中的图片（Ctrl+V / Cmd+V）
- **THEN** 图片自动压缩后上传为附件，在光标位置插入 `![image](attachment-url)` 语法

#### Scenario: Paste non-image content

- **WHEN** 用户粘贴非图片内容（文本）
- **THEN** 以普通文本方式粘贴，不触发上传逻辑

### Requirement: Attachment drag-and-drop upload

系统 SHALL 支持拖拽文件到附件区域进行上传，并展示图片缩略图预览。

#### Scenario: Drag file to upload

- **WHEN** 用户拖拽文件到附件 tab 区域
- **THEN** 文件上传为任务附件，上传完成后刷新附件列表

#### Scenario: Image thumbnail preview

- **WHEN** 附件列表中包含图片类型文件
- **THEN** 展示缩略图预览（而非文件图标），点击可查看原图

#### Scenario: File type icon for non-image attachments

- **WHEN** 附件为非图片类型（如 PDF、Word、Excel）
- **THEN** 展示对应的文件类型图标和文件名
