import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRiskStore } from '../../stores/riskStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useMilestoneStore } from '../../stores/milestoneStore';
import SlidePanel from '../../components/common/SlidePanel';
import {
  RISK_TYPE_LABELS,
  RISK_SEVERITY_LABELS,
  RISK_STATUS_LABELS,
} from '../../types';
import type { Risk, RiskStatus } from '../../types';

const STATUS_OPTIONS: { label: string; value: RiskStatus | '' }[] = [
  { label: '全部状态', value: '' },
  { label: '已识别', value: 'IDENTIFIED' },
  { label: '应对中', value: 'MITIGATING' },
  { label: '已关闭', value: 'CLOSED' },
];

const TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: '全部类型', value: '' },
  ...Object.entries(RISK_TYPE_LABELS).map(([k, v]) => ({ label: v, value: k })),
];

const SEVERITY_COLORS: Record<string, string> = {
  LOW: 'var(--green-600)',
  MEDIUM: 'var(--amber-600)',
  HIGH: 'var(--red-600)',
};

const STATUS_COLORS: Record<string, string> = {
  IDENTIFIED: 'var(--amber-50)',
  MITIGATING: 'var(--blue-50)',
  CLOSED: 'var(--green-50)',
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  IDENTIFIED: 'var(--amber-700)',
  MITIGATING: 'var(--blue-700)',
  CLOSED: 'var(--green-700)',
};

const STATUS_BORDER_COLORS: Record<string, string> = {
  IDENTIFIED: 'var(--amber-200)',
  MITIGATING: 'var(--blue-200)',
  CLOSED: 'var(--green-200)',
};

