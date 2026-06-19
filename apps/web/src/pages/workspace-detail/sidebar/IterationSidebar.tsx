import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useIterationStore } from '../../../stores/iterationStore';

export default function IterationSidebar({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const { id: wsId } = useParams<{ id: string }>();
  const { iterations, loading, fetchList } = useIterationStore();

  useEffect(() => { if (wsId) fetchList(wsId); }, [wsId]);

  const totalTasks = iterations.reduce((s, i) => s + i.task_count, 0);
  const activeCount = iterations.filter((i) => i.status === 'ACTIVE').length;

  const handleSelect = (id: string) => onSelect(selectedId === id ? '' : id);

  const statusIcon = (status: string) => status === 'ACTIVE' ? '◎' : status === 'CLOSED' ? '●' : '○';
  const statusColor = (status: string) => status === 'ACTIVE' ? 'var(--green-500)' : status === 'CLOSED' ? 'var(--text-muted)' : 'var(--blue-400)';

  return (
    <div className="pulse-sidebar">
      <div className="pulse-sidebar-header">
        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>迭代</span>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.72rem' }}>加载中...</div> : (
        <>
          <div
            onClick={() => onSelect('')}
            style={{
              cursor: 'pointer', padding: '10px 14px', marginBottom: 4,
              borderRadius: 'var(--radius-md)',
              background: !selectedId ? 'var(--blue-50)' : 'transparent',
              borderLeft: !selectedId ? '3px solid var(--blue-500)' : '3px solid transparent',
              fontSize: '0.74rem', fontWeight: !selectedId ? 600 : 400,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <span>全部迭代</span>
            <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{totalTasks} 个任务</span>
          </div>

          {iterations.map((it) => (
            <div
              key={it.id}
              onClick={() => handleSelect(it.id)}
              title={it.goal || undefined}
              style={{
                cursor: 'pointer', padding: '8px 14px', marginBottom: 2,
                borderRadius: 'var(--radius-md)',
                background: selectedId === it.id ? 'var(--blue-50)' : 'transparent',
                borderLeft: selectedId === it.id ? '3px solid var(--blue-500)' : '3px solid transparent',
                fontSize: '0.73rem', fontWeight: selectedId === it.id ? 500 : 400,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: statusColor(it.status), fontSize: '0.64rem' }}>{statusIcon(it.status)}</span>
                <span>{it.name}</span>
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2, marginLeft: 18 }}>
                {it.start_date} → {it.end_date}
              </div>
              {it.capacity_points > 0 && (
                <div style={{ marginTop: 4, marginLeft: 18 }}>
                  <div style={{ height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.min(100, Math.round((it.committed_points / it.capacity_points) * 100))}%`,
                      background: 'var(--blue-400)', borderRadius: 2, transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {it.committed_points}/{it.capacity_points} pts · {it.task_count} 任务
                  </div>
                </div>
              )}
              {it.status === 'ACTIVE' && it.start_date && it.end_date && it.task_count > 0 && (
                (() => {
                  const start = new Date(it.start_date);
                  const end = new Date(it.end_date);
                  const now = new Date();
                  const totalDuration = end.getTime() - start.getTime();
                  const elapsed = now.getTime() - start.getTime();
                  const timePct = totalDuration > 0 ? Math.min(100, Math.round((elapsed / totalDuration) * 100)) : 0;
                  const doneCount = it.committed_points || 0;
                  const workPct = it.capacity_points > 0 ? Math.round((doneCount / it.capacity_points) * 100) : 0;
                  const ahead = workPct >= timePct;
                  return (
                    <div style={{ marginTop: 2, marginLeft: 18, fontSize: '0.58rem', color: ahead ? 'var(--green-500)' : 'var(--red-500)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span>{ahead ? '📈' : '📉'}</span>
                      <span>已过 {timePct}% ↘ 完成 {workPct}%</span>
                    </div>
                  );
                })()
              )}
            </div>
          ))}

          <div className="sidebar-ai expanded" style={{ borderTop: '1px solid var(--border-light)', paddingTop: 8, marginTop: 8 }}>
            <div className="sai-head">
              <span><span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: 4 }}>AI</span> 摘要</span>
            </div>
            <div className="sai-body" style={{ display: 'block' }}>
              共 <strong>{iterations.length} 个迭代</strong>，{activeCount} 个活跃，已提交 <strong>{
                iterations.reduce((s, i) => s + i.committed_points, 0)
              } pts</strong>。
            </div>
          </div>
        </>
      )}
    </div>
  );
}
