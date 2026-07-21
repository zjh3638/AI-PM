import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTemplateStore } from '../../../stores/templateStore';
import { useTaskStore } from '../../../stores/taskStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import Modal from '../../../components/common/Modal';
import { showSuccess } from '../../../utils/feedback';
import { PRIORITY_LABELS, type TaskTemplate, type WorkItemTemplate } from '../../../types';

/** 提取标题模板中的 {变量} 占位符 */
function extractVars(tpl: string): string[] {
  const set = new Set<string>();
  const re = /\{([^{}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) set.add(m[1].trim());
  return [...set];
}

function renderTitle(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([^{}]+)\}/g, (full, k) => vars[k.trim()] ?? full);
}

export default function TemplatesPanel({ onTaskCreated }: { onTaskCreated?: () => void }) {
  const { id: wsId } = useParams<{ id: string }>();
  const { templates, loading, fetchTemplates, createTemplate, updateTemplate, deleteTemplate, createTaskFromTemplate } = useTemplateStore();
  const { members } = useWorkspaceStore();

  const [category, setCategory] = useState('all');
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [useOpen, setUseOpen] = useState<TaskTemplate | null>(null);

  useEffect(() => { if (wsId) fetchTemplates(wsId); }, [wsId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => t.category && set.add(t.category));
    return [...set];
  }, [templates]);

  const filtered = category === 'all' ? templates : templates.filter((t) => t.category === category);

  const openCreate = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (t: TaskTemplate) => { setEditing(t); setEditorOpen(true); };

  const handleDelete = async (t: TaskTemplate) => {
    if (!wsId) return;
    if (!window.confirm(`确定删除模板「${t.name}」？该操作不可恢复。`)) return;
    await deleteTemplate(wsId, t.id);
    showSuccess('模板已删除');
  };

  return (
    <div className="ws-panel active" style={{ padding: '16px 20px' }}>
      <div className="tpl-toolbar">
        <div className="tpl-cats">
          <span className={`tpl-cat${category === 'all' ? ' active' : ''}`} onClick={() => setCategory('all')}>全部</span>
          {categories.map((c) => (
            <span key={c} className={`tpl-cat${category === c ? ' active' : ''}`} onClick={() => setCategory(c)}>{c}</span>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ 新建模板</button>
      </div>

      {loading ? (
        <div className="empty-state"><div className="empty-icon">⏳</div>加载中...</div>
      ) : (
        <div className="tpl-grid">
          {filtered.map((t) => (
            <div key={t.id} className="tpl-card">
              <div className="tc-head">
                {t.category && <span className="tc-cat">{t.category}</span>}
                <span className="tc-name">{t.name}</span>
                <span className="tc-uses">已用 {t.usage_count} 次</span>
              </div>
              {t.description && <div className="tc-desc">{t.description}</div>}
              <div className="tc-items">
                {(t.work_items_template || []).slice(0, 3).map((it, i) => <div key={i} className="ti">{it.title}</div>)}
                {(t.work_items_template || []).length > 3 && (
                  <div className="ti" style={{ color: 'var(--text-placeholder)' }}>…等 {t.work_items_template.length} 个工作项</div>
                )}
              </div>
              <div className="tc-meta">
                <span>📋 {t.work_items_count} 个工作项</span>
                {t.estimation != null && <span>⏱ 预计 {t.estimation} {t.estimation_unit || ''}</span>}
              </div>
              <div className="tc-foot">
                <button className="tc-btn primary" onClick={() => setUseOpen(t)}>使用模板</button>
                <button className="tc-btn" onClick={() => openEdit(t)}>编辑</button>
                <button className="tc-btn" onClick={() => handleDelete(t)} title="删除">🗑</button>
              </div>
            </div>
          ))}
          <div className="tpl-card tpl-new" onClick={openCreate}>
            <span className="tn-icon">+</span>
            <span>新建任务模板</span>
          </div>
        </div>
      )}

      {editorOpen && wsId && (
        <TemplateEditor
          template={editing}
          onClose={() => setEditorOpen(false)}
          onSave={async (data) => {
            if (editing) { await updateTemplate(wsId, editing.id, data); showSuccess('模板已更新'); }
            else { await createTemplate(wsId, data); showSuccess('模板已创建'); }
            setEditorOpen(false);
          }}
        />
      )}

      {useOpen && wsId && (
        <CreateFromTemplate
          template={useOpen}
          members={members.filter((m) => m.user_id).map((m) => ({ id: m.user_id as string, name: m.user_name || '成员' }))}
          onClose={() => setUseOpen(null)}
          onCreate={async (payload) => {
            const task = await createTaskFromTemplate(wsId, useOpen.id, payload);
            showSuccess(`已创建任务「${task.title}」，含 ${task.work_items_total} 个子工作项`);
            setUseOpen(null);
            fetchTemplates(wsId);
            onTaskCreated?.();
          }}
        />
      )}
    </div>
  );
}

// ── 模板编辑器 ──
function TemplateEditor({ template, onClose, onSave }: {
  template: TaskTemplate | null;
  onClose: () => void;
  onSave: (data: Partial<TaskTemplate>) => Promise<void>;
}) {
  const [name, setName] = useState(template?.name || '');
  const [category, setCategory] = useState(template?.category || '');
  const [description, setDescription] = useState(template?.description || '');
  const [titleTemplate, setTitleTemplate] = useState(template?.title_template || '');
  const [priority, setPriority] = useState<string>(template?.priority || 'MEDIUM');
  const [estimation, setEstimation] = useState<string>(template?.estimation != null ? String(template.estimation) : '');
  const [items, setItems] = useState<WorkItemTemplate[]>(template?.work_items_template?.length ? [...template.work_items_template] : [{ title: '', sort_order: 0 }]);
  const [saving, setSaving] = useState(false);

  const updateItem = (i: number, title: string) => setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, title } : it));
  const addItem = () => setItems((arr) => [...arr, { title: '', sort_order: arr.length }]);
  const removeItem = (i: number) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim() || !titleTemplate.trim() || saving) return;
    setSaving(true);
    try {
      const cleanItems = items.filter((it) => it.title.trim()).map((it, idx) => ({ title: it.title.trim(), sort_order: idx }));
      await onSave({
        name: name.trim(),
        category: category.trim() || null,
        description: description.trim() || null,
        title_template: titleTemplate.trim(),
        priority: priority as any,
        estimation: estimation ? Number(estimation) : null,
        estimation_unit: estimation ? '人天' : null,
        work_items_template: cleanItems,
      } as any);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={template ? '编辑任务模板' : '新建任务模板'} width={560}>
      <div className="form-group"><label>模板名称</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：Redis 监控接入" />
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="form-group" style={{ flex: 1 }}><label>分类</label>
          <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="如：运维监控" />
        </div>
        <div className="form-group" style={{ flex: 1 }}><label>优先级</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ width: 110 }}><label>预计(人天)</label>
          <input type="number" value={estimation} onChange={(e) => setEstimation(e.target.value)} placeholder="3" />
        </div>
      </div>
      <div className="form-group"><label>任务标题模板（支持 {'{变量}'}）</label>
        <input type="text" value={titleTemplate} onChange={(e) => setTitleTemplate(e.target.value)} placeholder="如：{项目名称} - Redis监控" />
        {extractVars(titleTemplate).length > 0 && (
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
            检测到变量：{extractVars(titleTemplate).map((v) => `{${v}}`).join('、')} — 创建任务时填写
          </div>
        )}
      </div>
      <div className="form-group"><label>模板说明</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="这个模板适用于什么场景" />
      </div>
      <div className="form-group">
        <label>工作项清单</label>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: 18 }}>{i + 1}.</span>
            <input type="text" value={it.title} onChange={(e) => updateItem(i, e.target.value)} placeholder="工作项名称" style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-xs" onClick={() => removeItem(i)} disabled={items.length === 1}>✕</button>
          </div>
        ))}
        <button className="btn btn-ghost btn-xs" onClick={addItem} style={{ marginTop: 2 }}>+ 添加工作项</button>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim() || !titleTemplate.trim() || saving}>
          {saving ? '保存中...' : '保存模板'}
        </button>
      </div>
    </Modal>
  );
}

