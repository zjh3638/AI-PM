import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMilestoneStore } from '../../../stores/milestoneStore';
import { MILESTONE_PHASE_LABELS } from '../../../types';
import type { Milestone } from '../../../types';
import { buildDependencyChain, isOverdue } from '../helpers';

export default function MilestoneSidebar({ selectedId, onSelect, onEdit }: { selectedId: string; onSelect: (id: string) => void; onEdit: (ms: Milestone) => void }) {
  const { id: wsId } = useParams<{ id: string }>();
  const { milestones, loading, fetchList, advancePhase } = useMilestoneStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => { if (wsId) fetchList(wsId); }, [wsId]);

  const handleCreate = async () => {
    if (!wsId || !newName.trim()) return;
    await useMilestoneStore.getState().create(wsId, { name: newName, sort_order: milestones.length });
    setNewName('');
    setShowCreate(false);
  };

  const handleAdvancePhase = async (msId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!wsId) return;
    try { await advancePhase(wsId, msId); } catch { /* ignore */ }
  };

  const totalTasks = milestones.reduce((s, m) => s + m.task_count, 0);
  const totalDone = milestones.reduce((s, m) => s + m.done_count, 0);
  const totalPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  const sorted = buildDependencyChain(milestones);

  return (
    <div className="pulse-sidebar">
      <div className="sidebar-section">
        <div className="ss-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>里程碑</span>
          <button className="btn-icon-sm" onClick={() => setShowCreate(!showCreate)} title="新建里程碑" style={{ width: 22, height: 22, borderRadius: 4, fontSize: '0.78rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer', background: 'var(--bg-raised)', border: '1px solid var(--border-light)', lineHeight: 1 }}>+</button>
        </div>

        {showCreate && (
          <div style={{ padding: '6px 8px', background: 'var(--bg-raised)', borderRadius: 'var(--radius-sm)', marginBottom: 6 }}>
            <input
              type="text"
              placeholder="里程碑名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
              style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none', marginBottom: 4 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-primary btn-xs" onClick={handleCreate}>创建</button>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowCreate(false)}>取消</button>
            </div>
          </div>
        )}

        <div className="sidebar-ms-list" style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
          <div
            className={`sidebar-ms${selectedId === '' ? ' active' : ''}`}
            onClick={() => onSelect('')}
            style={{ opacity: selectedId === '' ? 1 : 0.6 }}
          >
            <div className="sms-row1">
              <span className="sms-name" style={{ color: 'var(--blue-600)' }}>📋 全部里程碑</span>
              <span className="sms-badge" style={{ background: 'var(--blue-100)', color: 'var(--blue-600)' }}>
                {totalTasks}
              </span>
            </div>
            <div className="sms-bar">
              <div className="sms-fill active" style={{ width: `${totalPct}%` }} />
            </div>
            <div className="sms-pct">{totalDone}/{totalTasks} · {totalPct}%</div>
          </div>

          {loading ? (
            <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.76rem' }}>加载中...</div>
          ) : milestones.length === 0 ? (
            <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.76rem' }}>暂无里程碑</div>
          ) : (
            sorted.map((ms) => {
              const pct = ms.task_count > 0 ? Math.round((ms.done_count / ms.task_count) * 100) : 0;
              const isActive = selectedId === ms.id;
              const phase = ms.phase || 'PLANNING';
              const phaseLabel = MILESTONE_PHASE_LABELS[phase] || phase;
              const phaseCls = phase === 'DONE' ? 'done' : phase === 'ACTIVE' || phase === 'REVIEW' ? 'active' : 'upcoming';

              const pred = ms.depends_on_id ? milestones.find(m => m.id === ms.depends_on_id) : null;
              const isBlocked = pred && pred.phase !== 'DONE';

              return (
                <div
                  key={ms.id}
                  className={`sidebar-ms${isActive ? ' active' : ''}`}
                  onClick={() => onSelect(ms.id)}
                  onDoubleClick={() => onEdit(ms)}
                >
                  {ms.depends_on_id && (
                    <div style={{ fontSize: '0.58rem', color: isBlocked ? 'var(--red-500)' : 'var(--green-500)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ opacity: 0.5 }}>└─</span>
                      <span>{isBlocked ? '🔒 阻塞' : '✓'} {ms.depends_on_name || ''}</span>
                    </div>
                  )}

                  <div className="sms-row1">
                    <span className="sms-name" title={ms.name}>{ms.name}</span>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                      <span className={`sms-badge ${phaseCls}`}>
                        {phaseLabel}
                      </span>
                      {phase !== 'DONE' && (
                        <button
                          className="btn-icon-sm"
                          onClick={(e) => handleAdvancePhase(ms.id, e)}
                          title="推进阶段"
                          style={{ width: 16, height: 16, borderRadius: 3, fontSize: '0.55rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-light)', lineHeight: 1, padding: 0 }}
                        >▸</button>
                      )}
                    </div>
                  </div>

                  {(ms.start_date || ms.end_date) && (
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>{ms.start_date?.slice(0, 10) || '?'} → {ms.end_date?.slice(0, 10) || '?'}</span>
                      {isOverdue(ms) && (
                        <span style={{ color: 'var(--red-500)', fontWeight: 600, fontSize: '0.55rem' }}>⚠ 逾期</span>
                      )}
                    </div>
                  )}

                  <div className="sms-bar">
                    <div className={`sms-fill ${phaseCls}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="sms-pct">
                    {ms.done_count}/{ms.task_count} · {pct}%
                    {ms.owner_name && <span> · {ms.owner_name}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="sidebar-ai expanded" style={{ borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
        <div className="sai-head">
          <span><span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: 4 }}>AI</span> 摘要</span>
        </div>
        <div className="sai-body" style={{ display: 'block' }}>
          本周完成 <strong>{totalDone} 个任务</strong>，在 <strong>{milestones.filter(m => m.phase === 'ACTIVE').length} 个活跃里程碑</strong> 中推进。
        </div>
      </div>
    </div>
  );
}
