import { Tag } from 'antd';
import type { ProjectGroupActivity } from '../../../types';

export default function ActivityTab({ activity }: { activity: ProjectGroupActivity[] }) {
  if (activity.length === 0) return <div className="empty-state">暂无动态</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {activity.map((a) => (
        <div key={a.id} style={{
          padding: '10px 16px', background: 'var(--bg-surface)',
          border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
          fontSize: '0.82rem',
        }}>
          <Tag>{a.workspace_name}</Tag>
          <strong>{a.user_name}</strong>
          <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
            {a.action_type}
            {a.field_name ? ` · ${a.field_name}` : ''}
            {a.new_value ? ` → ${a.new_value}` : ''}
          </span>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {a.created_at}
          </div>
        </div>
      ))}
    </div>
  );
}
