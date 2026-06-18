import { Tag } from 'antd';
import type { ProjectGroup } from '../../../types';

interface Props {
  group: ProjectGroup;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (workspaceId: string) => void;
}

export default function SettingsTab({ group, canManage, onEdit, onDelete, onAddWorkspace, onRemoveWorkspace }: Props) {
  if (!canManage) return null;
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={onEdit}>编辑项目群</button>
        <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={onDelete}>删除项目群</button>
      </div>

      <h3 style={{ marginBottom: 12 }}>子项目管理</h3>
      <div style={{ marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={onAddWorkspace}>+ 添加项目</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {group.workspaces.map((w) => (
          <div key={w.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
            background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)',
          }}>
            <span style={{ flex: 1, fontWeight: 600 }}>{w.name}</span>
            {w.key && <Tag>{w.key}</Tag>}
            <button className="btn btn-ghost btn-sm" onClick={() => onRemoveWorkspace(w.id)}>
              移除
            </button>
          </div>
        ))}
        {group.workspaces.length === 0 && <div className="empty-state">尚未添加子项目</div>}
      </div>
    </div>
  );
}
