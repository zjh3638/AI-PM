import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTaskStore } from '../../../stores/taskStore';
import api from '../../../api/client';
import type { Task } from '../../../types';

export default function EpicsPanel() {
  const { id: wsId } = useParams<{ id: string }>();
  const { epics, fetchEpics } = useTaskStore();
  const [expandedEpic, setExpandedEpic] = useState<string | null>(null);
  const [epicTasks, setEpicTasks] = useState<Record<string, Task[]>>({});

  useEffect(() => { if (wsId) fetchEpics(wsId); }, [wsId]);

  const toggleExpand = async (epicId: string) => {
    if (expandedEpic === epicId) { setExpandedEpic(null); return; }
    setExpandedEpic(epicId);
    if (!epicTasks[epicId] && wsId) {
      const res: any = await api.get(`/workspaces/${wsId}/tasks`, { params: { epic_id: epicId } });
      setEpicTasks((prev) => ({ ...prev, [epicId]: res.data || [] }));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 600 }}>共 {epics.length} 个 Epic</span>
        <button className="btn btn-primary btn-sm" onClick={() => {
          const event = new CustomEvent('create-epic');
          window.dispatchEvent(event);
        }}>+ 新建 Epic</button>
      </div>

      {epics.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <div>暂无 Epic</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {epics.map((epic: any) => {
            const progress = epic.total_stories > 0 ? Math.round((epic.done_stories / epic.total_stories) * 100) : 0;
            const isExpanded = expandedEpic === epic.id;

            return (
              <div key={epic.id}>
                <div
                  className="need-card"
                  onClick={() => toggleExpand(epic.id)}
                  style={{ marginBottom: 0 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>🎯 {epic.title}</h4>
                    <span className="badge badge-blue" style={{ fontSize: '0.68rem' }}>Epic</span>
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    <span>{epic.total_stories || 0} 个 Story</span>
                    <span>{epic.done_stories || 0} 已完成</span>
                  </div>
                  {epic.total_stories > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ height: 6, background: 'var(--bg-raised)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, background: 'var(--blue-500)', width: `${progress}%`, transition: 'width 0.5s var(--ease)' }} />
                      </div>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div style={{ marginLeft: 16, marginTop: 4, marginBottom: 8 }}>
                    {(epicTasks[epic.id] || []).map((t: Task) => (
                      <div key={t.id} className="need-card" style={{ marginBottom: 0, fontSize: '0.82rem', padding: '10px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{t.title}</span>
                          <span className="badge" style={{ fontSize: '0.65rem', background: 'var(--bg-raised)', color: 'var(--text-muted)' }}>
                            {t.status === 'DONE' ? '✓ 已完成' : t.status === 'IN_PROGRESS' ? '进行中' : t.status === 'IN_REVIEW' ? '待 Review' : '待办'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {(!epicTasks[epic.id] || epicTasks[epic.id].length === 0) && (
                      <div style={{ padding: '12px 14px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>暂无子任务</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
