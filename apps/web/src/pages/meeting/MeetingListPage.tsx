import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TreeSelect } from 'antd';
import api from '../../api/client';
import { meetingApi, type OrgProjectNode } from '../../api/meeting';

interface MeetingItem {
  id: string;
  title: string;
  dimension: string;
  meeting_type: string;
  status: string;
  created_at: string;
}

// Build antd TreeSelect data from the org-project tree.
// Department nodes are checkable containers; project leaves carry the workspace id.
function buildTreeData(nodes: OrgProjectNode[]): any[] {
  return nodes.map(n => {
    const children: any[] = [
      ...buildTreeData(n.children || []),
      ...(n.projects || []).map(p => ({
        title: p.owner_name ? `${p.name}（${p.owner_name}）` : p.name,
        value: p.id,
        key: p.id,
        isLeaf: true,
      })),
    ];
    return {
      title: `${n.name}${n.projects?.length || n.children?.length ? '' : '（空）'}`,
      value: `dept:${n.id}`,
      key: `dept:${n.id}`,
      selectable: false,
      children,
    };
  });
}

export default function MeetingListPage() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [orgTree, setOrgTree] = useState<OrgProjectNode[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
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

    // Load org-project tree for CUSTOM multi-select
    meetingApi.getOrgProjects().then(setOrgTree).catch(() => {});

    // Load meetings from API
    meetingApi.list()
      .then(setMeetings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Options for the currently selected dimension
  const dimensionOptions = form.dimension === 'PROJECT' ? workspaces : groups;
  const treeData = buildTreeData(orgTree);

  const handleDimensionChange = (dimension: string) => {
    // Reset the selected id when switching dimension to avoid a stale value
    setForm(f => ({ ...f, dimension, dimension_id: '' }));
    setSelectedProjects([]);
  };

  // TreeSelect returns both dept keys (dept:xxx) and project ids; keep only project ids.
  const handleTreeChange = (values: string[]) => {
    setSelectedProjects(values.filter(v => !v.startsWith('dept:')));
  };

  const isCustom = form.dimension === 'CUSTOM';
  const canCreate = !!form.title && (isCustom ? selectedProjects.length > 0 : !!form.dimension_id);

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const payload: any = isCustom
        ? { title: form.title, dimension: 'CUSTOM', meeting_type: form.meeting_type, workspace_ids: selectedProjects }
        : { title: form.title, dimension: form.dimension, dimension_id: form.dimension_id, meeting_type: form.meeting_type };
      const res: any = await api.post('/meetings', payload);
      navigate(`/meetings/${res.data.id}`);
    } catch {
      setCreating(false);
    }
  };

  const typeLabel = (t: string) => t === 'WEEKLY' ? '周会' : t === 'STANDUP' ? '站会' : '临时会议';
  const dimLabel = (d: string) => d === 'PROJECT' ? '项目' : d === 'CUSTOM' ? '自选项目' : '项目群';

  const handleDelete = async (e: React.MouseEvent, m: MeetingItem) => {
    e.stopPropagation();
    if (!window.confirm(`确定删除会议「${m.title}」吗？此操作不可恢复。`)) return;
    try {
      await meetingApi.remove(m.id);
      setMeetings(prev => prev.filter(x => x.id !== m.id));
    } catch {
      /* 错误已由 api 拦截器统一提示 */
    }
  };

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
                <option value="CUSTOM">自选项目（按组织架构多选）</option>
              </select>
            </div>
            {!isCustom && (
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
            )}
            <div className="field">
              <label>会议类型</label>
              <select value={form.meeting_type} onChange={e => setForm({ ...form, meeting_type: e.target.value })}>
                <option value="WEEKLY">周会</option>
                <option value="STANDUP">站会</option>
                <option value="ADHOC">临时会议</option>
              </select>
            </div>
          </div>
          {isCustom && (
            <div className="field">
              <label>选择项目（可勾选部门快速全选其下所有项目）</label>
              <TreeSelect
                treeData={treeData}
                value={selectedProjects}
                onChange={handleTreeChange as any}
                treeCheckable
                showCheckedStrategy={TreeSelect.SHOW_CHILD}
                placeholder="按组织架构勾选项目，勾选部门含其所有子部门项目"
                showSearch
                treeNodeFilterProp="title"
                maxTagCount={8}
                style={{ width: '100%' }}
                popupMatchSelectWidth={false}
              />
              {selectedProjects.length > 0 && (
                <span className="field-hint">已选 {selectedProjects.length} 个项目</span>
              )}
            </div>
          )}
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !canCreate}>
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
              <button
                className="ml-card-del"
                title="删除会议"
                onClick={(e) => handleDelete(e, m)}
              >✕</button>
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
