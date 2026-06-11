# 流程面板增强：时间线 + 图片粘贴 + 原型同步

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在任务详情面板底部增加流程时间线（卡片列表风格），在文档 textarea 中支持图片粘贴自动上传，同步原型页面。

**Architecture:** 均为纯前端改动，复用已有 API（activity、attachments）。时间线读取 `activityLogs` 状态筛选渲染；图片粘贴在 textarea 上挂 `onPaste` handler。主改文件 `WorkspaceDetailPage.tsx` (~2750 行)。

**Tech Stack:** React 18 + TypeScript + Canvas API（图片压缩）

---

### Task 1: 流程时间线组件

**Files:**
- Modify: `apps/web/src/pages/workspace-detail/WorkspaceDetailPage.tsx:2724`（form-actions 后插入）

- [ ] **Step 1: 在 `</div>` (form-actions 结束) 和 `{/* Delete section */}` 之间插入时间线代码**

```tsx
        </div>

        {/* ─── Phase Timeline — STORY only ─── */}
        {editingTask && isFull && editingTask.task_type === 'STORY' && (() => {
          const phaseLogs = activityLogs.filter((l: any) => l.field_name === '阶段');
          return (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
                📜 流程记录
              </div>
              {phaseLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', padding: '8px 0' }}>
                  暂无流程记录
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {phaseLogs.map((log: any, i: number) => {
                    const isAdvance = log.action === 'UPDATE' || !log.new_value?.includes('退回');
                    return (
                      <div key={i} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        padding: '8px 10px', background: 'var(--bg-raised)',
                        borderRadius: 8,
                        borderLeft: `3px solid ${isAdvance ? 'var(--blue-500)' : 'var(--amber-400)'}`,
                        fontSize: '0.7rem',
                      }}>
                        <div style={{ fontSize: '1rem', flexShrink: 0 }}>{isAdvance ? '🚀' : '↩'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                            {log.old_value || '?'} → {log.new_value || '?'}
                          </div>
                          <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {new Date(log.created_at).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })} · {log.user_name || log.user_id}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Delete section — edit mode only */}
```

- [ ] **Step 2: TypeScript 检查**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -10
```
预期：仅 2 个预先存在的 TS7053 错误，无新增错误。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/workspace-detail/WorkspaceDetailPage.tsx
git commit -m "feat: add phase transition timeline to task detail panel"
```

---

### Task 2: 图片粘贴上传

**Files:**
- Modify: `apps/web/src/pages/workspace-detail/WorkspaceDetailPage.tsx`（文档 tab 区 textarea 添加 onPaste handler）

- [ ] **Step 1: 添加图片压缩和粘贴处理函数**

在组件顶层（`const fetchActivity` 之后）插入：

```tsx
  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxSize = 1200;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('compress failed'));
        }, 'image/jpeg', 0.8);
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handlePasteImage = async (e: React.ClipboardEvent<HTMLTextAreaElement>, field: string) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) continue;
        if (file.size > 10 * 1024 * 1024) {
          alert('图片过大（>10MB），请手动压缩后上传');
          continue;
        }
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const placeholder = '⏳ 图片上传中...';
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);
        textarea.value = before + placeholder + after;
        textarea.selectionStart = textarea.selectionEnd = start + placeholder.length;
        // trigger onChange
        const ev = new Event('input', { bubbles: true });
        textarea.dispatchEvent(ev);
        try {
          const compressed = await compressImage(file);
          const form = new FormData();
          form.append('file', compressed, file.name || 'image.png');
          const res: any = await api.post(`/workspaces/${id}/tasks/${editingTask!.id}/attachments`, form);
          const att = res.data;
          const url = `${window.location.origin}/api/workspaces/${id}/tasks/${editingTask!.id}/attachments/${att.id}/download`;
          const mdImg = `![${att.filename}](${url})`;
          const currentVal = textarea.value;
          textarea.value = currentVal.replace(placeholder, mdImg);
          textarea.dispatchEvent(ev);
          // save to task field
          const newVal = textarea.value;
          update(id!, editingTask!.id, { [field]: newVal } as any);
        } catch {
          const currentVal = textarea.value;
          textarea.value = currentVal.replace(placeholder, '⚠️ 图片上传失败');
          textarea.dispatchEvent(ev);
        }
      }
    }
  };
```

