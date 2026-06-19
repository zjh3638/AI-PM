import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useIterationStore } from '../../../stores/iterationStore';
import SlidePanel from '../../../components/common/SlidePanel';
import type { Iteration } from '../../../types';
import { ITER_STATUS } from './BurndownChart';

export default function IterationsPanel() {
  const { id: wsId } = useParams<{ id: string }>();
  const { iterations, loading, fetchList, create, update, startIter, closeIter } = useIterationStore();
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Iteration | null>(null);
  const [form, setForm] = useState({ name: '', goal: '', start_date: '', end_date: '', capacity_points: 0 });

  useEffect(() => { if (wsId) fetchList(wsId); }, [wsId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', goal: '', start_date: '', end_date: '', capacity_points: 0 });
    setPanelOpen(true);
  };

  const openEdit = (it: Iteration) => {
    setEditing(it);
    setForm({ name: it.name, goal: it.goal || '', start_date: it.start_date?.slice(0, 10) || '', end_date: it.end_date?.slice(0, 10) || '', capacity_points: it.capacity_points || 0 });
    setPanelOpen(true);
  };

  const submit = async () => {
    if (!wsId || !form.name.trim()) return;
    if (editing) {
      await update(wsId, editing.id, form as any);
    } else {
      await create(wsId, form as any);
    }
    setPanelOpen(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 600 }}>共 {iterations.length} 个迭代</span>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ 新建迭代</button>
      </div>

      {loading ? (
        <div className="empty-state">加载中...</div>
      ) : iterations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔄</div>
          <div>暂无迭代</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {iterations.map((it: Iteration) => {
            const st = ITER_STATUS[it.status] || ITER_STATUS.PLANNING;
            const progress = it.capacity_points > 0 ? Math.round((it.committed_points / it.capacity_points) * 100) : 0;

            return (
              <div
                key={it.id}
                className="need-card"
                onClick={() => openEdit(it)}
                style={{ marginBottom: 0 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>{it.name}</h4>
                    <div className="meta" style={{ marginTop: 4 }}>
                      <span>{it.start_date?.slice(0, 10)} → {it.end_date?.slice(0, 10)}</span>
                      <span>{it.task_count || 0} 个任务</span>
                    </div>
                    {it.goal && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>{it.goal}</div>}
                  </div>
                  <span className={st.cls} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 8 }}>
                    {st.label}
                  </span>
                </div>

                {it.status !== 'CLOSED' && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 3 }}>
                      <span>进度</span>
                      <span>{it.committed_points}/{it.capacity_points} pts ({progress}%)</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-raised)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: progress > 80 ? 'var(--green-500)' : progress > 40 ? 'var(--blue-500)' : 'var(--amber-500)', width: `${Math.min(progress, 100)}%`, transition: 'width 0.5s var(--ease)' }} />
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 8, display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  {it.status === 'PLANNING' && (
                    <button className="btn btn-xs btn-primary" onClick={() => wsId && startIter(wsId, it.id)}>启动迭代</button>
                  )}
                  {it.status === 'ACTIVE' && (
                    <button className="btn btn-xs btn-ghost" onClick={() => wsId && closeIter(wsId, it.id)}>关闭迭代</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SlidePanel open={panelOpen} onClose={() => setPanelOpen(false)} title={editing ? '编辑迭代' : '新建迭代'}>
        <div className="form-group">
          <label>迭代名称</label>
          <input type="text" placeholder="例如：Sprint 6" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>目标</label>
          <textarea rows={3} placeholder="迭代目标（可选）" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', fontFamily: 'inherit', background: 'var(--bg-surface)', color: 'var(--text-primary)', resize: 'vertical' }} value={form.goal} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>开始日期</label>
            <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>结束日期</label>
            <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label>容量（故事点）</label>
          <input type="number" value={form.capacity_points} onChange={(e) => setForm((f) => ({ ...f, capacity_points: Number(e.target.value) }))} />
        </div>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={() => setPanelOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={submit}>{editing ? '保存' : '创建迭代'}</button>
        </div>
      </SlidePanel>
    </div>
  );
}
