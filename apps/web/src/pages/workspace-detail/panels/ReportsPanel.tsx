import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTaskStore } from '../../../stores/taskStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import type { WorkspaceMember } from '../../../types';
import BurndownChart from './BurndownChart';

export default function ReportsPanel() {
  const { id: wsId } = useParams<{ id: string }>();
  const { kanban, fetchKanban } = useTaskStore();
  const { members, fetchMembers } = useWorkspaceStore();

  useEffect(() => {
    if (wsId) { fetchKanban(wsId); fetchMembers(wsId); }
  }, [wsId]);

  const statusLabels = ['待办', '进行中', '待 Review', '已完成'];
  const statusKeys = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
  const statusColors = ['#94a3b8', '#60a5fa', '#f59e0b', '#34d399'];
  const maxCount = Math.max(...statusKeys.map((k) => (kanban[k] || []).length), 1);

  const allTasks = Object.values(kanban).flat();
  const priorityCounts: Record<string, number> = {};
  allTasks.forEach((t: any) => { priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1; });
  const maxPriority = Math.max(...Object.values(priorityCounts), 1);

  return (
    <div className="report-grid">
      <div className="report-card">
        <h4>任务分布</h4>
        <div className="report-chart">
          <div style={{ width: '100%', padding: '0 16px' }}>
            {statusKeys.map((k, i) => {
              const count = (kanban[k] || []).length;
              return (
                <div key={k} className="report-bar">
                  <span className="bar-label">{statusLabels[i]}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(count / maxCount) * 100}%`, background: statusColors[i] }} />
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 20, textAlign: 'right' }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="report-card">
        <h4>按优先级分布</h4>
        <div className="report-chart">
          <div style={{ width: '100%', padding: '0 16px' }}>
            {Object.entries(priorityCounts).length > 0 ? (
              Object.entries(priorityCounts).map(([p, c]) => (
                <div key={p} className="report-bar">
                  <span className="bar-label">{p === 'CRITICAL' ? '紧急' : p === 'HIGH' ? '高' : p === 'MEDIUM' ? '中' : '低'}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{
                      width: `${(c / maxPriority) * 100}%`,
                      background: p === 'CRITICAL' ? 'var(--red-500)' : p === 'HIGH' ? 'var(--amber-500)' : p === 'MEDIUM' ? 'var(--blue-500)' : 'var(--text-muted)',
                    }} />
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 20, textAlign: 'right' }}>{c}</span>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>暂无数据</div>
            )}
          </div>
        </div>
      </div>

      <div className="report-card">
        <h4>团队负载</h4>
        <div className="report-chart">
          <div style={{ width: '100%', padding: '0 16px' }}>
            {members.length > 0 ? (
              (() => {
                const memberLoad = members
                  .filter((m: WorkspaceMember) => m.role !== 'AI_AGENT')
                  .map((m: WorkspaceMember) => {
                    const total = allTasks.filter((t: any) => t.assignee_id === (m.user_id || m.id) && t.status !== 'DONE').length;
                    const inProgress = allTasks.filter((t: any) => t.assignee_id === (m.user_id || m.id) && t.status === 'IN_PROGRESS').length;
                    return { member: m, total, inProgress };
                  });
                const maxLoad = Math.max(...memberLoad.map((l) => l.total), 1);
                return memberLoad.map(({ member: m, total, inProgress }) => (
                  <div key={m.id} className="report-bar">
                    <span className="bar-label">{m.user_name || m.user_id}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{
                        width: `${(total / maxLoad) * 100}%`,
                        background: total > 5 ? 'var(--red-400)' : total > 2 ? 'var(--amber-400)' : 'var(--blue-400)',
                      }} />
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 48, textAlign: 'right' }}>
                      {total} 进行中({inProgress})
                    </span>
                  </div>
                ));
              })()
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>暂无数据</div>
            )}
          </div>
        </div>
      </div>

      <div className="report-card" style={{ gridColumn: '1 / -1' }}>
        <BurndownChart wsId={wsId!} />
      </div>

      <div className="report-card">
        <h4>概览统计</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--radius)', padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--blue-600)' }}>{allTasks.length}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>总任务数</div>
          </div>
          <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--radius)', padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--green-600)' }}>{(kanban['DONE'] || []).length}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>已完成</div>
          </div>
          <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--radius)', padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--amber-600)' }}>{members.length}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>团队人数</div>
          </div>
          <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--radius)', padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--blue-600)' }}>
              {allTasks.length > 0 ? Math.round(((kanban['DONE'] || []).length / allTasks.length) * 100) : 0}%
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>完成率</div>
          </div>
        </div>
      </div>
    </div>
  );
}
