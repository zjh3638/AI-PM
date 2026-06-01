import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useDocumentStore } from '../../stores/documentStore';
import SlidePanel from '../common/SlidePanel';

// Simple markdown-to-HTML renderer
function renderMd(text: string): string {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Bold & italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code & code blocks
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Links & images
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
  return `<p>${html}</p>`;
}

export default function KnowledgeBasePanel() {
  const { id: wsId } = useParams<{ id: string }>();
  const { docs, loading, fetchList, create, update, remove, current, fetchDetail } = useDocumentStore();
  const [search, setSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ title: '', path: '', content: '', tags: '' });
  const [mode, setMode] = useState<'list' | 'view' | 'edit'>('list');
  const [viewDoc, setViewDoc] = useState<any>(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (wsId) fetchList(wsId);
  }, [wsId]);

  const filteredDocs = useMemo(() => {
    if (!search.trim()) return docs;
    const q = search.toLowerCase();
    return docs.filter((d: any) =>
      d.title.toLowerCase().includes(q) ||
      (d.content || '').toLowerCase().includes(q) ||
      (d.path || '').toLowerCase().includes(q)
    );
  }, [docs, search]);

  // Group docs by top-level folder from path
  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredDocs.forEach((d: any) => {
      const parts = (d.path || '/').split('/').filter(Boolean);
      const folder = parts.length > 1 ? parts[0] : parts[0] || '根目录';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(d);
    });
    return groups;
  }, [filteredDocs]);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', path: '', content: '', tags: '' });
    setError('');
    setPanelOpen(true);
  };

  const openEdit = (doc: any) => {
    setEditing(doc);
    setForm({
      title: doc.title,
      path: doc.path || '',
      content: doc.content || '',
      tags: (doc.tags || []).join(', '),
    });
    setError('');
    setPanelOpen(true);
  };

  const openView = async (doc: any) => {
    if (wsId) {
      await fetchDetail(wsId, doc.id);
      setViewDoc(doc);
      setMode('view');
    }
  };

  const submit = async () => {
    if (!form.title.trim()) { setError('请输入文档标题'); return; }
    if (!wsId) return;
    setSubmitting(true);
    setError('');
    try {
      const data = {
        title: form.title,
        path: form.path || form.title,
        content: form.content,
        tags: form.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
      };
      if (editing) {
        await update(wsId, editing.id, data);
        if (viewDoc?.id === editing.id) {
          await fetchDetail(wsId, editing.id);
          setViewDoc((await import('../../stores/documentStore')).useDocumentStore.getState().current);
        }
      } else {
        await create(wsId, data);
      }
      setPanelOpen(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || '操作失败');
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (doc: any) => {
    if (!wsId || !confirm(`确定删除「${doc.title}」？`)) return;
    await remove(wsId, doc.id);
    if (mode === 'view' && viewDoc?.id === doc.id) setMode('list');
  };

  const iconFor = (path: string) => {
    if (path.includes('PRD') || path.includes('需求')) return '📋';
    if (path.includes('设计') || path.includes('技术方案')) return '🎨';
    if (path.includes('会议') || path.includes('meeting')) return '📝';
    if (path.includes('API') || path.includes('接口')) return '🔌';
    return '📄';
  };

  if (loading && docs.length === 0) {
    return <div className="empty-state"><div className="empty-icon">📚</div>加载中...</div>;
  }

  return (
    <div>
      {/* List Mode */}
      {mode === 'list' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="搜索文档..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 200, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>共 {filteredDocs.length} 篇</span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openCreate}>+ 新建文档</button>
          </div>

          {filteredDocs.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="empty-icon" style={{ fontSize: '2rem' }}>📚</div>
              <div>{search ? '没有匹配的文档' : '暂无文档，点击上方按钮创建第一篇'}</div>
            </div>
          ) : (
            <div>
              {Object.entries(grouped).map(([folder, folderDocs]) => (
                <div key={folder} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', padding: '4px 0', marginBottom: 6, borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    📁 {folder}
                    <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>({folderDocs.length})</span>
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {folderDocs.map((doc: any) => (
                      <div
                        key={doc.id}
                        className="doc-item"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                          background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-light)', cursor: 'pointer',
                        }}
                        onClick={() => openView(doc)}
                      >
                        <span style={{ fontSize: '1.1rem' }}>{iconFor(doc.path || '')}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>{doc.title}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {doc.path || '/'} · v{doc.version || 1} · {doc.updated_at?.slice(0, 10)}
                          </div>
                        </div>
                        {doc.tags?.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 160 }}>
                            {doc.tags.slice(0, 3).map((t: string) => (
                              <span key={t} className="badge" style={{ fontSize: '0.55rem', padding: '0 5px' }}>{t}</span>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                          <button className="btn btn-ghost btn-xs" onClick={() => openEdit(doc)} title="编辑">✎</button>
                          <button className="btn btn-ghost btn-xs" onClick={() => handleDelete(doc)} title="删除" style={{ color: 'var(--red-500)' }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View Mode */}
      {mode === 'view' && viewDoc && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setMode('list')}>← 返回</button>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{viewDoc.path}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { openEdit(viewDoc); setMode('list'); }}>编辑</button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(viewDoc)} style={{ color: 'var(--red-500)' }}>删除</button>
            </span>
          </div>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px 28px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 12 }}>{viewDoc.title}</h2>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 20, display: 'flex', gap: 12 }}>
              <span>版本 {viewDoc.version || 1}</span>
              <span>更新于 {viewDoc.updated_at?.slice(0, 16)}</span>
              {viewDoc.tags?.map((t: string) => (
                <span key={t} className="badge" style={{ fontSize: '0.55rem' }}>{t}</span>
              ))}
            </div>
            <div
              className="md-content"
              style={{ lineHeight: 1.8, fontSize: '0.85rem', color: 'var(--text-primary)' }}
              dangerouslySetInnerHTML={{ __html: renderMd(viewDoc.content || '') }}
            />
          </div>
        </div>
      )}

      {/* SlidePanel for Create/Edit */}
      <SlidePanel open={panelOpen} onClose={() => setPanelOpen(false)} title={editing ? '编辑文档' : '新建文档'}>
        <div className="form-group">
          <label>标题</label>
          <input type="text" placeholder="文档标题" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>路径 <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>（用于文件夹分组，如 需求/PRD文档）</span></label>
          <input type="text" placeholder="例如：需求/PRD文档" value={form.path} onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>标签 <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>（逗号分隔）</span></label>
          <input type="text" placeholder="例如：需求, v1.0" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
        </div>
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label style={{ margin: 0 }}>内容</label>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setPreview(!preview)}
              style={{ fontSize: '0.65rem' }}
            >
              {preview ? '编辑' : '预览'}
            </button>
          </div>
          {preview ? (
            <div
              style={{
                minHeight: 250, padding: '10px 12px', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)',
                fontSize: '0.82rem', lineHeight: 1.7, overflow: 'auto', maxHeight: 400,
              }}
              dangerouslySetInnerHTML={{ __html: renderMd(form.content) }}
            />
          ) : (
            <textarea
              rows={12}
              placeholder="支持 Markdown 格式…"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', fontFamily: 'ui-monospace, SF Mono, monospace', background: 'var(--bg-surface)', color: 'var(--text-primary)', resize: 'vertical' }}
            />
          )}
        </div>
        {error && (
          <div style={{ color: 'var(--red-500)', fontSize: '0.78rem', padding: '8px 12px', background: 'var(--red-50)', borderRadius: 'var(--radius-sm)', marginBottom: 8 }}>{error}</div>
        )}
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={() => setPanelOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? '保存中...' : editing ? '保存' : '创建文档'}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
