import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTaskStore } from '../../../stores/taskStore';
import type { Task } from '../../../types';

export default function ListView({ onEditTask, scopeFilter, isFull }: { onEditTask: (task: Task) => void; scopeFilter: string; isFull: boolean }) {
  const { id: wsId } = useParams<{ id: string }>();
  const { tasks, fetchList } = useTaskStore();

  useEffect(() => { if (wsId) fetchList(wsId, { [isFull ? 'iteration_id' : 'milestone_id']: scopeFilter || undefined }); }, [wsId, scopeFilter]);

  const statusLabels: Record<string, string> = {
    TODO: '待办', IN_PROGRESS: '进行中', IN_REVIEW: '待 Review', DONE: '已完成',
  };

  return (
    <div className="task-list">
      <div className="list-head">
        <span>任务名称</span><span>状态</span><span>优先级</span><span>负责人</span><span />
      </div>
      {tasks.map((t: Task) => {
        const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'DONE';
        return (
        <div key={t.id} className="list-row" onClick={() => onEditTask(t)} style={isOverdue ? { borderLeft: '3px solid var(--red-500)', background: 'var(--red-50)' } : {}}>
          <span className="task-title">{isOverdue ? '⚠️ ' : ''}{t.title}</span>
          <span><span className="badge" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>{statusLabels[t.status] || t.status}</span></span>
          <span style={isOverdue ? { color: 'var(--red-500)', fontWeight: 600 } : {}}>{t.priority}{t.due_date && <span style={{ marginLeft: 4, fontSize: '0.62rem', color: isOverdue ? 'var(--red-500)' : 'var(--text-muted)' }}>📅 {t.due_date}</span>}</span>
          <span>{t.assignee_name || '—'}</span>
          <span />
        </div>
        );
      })}
      {tasks.length === 0 && (
        <div className="empty-state" style={{ padding: 30 }}>暂无任务</div>
      )}
    </div>
  );
}
