import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { useTaskStore } from '../../../stores/taskStore';
import { useMilestoneStore } from '../../../stores/milestoneStore';
import { useIterationStore } from '../../../stores/iterationStore';

export default function KpiRow() {
  const { id: wsId } = useParams<{ id: string }>();
  const { current } = useWorkspaceStore();
  const isFull = current?.type === 'PROJECT';
  const { milestones, fetchList } = useMilestoneStore();
  const { iterations, fetchList: fetchIterations } = useIterationStore();
  const { members, fetchMembers } = useWorkspaceStore();
  const { kanban, fetchKanban } = useTaskStore();

  useEffect(() => {
    if (wsId) {
      fetchMembers(wsId); fetchKanban(wsId);
      if (isFull) fetchIterations(wsId);
      else fetchList(wsId);
    }
  }, [wsId, isFull]);

  const totalTasks = Object.values(kanban).flat().length;
  const doneTasks = (kanban['DONE'] || []).length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const humanMembers = members.filter((m) => m.role !== 'AI_AGENT').length;

  const trackLabel = isFull ? '迭代' : '里程碑';
  const trackItems = isFull ? iterations : milestones;
  const activeItems = trackItems.filter((m: any) => isFull ? m.status === 'ACTIVE' : (m.phase === 'ACTIVE' || m.phase === 'REVIEW')).length;

  const completedMilestones = milestones.filter(m => m.phase === 'DONE').length;
  const now = new Date();
  const overdueCount = milestones.filter(m => {
    if (m.phase === 'DONE') return false;
    return m.end_date && new Date(m.end_date) < now;
  }).length;

  const milestoneHealthScore = isFull ? 0 : milestones.reduce((score, m) => {
    if (m.phase === 'DONE') return score + 1;
    const isOverdue = m.end_date && new Date(m.end_date) < now;
    if (isOverdue) return score - 1;
    if (m.phase === 'ACTIVE' || m.phase === 'REVIEW') return score + 0.5;
    return score;
  }, 0);
  const maxScore = milestones.length;
  const normalizedHealth = (!isFull && maxScore > 0) ? Math.round((milestoneHealthScore / maxScore) * 100) : 0;
  const healthLevel = isFull
    ? (pct >= 70 ? '良好' : pct >= 40 ? '正常' : '注意')
    : (normalizedHealth >= 70 ? '良好' : normalizedHealth >= 40 ? '正常' : '注意');
  const healthColor = isFull
    ? (pct >= 70 ? 'var(--green-600)' : pct >= 40 ? 'var(--blue-600)' : 'var(--amber-600)')
    : (normalizedHealth >= 70 ? 'var(--green-600)' : normalizedHealth >= 40 ? 'var(--blue-600)' : 'var(--amber-600)');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>任务完成</div>
        <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{doneTasks}/{totalTasks}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{pct}% 完成</div>
      </div>
      {isFull ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{trackLabel}</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--blue-600)' }}>{activeItems}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{trackItems.length} 个{trackLabel} · {activeItems} 活跃</div>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>里程碑</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: overdueCount > 0 ? 'var(--red-500)' : 'var(--blue-600)' }}>
            {completedMilestones}/{trackItems.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {trackItems.length} 个里程碑 · {completedMilestones} 已完成
            {overdueCount > 0 && <span style={{ color: 'var(--red-500)', marginLeft: 4 }}>· {overdueCount} 个逾期</span>}
          </div>
        </div>
      )}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>团队成员</div>
        <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{humanMembers}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>人 · +{members.filter(m => m.role === 'AI_AGENT').length} AI Agent</div>
      </div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>项目健康度</div>
        <div style={{ fontSize: '1.8rem', fontWeight: 700, color: healthColor }}>
          {healthLevel}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
          {isFull
            ? `整体进度 ${pct}%`
            : `${completedMilestones}/${trackItems.length} 里程碑完成${overdueCount > 0 ? ` · ${overdueCount} 个逾期` : ''}`
          }
        </div>
      </div>
    </div>
  );
}
