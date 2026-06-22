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
    <div className="ws-kpi-row">
      <div className="ws-kpi-card">
        <div className="kpi-head">任务完成</div>
        <div className="kpi-count">{doneTasks}/{totalTasks}</div>
        <div className="kpi-detail">{pct}% 完成</div>
      </div>
      {isFull ? (
        <div className="ws-kpi-card">
          <div className="kpi-head">{trackLabel}</div>
          <div className="kpi-count" style={{ color: 'var(--blue-600)' }}>{activeItems}</div>
          <div className="kpi-detail">{trackItems.length} 个{trackLabel} · {activeItems} 活跃</div>
        </div>
      ) : (
        <div className="ws-kpi-card">
          <div className="kpi-head">里程碑</div>
          <div className="kpi-count" style={{ color: overdueCount > 0 ? 'var(--red-500)' : 'var(--blue-600)' }}>
            {completedMilestones}/{trackItems.length}
          </div>
          <div className="kpi-detail">
            {trackItems.length} 个里程碑 · {completedMilestones} 已完成
            {overdueCount > 0 && <span style={{ color: 'var(--red-500)', marginLeft: 4 }}>· {overdueCount} 个逾期</span>}
          </div>
        </div>
      )}
      <div className="ws-kpi-card">
        <div className="kpi-head">团队成员</div>
        <div className="kpi-count">{humanMembers}</div>
        <div className="kpi-detail">人 · +{members.filter(m => m.role === 'AI_AGENT').length} AI Agent</div>
      </div>
      <div className="ws-kpi-card">
        <div className="kpi-head">项目健康度</div>
        <div className="kpi-count" style={{ color: healthColor }}>
          {healthLevel}
        </div>
        <div className="kpi-detail">
          {isFull
            ? `整体进度 ${pct}%`
            : `${completedMilestones}/${trackItems.length} 里程碑完成${overdueCount > 0 ? ` · ${overdueCount} 个逾期` : ''}`
          }
        </div>
      </div>
    </div>
  );
}
