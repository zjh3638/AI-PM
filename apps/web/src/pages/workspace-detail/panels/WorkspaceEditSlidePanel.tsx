import SlidePanel from '../../../components/common/SlidePanel';
import type { WorkspaceMember } from '../../../types';

export interface WorkspaceEditForm {
  name: string;
  description: string;
  visibility: string;
  owner_id: string;
}

export default function WorkspaceEditSlidePanel({
  open,
  form,
  workspaceName,
  members,
  submitting,
  showDelete,
  onClose,
  onFormChange,
  onSubmit,
  onShowDelete,
  onDelete,
}: {
  open: boolean;
  form: WorkspaceEditForm;
  workspaceName: string;
  members: WorkspaceMember[];
  submitting: boolean;
  showDelete: boolean;
  onClose: () => void;
  onFormChange: (updater: (f: WorkspaceEditForm) => WorkspaceEditForm) => void;
  onSubmit: () => void;
  onShowDelete: () => void;
  onDelete: () => void;
}) {
  return (
    <SlidePanel open={open} onClose={onClose} title="编辑基本信息">
      <div className="form-group">
        <label>项目名称 *</label>
        <input type="text" value={form.name} onChange={(e) => onFormChange((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="form-group">
        <label>描述</label>
        <textarea rows={3} value={form.description} onChange={(e) => onFormChange((f) => ({ ...f, description: e.target.value }))} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>可见性</label>
          <select value={form.visibility} onChange={(e) => onFormChange((f) => ({ ...f, visibility: e.target.value }))}>
            <option value="PRIVATE">私有</option>
            <option value="DEPARTMENT">部门可见</option>
            <option value="PUBLIC">公开</option>
          </select>
        </div>
        <div className="form-group">
          <label>项目负责人</label>
          <select value={form.owner_id} onChange={(e) => onFormChange((f) => ({ ...f, owner_id: e.target.value }))}>
            <option value="">未指定</option>
            {members.filter((m: any) => m.user_id).map((m: any) => (
              <option key={m.user_id} value={m.user_id}>{m.user_name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={onSubmit} disabled={!form.name.trim() || submitting}>
          {submitting ? '保存中...' : '保存'}
        </button>
      </div>

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        {!showDelete ? (
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--red-500)' }}
            onClick={onShowDelete}
          >删除项目</button>
        ) : (
          <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-100)', borderRadius: 'var(--radius)', padding: '12px 14px', fontSize: '0.78rem', color: 'var(--red-600)' }}>
            <div style={{ marginBottom: 8 }}>确定删除项目「{workspaceName}」？此操作会删除所有任务和数据，不可撤销。</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-xs" onClick={() => onShowDelete()}>取消</button>
              <button
                className="btn btn-xs"
                style={{ background: 'var(--red-500)', color: '#fff', border: 'none' }}
                onClick={onDelete}
              >
                {submitting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        )}
      </div>
    </SlidePanel>
  );
}