// ── 从模板创建任务 ──
function CreateFromTemplate({ template, members, onClose, onCreate }: {
  template: TaskTemplate;
  members: { id: string; name: string }[];
  onClose: () => void;
  onCreate: (payload: any) => Promise<void>;
}) {
  const vars = extractVars(template.title_template);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [creating, setCreating] = useState(false);

  const previewTitle = renderTitle(template.title_template, varValues);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await onCreate({
        variables: varValues,
        assignee_id: assignee || null,
        due_date: dueDate || null,
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`从模板创建任务 · ${template.name}`} width={480}>
      {vars.map((v) => (
        <div className="form-group" key={v}>
          <label>{v}</label>
          <input type="text" value={varValues[v] || ''} onChange={(e) => setVarValues((s) => ({ ...s, [v]: e.target.value }))} placeholder={`填写「${v}」`} />
        </div>
      ))}
      <div className="form-group"><label>任务负责人</label>
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">未指派</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="form-group"><label>截止日期</label>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: '0.78rem', marginBottom: 12 }}>
        预览标题：<b>{previewTitle}</b>
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {(template.work_items_template || []).map((it, i) => (
            <li key={i} style={{ padding: '3px 0 3px 16px', position: 'relative', color: 'var(--text-secondary)' }}>
              <span style={{ position: 'absolute', left: 4, color: 'var(--blue-500)', fontWeight: 700 }}>·</span>{it.title}
            </li>
          ))}
        </ul>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
          {creating ? '创建中...' : '创建任务'}
        </button>
      </div>
    </Modal>
  );
}
