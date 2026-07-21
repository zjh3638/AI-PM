import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTaskStore } from '../../../stores/taskStore';
import type { Task, WorkItem } from '../../../types';

export default function ListView({ onEditTask, scopeFilter, trackKey }: { onEditTask: (task: Task) => void; scopeFilter: string; trackKey: 'iteration_id' | 'milestone_id' }) {
  const { id: wsId } = useParams<{ id: string }>();
  const { tasks, fetchList, updateWorkItem } = useTaskStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => { if (wsId) fetchList(wsId, { [trackKey]: scopeFilter || undefined }); }, [wsId, scopeFilter]);

  const statusLabels: Record<string, string> = {
    TODO: '待办', IN_PROGRESS: '进行中', IN_REVIEW: '待 Review', DONE: '已完成',
  };
  const today = new Date().toISOString().slice(0, 10);

  const toggle = (id: string) => {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleItem = async (e: React.MouseEvent, taskId: string, it: WorkItem) => {
    e.stopPropagation();
    if (!wsId) return;
    await updateWorkItem(wsId, taskId, it.id, { completed: !it.completed });
  };

  return (
    <div className="task-list">
      <div className="list-head" style={{ gridTemplateColumns: '1fr 150px 100px 90px 90px' }}>
        <span>任务名称</span><span>子工作项</span><span>状态</span><span>优先级</span><span>负责人</span>
      </div>
      {tasks.map((t: Task) => {
        const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'DONE';
        const total = t.work_items_total ?? 0;
        const done = t.work_items_done ?? 0;
        const hasWi = total > 0;
        const allDone = hasWi && done === total;
        const isExpanded = expanded.has(t.id);
        const items = [...(t.work_items || [])].sort((a, b) => a.sort_order - b.sort_order);
        return (
        <div key={t.id}>
          <div className="list-row" onClick={() => onEditTask(t)} style={{ gridTemplateColumns: '1fr 150px 100px 90px 90px', ...(isOverdue ? { borderLeft: '3px solid var(--red-500)', background: 'var(--red-50)' } : {}) }}>
            <span className="task-title" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {hasWi ? (
                <span
                  onClick={(e) => { e.stopPropagation(); toggle(t.id); }}
                  style={{ display: 'inline-flex', width: 16, cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.6rem', transform: isExpanded ? 'rotate(90deg)' : '', transition: '0.15s' }}
                  title="展开子工作项"
                >▶</span>
              ) : <span style={{ width: 16, display: 'inline-block' }} />}
              {isOverdue ? '⚠️ ' : ''}{t.title}
              {t.created_from_template_id && <span className="badge" style={{ marginLeft: 6, fontSize: '0.6rem', background: 'var(--blue-50)', color: 'var(--blue-600)', border: '1px solid var(--blue-100)' }}>📋 模板</span>}
            </span>
            <span>
              {hasWi ? (
                <span className={`wi-inline${allDone ? ' all-done' : ''}`}>
                  <span className="wi-dots">
                    {items.slice(0, 6).map((it) => {
                      const od = !it.completed && it.due_date && it.due_date < today;
                      return <i key={it.id} className={`wi-dot${it.completed ? ' done' : od ? ' overdue' : ''}`} />;
                    })}
                  </span>
                  <span className="wi-inline-frac">{done}/{total}{allDone ? ' ✓' : ''}</span>
                </span>
              ) : <span style={{ color: 'var(--text-placeholder)', fontSize: '0.72rem' }}>—</span>}
            </span>
            <span><span className="badge" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>{statusLabels[t.status] || t.status}</span></span>
            <span style={isOverdue ? { color: 'var(--red-500)', fontWeight: 600 } : {}}>{t.priority}{t.due_date && <span style={{ marginLeft: 4, fontSize: '0.62rem', color: isOverdue ? 'var(--red-500)' : 'var(--text-muted)' }}>📅 {t.due_date}</span>}</span>
            <span>{t.assignee_name || '—'}</span>
          </div>
          {isExpanded && hasWi && (
            <div style={{ padding: '4px 16px 10px 40px', background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-light)' }}>
              {items.map((it) => {
                const od = !it.completed && it.due_date && it.due_date < today;
                return (
                  <div key={it.id} className={`wi-row${it.completed ? ' done' : ''}`} style={{ gridTemplateColumns: '22px 1fr 100px 110px', background: 'transparent' }}>
                    <button className="wi-check" onClick={(e) => toggleItem(e, t.id, it)} title={it.completed ? '标记未完成' : '标记完成'}>{it.completed ? '✓' : ''}</button>
                    <span className="wi-title">{it.title}</span>
                    <span className="wi-assignee-text">{it.assignee_name || '未指派'}</span>
                    <span className={`wi-due-text${od ? ' overdue' : ''}`}>{it.due_date || '—'}{od ? ' ⚠' : ''}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        );
      })}
      {tasks.length === 0 && (
        <div className="empty-state" style={{ padding: 30 }}>暂无任务</div>
      )}
    </div>
  );
}