export default function RiskPanel() {
  const { id: wsId } = useParams<{ id: string }>();
  const { risks, loading, filter, setFilter, fetchList, create, update, startMitigation, close } = useRiskStore();
  const { members, fetchMembers } = useWorkspaceStore();
  const { milestones, fetchList: fetchMilestones } = useMilestoneStore();

  const [slideOpen, setSlideOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    risk_type: 'OTHER',
    probability: 'MEDIUM',
    impact: 'MEDIUM',
    milestone_id: '',
    mitigation: '',
    owner_id: '',
  });

  useEffect(() => {
    if (wsId) {
      fetchList(wsId);
      fetchMembers(wsId);
      fetchMilestones(wsId);
    }
  }, [wsId]);

  useEffect(() => {
    if (wsId) fetchList(wsId);
  }, [filter]);

  const openCreate = () => {
    setEditingRisk(null);
    setForm({ title: '', description: '', risk_type: 'OTHER', probability: 'MEDIUM', impact: 'MEDIUM', milestone_id: '', mitigation: '', owner_id: '' });
    setSlideOpen(true);
  };

  const openEdit = (r: Risk) => {
    if (r.status === 'CLOSED') return;
    setEditingRisk(r);
    setForm({
      title: r.title,
      description: r.description || '',
      risk_type: r.risk_type,
      probability: r.probability,
      impact: r.impact,
      milestone_id: r.milestone_id || '',
      mitigation: r.mitigation || '',
      owner_id: r.owner_id || '',
    });
    setSlideOpen(true);
  };

  const handleSave = async () => {
    if (!wsId || !form.title.trim()) return;
    if (editingRisk) {
      await update(wsId, editingRisk.id, form);
    } else {
      await create(wsId, form);
    }
    setSlideOpen(false);
  };

  const handleStartMitigation = async (riskId: string) => {
    if (!wsId) return;
    await startMitigation(wsId, riskId);
  };

  const handleCloseRisk = async (riskId: string) => {
    if (!wsId || !confirm('确定关闭此风险吗？')) return;
    await close(wsId, riskId);
  };

  const severityTag = (level: string) => (
    <span style={{ color: SEVERITY_COLORS[level] || 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem' }}>
      {RISK_SEVERITY_LABELS[level] || level}
    </span>
  );

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Filter Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={filter.status || ''}
            onChange={(e) => setFilter({ status: (e.target.value as RiskStatus) || undefined })}
            style={filterSelectStyle}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={filter.risk_type || ''}
            onChange={(e) => setFilter({ risk_type: e.target.value as any || undefined })}
            style={filterSelectStyle}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={filter.milestone_id || ''}
            onChange={(e) => setFilter({ milestone_id: e.target.value || undefined })}
            style={filterSelectStyle}
          >
            <option value="">全部里程碑</option>
            {milestones.map((m: any) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ 登记风险</button>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
            <th style={thStyle}>标题</th>
            <th style={thStyle}>类型</th>
            <th style={thStyle}>可能性</th>
            <th style={thStyle}>影响</th>
            <th style={thStyle}>状态</th>
            <th style={thStyle}>里程碑</th>
            <th style={thStyle}>负责人</th>
            <th style={{ ...thStyle, width: 150 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} style={tdStyle}>加载中...</td></tr>
          ) : risks.length === 0 ? (
            <tr><td colSpan={8} style={{ ...tdStyle, color: 'var(--text-muted)' }}>暂无风险记录，点击「+ 登记风险」开始</td></tr>
          ) : (
            risks.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)', opacity: r.status === 'CLOSED' ? 0.55 : 1 }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 500 }}>{r.title}</div>
                  {r.description && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{r.description.slice(0, 60)}{r.description.length > 60 ? '...' : ''}</div>}
                </td>
                <td style={tdStyle}>{RISK_TYPE_LABELS[r.risk_type] || r.risk_type}</td>
                <td style={tdStyle}>{severityTag(r.probability)}</td>
                <td style={tdStyle}>{severityTag(r.impact)}</td>
                <td style={tdStyle}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    background: STATUS_COLORS[r.status] || 'var(--bg-raised)',
                    color: STATUS_TEXT_COLORS[r.status] || 'var(--text-primary)',
                    border: `1px solid ${STATUS_BORDER_COLORS[r.status] || 'var(--border-light)'}`,
                  }}>
                    {RISK_STATUS_LABELS[r.status] || r.status}
                  </span>
                </td>
                <td style={tdStyle}>{r.milestone_name || '-'}</td>
                <td style={tdStyle}>{r.owner_name || '-'}</td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {r.status !== 'CLOSED' && (
                      <>
                        <button className="btn btn-ghost btn-xs" onClick={() => openEdit(r)}>编辑</button>
                        {r.status === 'IDENTIFIED' && (
                          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--blue-600)' }} onClick={() => handleStartMitigation(r.id)}>应对</button>
                        )}
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--green-600)' }} onClick={() => handleCloseRisk(r.id)}>关闭</button>
                      </>
                    )}
                    {r.status === 'CLOSED' && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{r.closed_at?.slice(0, 10)}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* SlidePanel form */}
      <SlidePanel
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingRisk ? '编辑风险' : '登记风险'}
      >
        <div className="form-group">
          <label>标题 *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="风险标题"
          />
        </div>

        <div className="form-group">
          <label>描述</label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="风险描述"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>风险类型</label>
            <select value={form.risk_type} onChange={(e) => setForm({ ...form, risk_type: e.target.value })}>
              {Object.entries(RISK_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>关联里程碑</label>
            <select value={form.milestone_id} onChange={(e) => setForm({ ...form, milestone_id: e.target.value })}>
              <option value="">不关联</option>
              {milestones.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>可能性</label>
            <select value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })}>
              {Object.entries(RISK_SEVERITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>影响程度</label>
            <select value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })}>
              {Object.entries(RISK_SEVERITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>应对措施</label>
          <textarea
            rows={2}
            value={form.mitigation}
            onChange={(e) => setForm({ ...form, mitigation: e.target.value })}
            placeholder="应对措施"
          />
        </div>

        <div className="form-group">
          <label>负责人</label>
          <select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
            <option value="">不指定</option>
            {members.filter((m: any) => !m.ai_agent_id).map((m: any) => (
              <option key={m.user_id} value={m.user_id}>{m.user_name}</option>
            ))}
          </select>
        </div>

        <div className="form-actions">
          <button className="btn btn-ghost" onClick={() => setSlideOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!form.title.trim()}>
            {editingRisk ? '保存' : '创建'}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontWeight: 600,
  fontSize: '0.7rem',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'middle',
};

const filterSelectStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '0.78rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
  outline: 'none',
};
