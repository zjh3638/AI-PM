import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTaskStore } from '../../../stores/taskStore';
import { useIterationStore } from '../../../stores/iterationStore';
import type { Task } from '../../../types';

export default function BacklogPanel({ onEditStory, onCreateStory, selectedIteration }: { onEditStory: (story: Task) => void; onCreateStory: () => void; selectedIteration: string }) {
  const { id: wsId } = useParams<{ id: string }>();
  const { backlog, backlogLoading, fetchBacklog } = useTaskStore();
  const { iterations, fetchList: fetchIterations } = useIterationStore();

  useEffect(() => {
    if (wsId) { fetchBacklog(wsId); fetchIterations(wsId); }
  }, [wsId]);

  const activeIterations = iterations.filter(it => it.status === 'PLANNING' || it.status === 'ACTIVE');
  const currentIterName = iterations.find(it => it.id === selectedIteration)?.name;

  const priorityLabel: Record<string, string> = { CRITICAL: '紧急', HIGH: '高', MEDIUM: '中', LOW: '低' };
  const priorityColor: Record<string, string> = { CRITICAL: 'var(--red-500)', HIGH: 'var(--amber-500)', MEDIUM: 'var(--blue-400)', LOW: 'var(--text-muted)' };

  const handlePlan = async (storyId: string, iterationId: string) => {
    if (!wsId || !iterationId) return;
    await useTaskStore.getState().planStory(wsId, storyId, iterationId);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>未规划需求 · 共 {backlog.length} 个</span>
        <button className="btn btn-primary btn-sm" onClick={onCreateStory}>+ 新建需求</button>
      </div>

      {currentIterName && (
        <div style={{ marginBottom: 12, padding: '6px 12px', background: 'var(--blue-50)', borderRadius: 'var(--radius-sm)', fontSize: '0.72rem', color: 'var(--blue-600)', display: 'flex', alignItems: 'center', gap: 6 }}>
          📌 当前迭代：<strong>{currentIterName}</strong> — 需求将从池中规划到此迭代
        </div>
      )}

      {backlogLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '0.78rem' }}>加载中...</div>
      ) : backlog.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
          <div>需求池为空</div>
          <div style={{ fontSize: '0.68rem', marginTop: 4 }}>点击「新建需求」添加第一个需求</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {backlog.map((story: Task) => (
            <div key={story.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)', cursor: 'pointer',
            }} onClick={() => onEditStory(story)}>
              <span style={{
                width: 4, height: 36, borderRadius: 2,
                background: priorityColor[story.priority] || 'var(--text-muted)',
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {story.title}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: '0.66rem', color: 'var(--text-muted)', alignItems: 'center' }}>
                  <span style={{ color: priorityColor[story.priority], fontWeight: 500 }}>{priorityLabel[story.priority] || story.priority}</span>
                  <span>{story.children_count ?? 0} 个子任务</span>
                  {story.proposer_name && <span>👤 {story.proposer_name}</span>}
                  <span>{story.created_at?.slice(0, 10)}</span>
                </div>
              </div>
              <select
                style={{
                  fontSize: '0.7rem', padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', background: 'var(--bg-raised)',
                  cursor: 'pointer', flexShrink: 0,
                }}
                value={selectedIteration}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  if (e.target.value) handlePlan(story.id, e.target.value);
                }}
              >
                <option value="">规划到迭代 ▾</option>
                {activeIterations.map(it => (
                  <option key={it.id} value={it.id}>{it.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
