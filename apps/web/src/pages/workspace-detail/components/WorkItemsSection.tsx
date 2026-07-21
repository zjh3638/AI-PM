import { useMemo, useState } from 'react';
import { useTaskStore } from '../../../stores/taskStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import type { WorkItem } from '../../../types';

/**
 * 子工作清单编辑器 —— 复杂任务的扁平化子工作项管理。
 * 每一项有独立负责人、截止时间、完成状态；不引入父子任务层级。
 */
export default function WorkItemsSection({
  taskId,
  workspaceId,
  workItems,
  canEdit,
}: {
  taskId: string;
  workspaceId: string;
  workItems: WorkItem[];
  canEdit: boolean;
}) {
  const { addWorkItem, updateWorkItem, deleteWorkItem } = useTaskStore();
  const { members } = useWorkspaceStore();

  const [newTitle, setNewTitle] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDue, setNewDue] = useState('');
  const [busy, setBusy] = useState(false);

  const assignableMembers = useMemo(
    () => members.filter((m) => m.user_id).map((m) => ({ id: m.user_id as string, name: m.user_name || '成员' })),
    [members]
  );

  const items = [...(workItems || [])].sort((a, b) => a.sort_order - b.sort_order);
  const doneCount = items.filter((i) => i.completed).length;
  const total = items.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const allDone = total > 0 && doneCount === total;

  const handleAdd = async () => {
    if (!newTitle.trim() || busy) return;
    setBusy(true);
    try {
      await addWorkItem(workspaceId, taskId, {
        title: newTitle.trim(),
        assignee_id: newAssignee || null,
        due_date: newDue || null,
      });
      setNewTitle('');
      setNewAssignee('');
      setNewDue('');
    } finally {
      setBusy(false);
    }
  };

  const toggleDone = async (it: WorkItem) => {
    if (!canEdit) return;
    await updateWorkItem(workspaceId, taskId, it.id, { completed: !it.completed });
  };

  const changeAssignee = async (it: WorkItem, assignee_id: string) => {
    await updateWorkItem(workspaceId, taskId, it.id, { assignee_id: assignee_id || null });
  };

  const changeDue = async (it: WorkItem, due_date: string) => {
    await updateWorkItem(workspaceId, taskId, it.id, { due_date: due_date || null });
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="wi-section">
      {/* 头部：完成度进度条 */}
      <div className="wi-head">
        <span className="wi-head-title">
          子工作清单 <span className={`wi-frac${allDone ? ' done' : ''}`}>{doneCount}/{total}{allDone ? ' ✓' : ''}</span>
        </span>
      </div>
      {total > 0 && (
        <div className="wi-bar-bg">
          <div className="wi-bar-fill" style={{ width: `${pct}%`, background: allDone ? 'var(--green-500)' : 'var(--blue-500)' }} />
        </div>
      )}

      {/* 工作项列表 */}
      <div className="wi-list">
        {items.map((it) => {
          const overdue = !it.completed && it.due_date && it.due_date < today;
          return (
            <div key={it.id} className={`wi-row${it.completed ? ' done' : ''}`}>
              <button
                className="wi-check"
                onClick={() => toggleDone(it)}
                disabled={!canEdit}
                title={it.completed ? '标记未完成' : '标记完成'}
              >
                {it.completed ? '✓' : ''}
              </button>
              <span className="wi-title" title={it.title}>{it.title}</span>
              {canEdit ? (
                <select
                  className="wi-assignee-select"
                  value={it.assignee_id || ''}
                  onChange={(e) => changeAssignee(it, e.target.value)}
                >
                  <option value="">未指派</option>
                  {assignableMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <span className="wi-assignee-text">{it.assignee_name || '未指派'}</span>
              )}
              {canEdit ? (
                <input
                  type="date"
                  className={`wi-due-input${overdue ? ' overdue' : ''}`}
                  value={it.due_date || ''}
                  onChange={(e) => changeDue(it, e.target.value)}
                />
              ) : (
                <span className={`wi-due-text${overdue ? ' overdue' : ''}`}>{it.due_date || '—'}{overdue ? ' ⚠' : ''}</span>
              )}
              {canEdit && (
                <button className="wi-del" onClick={() => deleteWorkItem(workspaceId, taskId, it.id)} title="删除工作项">✕</button>
              )}
            </div>
          );
        })}
        {total === 0 && <div className="wi-empty">暂无子工作项。复杂任务可拆分为多个子工作项，各自负责人和时间独立跟踪。</div>}
      </div>

      {/* 新增行 */}
      {canEdit && (
        <div className="wi-add-row">
          <input
            className="wi-add-title"
            placeholder="新增子工作项，如「指标接入」"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <select className="wi-assignee-select" value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)}>
            <option value="">负责人</option>
            {assignableMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <input className="wi-due-input" type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
          <button className="btn btn-primary btn-xs" onClick={handleAdd} disabled={!newTitle.trim() || busy}>
            {busy ? '...' : '添加'}
          </button>
        </div>
      )}
    </div>
  );
}
