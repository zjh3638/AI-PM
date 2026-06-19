import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTaskStore } from '../../../stores/taskStore';
import { useMilestoneStore } from '../../../stores/milestoneStore';

export default function IdeaPool({ selectedMilestone }: { selectedMilestone: string }) {
  const { id: wsId } = useParams<{ id: string }>();
  const { ideas, ideasLoading, fetchIdeas } = useTaskStore();
  const { milestones, fetchList } = useMilestoneStore();

  useEffect(() => {
    if (wsId) { fetchIdeas(wsId); fetchList(wsId); }
  }, [wsId]);

  const handlePlan = async (ideaId: string, milestoneId: string) => {
    if (!wsId || !milestoneId) return;
    await useTaskStore.getState().update(wsId, ideaId, { milestone_id: milestoneId } as any);
    fetchIdeas(wsId);
  };

  const priorityLabel: Record<string, string> = { CRITICAL: '紧急', HIGH: '高', MEDIUM: '中', LOW: '低' };
  const priorityColor: Record<string, string> = { CRITICAL: 'var(--red-500)', HIGH: 'var(--amber-500)', MEDIUM: 'var(--blue-400)', LOW: 'var(--text-muted)' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>未规划想法 · 共 {ideas.length} 个</span>
      </div>

      {ideasLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '0.78rem' }}>加载中...</div>
      ) : ideas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>💡</div>
          <div>需求池为空</div>
          <div style={{ fontSize: '0.68rem', marginTop: 4 }}>在任务看板中创建不关联里程碑的任务，它们将出现在这里</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ideas.map((idea: any) => (
            <div key={idea.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
            }}>
              <span style={{
                width: 4, height: 30, borderRadius: 2,
                background: priorityColor[idea.priority] || 'var(--text-muted)',
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{idea.title}</div>
                <div style={{ display: 'flex', gap: 10, fontSize: '0.66rem', color: 'var(--text-muted)', alignItems: 'center', marginTop: 2 }}>
                  <span style={{ color: priorityColor[idea.priority], fontWeight: 500 }}>{priorityLabel[idea.priority] || idea.priority}</span>
                  {idea.assignee_name && <span>👤 {idea.assignee_name}</span>}
                  <span>{idea.created_at?.slice(0, 10)}</span>
                </div>
              </div>
              <select
                style={{ fontSize: '0.7rem', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-raised)', cursor: 'pointer', flexShrink: 0 }}
                value=""
                onChange={(e) => { if (e.target.value) handlePlan(idea.id, e.target.value); }}
              >
                <option value="">指派到里程碑 ▾</option>
                {milestones.filter(m => m.phase !== 'DONE').map(ms => (
                  <option key={ms.id} value={ms.id}>{ms.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
