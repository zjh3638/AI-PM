import SlidePanel from '../../../components/common/SlidePanel';
import { MILESTONE_PHASE_LABELS } from '../../../types';
import type { Milestone, WorkspaceMember } from '../../../types';

export interface MilestoneEditForm {
  id: string;
  name: string;
  description: string;
  plan: string;
  owner_id: string;
  phase: string;
  start_date: string;
  end_date: string;
  depends_on_id: string | null;
}

export default function MilestoneEditSlidePanel({
  open,
  form,
  members,
  milestones,
  onClose,
  onFormChange,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  form: MilestoneEditForm;
  members: WorkspaceMember[];
  milestones: Milestone[];
  onClose: () => void;
  onFormChange: (updater: (f: MilestoneEditForm) => MilestoneEditForm) => void;
  onSubmit: () => void;
  onDelete: () => void;
}) {
  return (
    <SlidePanel open={open} onClose={onClose} title="编辑里程碑">
      <div className="form-group">
        <label>名称</label>
        <input type="text" value={form.name} onChange={(e) => onFormChange((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="form-group">
        <label>描述</label>
        <input type="text" placeholder="简要描述里程碑目标" value={form.description} onChange={(e) => onFormChange((f) => ({ ...f, description: e.target.value }))} />
      </div>
      <div className="form-group">
        <label>执行计划</label>
        <textarea rows={4} placeholder="详细的执行计划、步骤、注意事项..." style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', fontFamily: 'inherit', background: 'var(--bg-surface)', color: 'var(--text-primary)', resize: 'vertical' }} value={form.plan} onChange={(e) => onFormChange((f) => ({ ...f, plan: e.target.value }))} />
      </div>
      <div className="form-group">
        <label>负责人</label>
        <select value={form.owner_id} onChange={(e) => onFormChange((f) => ({ ...f, owner_id: e.target.value }))}>
          <option value="">未指定</option>
          {members.map((m) => (
            <option key={m.id} value={m.user_id || m.id}>{m.user_name || m.user_id}</option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>开始日期</label>
          <input type="date" value={form.start_date} onChange={(e) => onFormChange((f) => ({ ...f, start_date: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>结束日期</label>
          <input type="date" value={form.end_date} onChange={(e) => onFormChange((f) => ({ ...f, end_date: e.target.value }))} />
        </div>
      </div>
      <div className="form-group">
        <label>阶段</label>
        <select value={form.phase} onChange={(e) => onFormChange((f) => ({ ...f, phase: e.target.value }))}>
          {Object.entries(MILESTONE_PHASE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>依赖里程碑</label>
        <select value={form.depends_on_id || ''} onChange={(e) => onFormChange((f) => ({ ...f, depends_on_id: e.target.value || null }))}>
          <option value="">无依赖</option>
          {milestones.filter(m => m.id !== form.id).map((ms) => (
            <option key={ms.id} value={ms.id}>{ms.name} ({MILESTONE_PHASE_LABELS[ms.phase]})</option>
          ))}
        </select>
      </div>
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={onSubmit}>保存</button>
      </div>
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-500)' }} onClick={onDelete}>删除里程碑</button>
      </div>
    </SlidePanel>
  );
}
