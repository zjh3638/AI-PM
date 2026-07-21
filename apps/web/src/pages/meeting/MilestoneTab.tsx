import { useState, useEffect } from 'react';
import { BoardData } from '../../api/meeting';

const phaseLabel = (phase: string) => {
  if (phase === 'ACTIVE') return '进行中';
  if (phase === 'DONE') return '已完成';
  if (phase === 'REVIEW') return '审核中';
  return '未开始';
};

export default function MilestoneTab({ data }: { data: BoardData }) {
  const milestones = data.milestones;
  const doneCount = milestones.filter(m => m.phase === 'DONE').length;
  const activeMs = milestones.filter(m => m.phase === 'ACTIVE' || m.phase === 'REVIEW');
  const overallPct = milestones.length > 0 ? Math.round(doneCount / milestones.length * 100) : 0;

  // Active milestones auto-expanded (meeting focus); others collapsible.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    setExpanded(new Set(activeMs.map(m => m.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.workspace_id]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <>
      {/* ── Overall milestone progress ── */}
      <div className="ms-overview">
        <div className="ms-ov-head">
          <span className="ms-ov-title">🏔 里程碑整体进展</span>
          <span className="ms-ov-count">{doneCount}/{milestones.length} 已达成 · {overallPct}%</span>
        </div>
        <div className="ms-ov-track">
          {milestones.map(m => (
            <div
              key={m.id}
              className={`ms-ov-seg ${m.phase === 'DONE' ? 'done' : m.overdue ? 'late' : m.phase === 'ACTIVE' || m.phase === 'REVIEW' ? 'active' : 'todo'}`}
              title={`${m.name} · ${phaseLabel(m.phase)}`}
            >
              <span className="ms-ov-seg-label">{m.name}</span>
            </div>
          ))}
        </div>
        {activeMs.length > 0 && (
          <div className="ms-ov-current">
            当前进行中：{activeMs.map(m => m.name).join('、')}
          </div>
        )}
      </div>

      {/* ── Milestones: active first (expanded), then the rest ── */}
      {milestones.map((m) => {
        const isActive = m.phase === 'ACTIVE' || m.phase === 'REVIEW';
        const isOpen = expanded.has(m.id);
        const barClass = m.overdue ? 'danger' : (m.pct > 60 ? 'good' : 'warn');
        const pctColor = m.overdue ? 'var(--red-500)' : m.pct > 60 ? 'var(--green-600)' : 'var(--amber-600)';
        const latestDone = m.completed.slice(0, 2);
        const delayedCount = m.delayed.length;

        return (
          <div key={m.id} className={`ms-block${m.overdue ? ' overdue' : ''}${isActive ? ' current' : ''}`}>
            <div className="ms-header" onClick={() => toggle(m.id)} style={{ cursor: 'pointer' }}>
              <span className="ms-icon">{m.overdue ? '🔴' : isActive ? '🔵' : m.phase === 'DONE' ? '✅' : '⚪'}</span>
              <span className="ms-name" title={m.name}>{m.name}</span>
              <span className={`ms-ms-tag ${m.phase === 'ACTIVE' ? 'active' : m.phase === 'DONE' ? 'done' : ''}`}>{phaseLabel(m.phase)}</span>
              <span className="ms-ts">{m.done_tasks}/{m.total_tasks}</span>
              <div className="ms-pct" style={{ color: pctColor }}>{Math.round(m.pct)}%</div>
              <div className={`ms-due${m.overdue ? ' over' : ''}`}>截止 {m.due_date ? new Date(m.due_date).toLocaleDateString('zh-CN') : '-'}{m.overdue ? ' · 已逾期' : ''}</div>
              <span className="ms-expand">{isOpen ? '▾' : '▸'}</span>
            </div>
            <div className="ms-bar"><div className={`ms-bar-fill ${barClass}`} style={{ width: `${m.pct}%` }} /></div>

            {!isOpen && (
              <div className="ms-collapsed-summary">
                {latestDone.length > 0 && (
                  <span className="ms-key-done">✅ {latestDone.map(t => `${t.assignee_name || '?'} 完成了「${t.title}」`).join(' · ')}</span>
                )}
                {delayedCount > 0 && <span className="ms-key-delay">⚠️ {delayedCount} 个任务延期</span>}
                {latestDone.length === 0 && delayedCount === 0 && <span className="ms-key-empty">暂无近期动态</span>}
              </div>
            )}

            {isOpen && (
              <div className="ms-detail">
                <div className="ms-subsection">
                  <div className="ms-subtitle">🔄 进行中（{m.in_progress.length}）</div>
                  <table className="task-table">
                    <tbody>
                      {m.in_progress.length === 0 ? <tr><td colSpan={3} className="empty-row">无进行中任务</td></tr> :
                        m.in_progress.map((t, i) => (
                          <tr key={i}><td>{t.title}</td><td className="t-who">{t.assignee_name || '-'}</td>
                            <td><span className={`t-status ${t.status === 'IN_REVIEW' ? 'review' : 'progress'}`}>{t.status === 'IN_REVIEW' ? '待Review' : '进行中'}</span></td></tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
                <div className="ms-subsection">
                  <div className="ms-subtitle">⚠️ 延期 / 阻塞（{m.delayed.length}）</div>
                  <table className="task-table">
                    <tbody>
                      {m.delayed.length === 0 ? <tr><td colSpan={3} className="empty-row">✓ 无延期任务</td></tr> :
                        m.delayed.map((t, i) => (
                          <tr key={i}><td>{t.title}</td><td className="t-who">{t.assignee_name || '-'}</td>
                            <td><span className="t-status delayed">⏰ 应于 {t.due_date ? new Date(t.due_date).toLocaleDateString('zh-CN') : ''}</span></td></tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
                <div className="ms-subsection">
                  <div className="ms-subtitle">✅ 已完成（{m.completed.length}）</div>
                  <table className="task-table">
                    <tbody>
                      {m.completed.length === 0 ? <tr><td colSpan={3} className="empty-row">本周无完成任务</td></tr> :
                        m.completed.map((t, i) => (
                          <tr key={i}><td>{t.title}</td><td className="t-who">{t.assignee_name || '-'}</td>
                            <td><span className="t-status done">✓ {t.completed_at ? new Date(t.completed_at).toLocaleDateString('zh-CN') : ''}</span></td></tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
