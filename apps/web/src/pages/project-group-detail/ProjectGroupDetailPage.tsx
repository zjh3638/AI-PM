import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Modal, Form, Input, Select, message, Tag } from 'antd';
import { useProjectGroupStore } from '../../stores/projectGroupStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useAuthStore } from '../../stores/authStore';

type TabKey = 'overview' | 'tasks' | 'milestones' | 'members' | 'activity' | 'settings';

export default function ProjectGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const {
    current, stats, members, milestones, activity, tasks,
    fetchDetail, fetchStats, fetchMembers, fetchMilestones, fetchActivity, fetchTasks,
    update, remove, addWorkspace, removeWorkspace,
  } = useProjectGroupStore();
  const { workspaces, fetchList: fetchWsList } = useWorkspaceStore();

  const [tab, setTab] = useState<TabKey>('overview');
  const [addWsModalOpen, setAddWsModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [addWsForm] = Form.useForm();

  const canManage = user?.system_role === 'SUPER_ADMIN' || (current && current.creator_id === user?.id);

  useEffect(() => {
    if (!id) return;
    fetchDetail(id);
    fetchStats(id);
    fetchMembers(id);
    fetchMilestones(id);
    fetchActivity(id);
    fetchTasks(id);
  }, [id]);

  useEffect(() => {
    if (tab === 'settings') fetchWsList({ page_size: 100 });
  }, [tab]);

  if (!current) return <div className="empty-state"><div>加载中...</div></div>;

  const tabLabels: Record<TabKey, string> = {
    overview: '概览', tasks: '任务', milestones: '里程碑',
    members: '成员', activity: '动态', settings: '设置',
  };

  const handleDelete = async () => {
    Modal.confirm({
      title: '确认删除项目群',
      content: '删除后不可恢复，子项目不受影响。',
      okText: '删除', okType: 'danger', cancelText: '取消',
      onOk: async () => {
        await remove(current.id);
        message.success('已删除');
        navigate('/workspaces');
      },
    });
  };

  const handleEdit = async () => {
    const values = await editForm.validateFields();
    await update(current.id, values);
    setEditModalOpen(false);
    message.success('已更新');
  };

  const handleAddWs = async () => {
    const values = await addWsForm.validateFields();
    await addWorkspace(current.id, values.workspace_id);
    await fetchStats(current.id);
    await fetchMembers(current.id);
    setAddWsModalOpen(false);
    addWsForm.resetFields();
    message.success('已添加');
  };

  return (
    <div>
      <div className="stream-header">
        <div>
          <h2>{current.name}</h2>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {current.description || '暂无描述'}
            {current.creator_name && <span> · 创建者: {current.creator_name}</span>}
            <span> · {current.workspace_count} 个子项目</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-light)', marginBottom: 18 }}>
        {(Object.keys(tabLabels) as TabKey[]).map((k) => (
          <button
            key={k}
            className={`btn ${tab === k ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: '0', borderBottom: tab === k ? '2px solid var(--blue-500)' : '2px solid transparent' }}
            onClick={() => setTab(k)}
            disabled={k === 'settings' && !canManage}
          >
            {tabLabels[k]}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="stream-grid">
          {stats.map((s) => (
            <div key={s.workspace_id} className="ws-card"
                 onClick={() => navigate(`/workspaces/${s.workspace_id}`)}>
              <div className="ws-head">
                <span className="ws-name">{s.workspace_name}</span>
                <Tag color={s.completion >= 80 ? 'green' : s.completion >= 50 ? 'blue' : 'orange'}>
                  {s.completion}%
                </Tag>
              </div>
              <div className="ws-stats">
                <span>任务 <span className="sv">{s.total}</span></span>
                <span>完成 <span className="sv">{s.done}</span></span>
                <span style={{ color: s.overdue > 0 ? 'var(--red-500)' : undefined }}>
                  逾期 <span className="sv">{s.overdue}</span>
                </span>
              </div>
              <div className="health-bar" style={{ marginTop: 8 }}>
                <span className="fill good" style={{ width: `${s.completion}%` }} />
              </div>
            </div>
          ))}
          {stats.length === 0 && <div className="empty-state">暂无子项目，请到「设置」添加</div>}
        </div>
      )}

      {/* Tasks */}
      {tab === 'tasks' && (
        <div>
          <div style={{ marginBottom: 12, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            共 {tasks.length} 个任务
          </div>
          {tasks.length === 0 ? <div className="empty-state">暂无任务</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tasks.map((t: any) => (
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
          )}
        </div>
      )}

      {/* Milestones */}
      {tab === 'milestones' && (
        <div>
          {milestones.length === 0 ? <div className="empty-state">暂无里程碑或迭代</div> : (
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
          )}
        </div>
      )}

      {/* Members */}
      {tab === 'members' && (
        <div>
          {members.length === 0 ? <div className="empty-state">暂无成员</div> : (
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
          )}
        </div>
      )}

      {/* Activity */}
      {tab === 'activity' && (
        <div>
          {activity.length === 0 ? <div className="empty-state">暂无动态</div> : (
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
          )}
        </div>
      )}

      {/* Settings */}
      {tab === 'settings' && canManage && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => setEditModalOpen(true)}>编辑项目群</button>
            <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={handleDelete}>删除项目群</button>
          </div>

          <h3 style={{ marginBottom: 12 }}>子项目管理</h3>
          <div style={{ marginBottom: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setAddWsModalOpen(true)}>+ 添加项目</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {current.workspaces.map((w) => (
              <div key={w.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
              }}>
                <span style={{ flex: 1, fontWeight: 600 }}>{w.name}</span>
                {w.key && <Tag>{w.key}</Tag>}
                <button className="btn btn-ghost btn-sm" onClick={() => removeWorkspace(current.id, w.id)}>
                  移除
                </button>
              </div>
            ))}
            {current.workspaces.length === 0 && <div className="empty-state">尚未添加子项目</div>}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <Modal title="编辑项目群" open={editModalOpen} onOk={handleEdit}
             onCancel={() => setEditModalOpen(false)} okText="保存" cancelText="取消">
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}
              initialValues={{ name: current.name, description: current.description }}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add Workspace Modal */}
      <Modal title="添加项目到群" open={addWsModalOpen} onOk={handleAddWs}
             onCancel={() => { setAddWsModalOpen(false); addWsForm.resetFields(); }}
             okText="添加" cancelText="取消">
        <Form form={addWsForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="workspace_id" label="选择项目" rules={[{ required: true }]}>
            <Select
              placeholder="选择要加入群的项目"
              showSearch
              filterOption={(input, option) => (option?.label as string || '').includes(input)}
              options={workspaces
                .filter((w) => !current.workspaces.find((cw) => cw.id === w.id))
                .map((w) => ({ label: w.name, value: w.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
