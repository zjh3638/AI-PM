import { Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { ProjectGroupTask } from '../../../types';

export default function TasksTab({ tasks }: { tasks: ProjectGroupTask[] }) {
  const navigate = useNavigate();
  if (tasks.length === 0) return <div className="empty-state">暂无任务</div>;
  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        共 {tasks.length} 个任务
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.map((t) => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
            background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)', cursor: 'pointer',
          }} onClick={() => navigate(`/workspaces/${t.workspace_id}`)}>
            <Tag>{t.workspace_name}</Tag>
            <span style={{ flex: 1, fontWeight: 600 }}>{t.title}</span>
            <Tag color={t.status === 'DONE' ? 'green' : t.status === 'IN_PROGRESS' ? 'blue' : 'default'}>
              {t.status}
            </Tag>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{t.priority}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
