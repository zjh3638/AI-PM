import { Tag } from 'antd';
import type { ProjectGroupMilestone } from '../../../types';

export default function MilestonesTab({ milestones }: { milestones: ProjectGroupMilestone[] }) {
  if (milestones.length === 0) return <div className="empty-state">暂无里程碑或迭代</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {milestones.map((m) => (
        <div key={`${m.type}-${m.id}`} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
          background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
        }}>
          <Tag color={m.type === 'milestone' ? 'purple' : 'cyan'}>
            {m.type === 'milestone' ? '里程碑' : '迭代'}
          </Tag>
          <Tag>{m.workspace_name}</Tag>
          <span style={{ flex: 1, fontWeight: 600 }}>{m.name}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
            {m.due_date || m.end_date || ''}
          </span>
        </div>
      ))}
    </div>
  );
}