- [ ] **Step 2: 在三个文档 textarea 上绑定 onPaste**

需求 tab textarea（约 line 2455）添加属性：
```tsx
onPaste={(e) => handlePasteImage(e, 'prd_doc')}
```

设计 tab textarea（约 line 2502）添加属性：
```tsx
onPaste={(e) => handlePasteImage(e, 'design_doc')}
```

测试 tab 的自测报告 textarea（约 line 2560）添加：
```tsx
onPaste={(e) => handlePasteImage(e, 'self_test_report')}
```

测试 tab 的测试报告 textarea（约 line 2572）添加：
```tsx
onPaste={(e) => handlePasteImage(e, 'test_report')}
```

- [ ] **Step 3: TypeScript 检查**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -10
```
预期：仅预先存在的 2 个 TS7053 错误。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/workspace-detail/WorkspaceDetailPage.tsx
git commit -m "feat: add image paste upload to document editors"
```

---

### Task 3: 原型同步

**Files:**
- Modify: `prototypes/index.html`（任务详情面板区域）

- [ ] **Step 1: 更新原型中任务面板的文档区为 tab 布局**

找到原型中任务编辑面板的文档区域（搜索 `prd_doc\|design_doc\|自测` 相关注释），替换为：

```html
<!-- 文档 Tab -->
<div style="display:flex;border-bottom:1px solid var(--border);margin:12px 0 6px">
  <button class="btn btn-sm btn-primary" style="font-size:0.68rem">📋 需求 (156)</button>
  <button class="btn btn-sm btn-ghost" style="font-size:0.68rem">📝 设计 (320)</button>
  <button class="btn btn-sm btn-ghost" style="font-size:0.68rem">🧪 测试 (48)</button>
  <button class="btn btn-sm btn-ghost" style="font-size:0.68rem">📎 附件 (3)</button>
</div>

<!-- 流程操作栏 -->
<div style="margin:12px 0;padding:12px 14px;background:var(--blue-50);border-radius:8px;border:1px solid var(--blue-100)">
  <div style="font-size:0.68rem;color:var(--text-muted);font-weight:500;margin-bottom:8px">🔄 流程操作</div>
  <div style="display:flex;gap:8px">
    <button class="btn btn-primary" style="flex:1;font-weight:600">📝 设计完成，进入开发</button>
    <button class="btn btn-ghost btn-sm" style="color:var(--amber-600)">↩ 退回</button>
  </div>
</div>

<!-- 附件拖拽区 -->
<div style="padding:16px;text-align:center;border:2px dashed var(--border);border-radius:8px;margin-top:8px">
  <div style="font-size:0.74rem;color:var(--text-muted)">📤 拖拽文件到此处上传</div>
  <div style="margin-top:8px">
    <span style="font-size:0.68rem;padding:4px 12px;border:1px solid var(--border);border-radius:4px;cursor:pointer">选择文件</span>
  </div>
</div>
```

- [ ] **Step 2: 验证原型渲染**

```bash
node scripts/serve-prototypes.js &
sleep 2
# 手动打开 http://localhost:3456 查看任务面板
```

- [ ] **Step 3: Commit**

```bash
git add prototypes/index.html
git commit -m "feat: sync prototype with new panel layout (tabs + workflow bar + attachments)"
```

---

### Task 4: 更新 OpenSpec 任务

**Files:**
- Modify: `openspec/changes/workflow-ui-docs-panel/tasks.md`

- [ ] **Step 1: 标记剩余任务完成**

```bash
# 将 tasks.md 中 3.1, 3.2, 5.3, 6.1 从 - [ ] 改为 - [x]
```

- [ ] **Step 2: Commit**

```bash
git add openspec/changes/workflow-ui-docs-panel/tasks.md
git commit -m "chore: mark remaining workflow-ui-docs-panel tasks complete"
```
