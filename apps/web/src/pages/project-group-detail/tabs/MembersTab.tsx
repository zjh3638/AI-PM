import { Tag } from 'antd';
import type { ProjectGroupMember } from '../../../types';

export default function MembersTab({ members }: { members: ProjectGroupMember[] }) {
  if (members.length === 0) return <div className="empty-state">暂无成员</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {members.map((m) => (
        <div key={m.user_id} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
          background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
        }}>
          <span style={{ fontWeight: 600 }}>{m.display_name}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
            参与 {m.project_count} 个项目
          </span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {m.projects.map((p) => <Tag key={p.workspace_id}>{p.workspace_name}</Tag>)}
          </div>
        </div>
      ))}
    </div>
  );
}
