import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { meetingApi } from '../../api/meeting';

interface MeetingItem {
  id: string;
  title: string;
  dimension: string;
  meeting_type: string;
  status: string;
  created_at: string;
}

export default function MeetingListPage() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({ title: '', dimension: 'PROJECT', dimension_id: '', meeting_type: 'WEEKLY' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    // Load projects (workspaces) for the create form
    api.get('/workspaces', { params: { page_size: 100 } }).then((r: any) => {
      const items = r.data || [];
      setWorkspaces(items.map((w: any) => ({ id: w.id, name: w.name })));
    }).catch(() => {});

    // Load project groups for the create form
    api.get('/project-groups', { params: { page_size: 100 } }).then((r: any) => {
      const items = r.data || [];
      setGroups(items.map((g: any) => ({ id: g.id, name: g.name })));
    }).catch(() => {});

    // Load meetings from API
    meetingApi.list()
      .then(setMeetings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Options for the currently selected dimension
  const dimensionOptions = form.dimension === 'PROJECT' ? workspaces : groups;

  const handleDimensionChange = (dimension: string) => {
    // Reset the selected id when switching dimension to avoid a stale value
    setForm(f => ({ ...f, dimension, dimension_id: '' }));
  };

  const handleCreate = async () => {
    if (!form.title || !form.dimension_id) return;
    setCreating(true);
    try {
      const res: any = await api.post('/meetings', form);
      navigate(`/meetings/${res.data.id}`);
    } catch {
      setCreating(false);
    }
  };

  const typeLabel = (t: string) => t === 'WEEKLY' ? '周会' : t === 'STANDUP' ? '站会' : '临时会议';
  const dimLabel = (d: string) => d === 'PROJECT' ? '项目' : '项目群';

  return (
    <div className="meeting-list-page">
      <div className="ml-header">
        <div>
          <h2>📋 会议</h2>
          <p className="ml-desc">创建和查看会议，追踪项目进展和风险</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? '取消' : '+ 新建会议'}
        </button>
      </div>

      {showCreate && (
        <div className="ml-create-card">
          <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>新建会议</h3>
          <div className="field">
            <label>会议标题</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="例如：AI-PM 平台周会"
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>维度</label>
              <select value={form.dimension} onChange={e => handleDimensionChange(e.target.value)}>
                <option value="PROJECT">项目</option>
                <option value="PROJECT_GROUP">项目群</option>
              </select>
            </div>
            <div className="field">
              <label>{form.dimension === 'PROJECT' ? '选择项目' : '选择项目群'}</label>
              <select value={form.dimension_id} onChange={e => setForm({ ...form, dimension_id: e.target.value })}>
                <option value="">请选择</option>
                {dimensionOptions.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              {dimensionOptions.length === 0 && (
                <span className="field-hint">
                  {form.dimension === 'PROJECT' ? '暂无可选项目' : '暂无可选项目群'}
                </span>
              )}
            </div>
            <div className="field">
              <label>会议类型</label>
              <select value={form.meeting_type} onChange={e => setForm({ ...form, meeting_type: e.target.value })}>
                <option value="WEEKLY">周会</option>
                <option value="STANDUP">站会</option>
                <option value="ADHOC">临时会议</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !form.title || !form.dimension_id}>
            {creating ? '创建中...' : '开始会议'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty-state" style={{ minHeight: 200 }}>加载中...</div>
      ) : (
        <div className="ml-grid">
          {meetings.map(m => (
            <div key={m.id} className="ml-card" onClick={() => navigate(`/meetings/${m.id}`)}>
              <div className="ml-card-icon">📊</div>
              <div className="ml-card-title">{m.title}</div>
              <div className="ml-card-meta">
                {dimLabel(m.dimension)} · {typeLabel(m.meeting_type)} · {m.created_at}
              </div>
              <span className={`ml-badge ${m.status === 'ACTIVE' ? 'acc' : ''}`}>
                {m.status === 'ACTIVE' ? '进行中' : '已结束'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
