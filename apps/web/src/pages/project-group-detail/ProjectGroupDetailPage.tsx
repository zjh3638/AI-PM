import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Modal, Form, Input, Select, message } from 'antd';
import { useProjectGroupStore } from '../../stores/projectGroupStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useAuthStore } from '../../stores/authStore';
import OverviewTab from './tabs/OverviewTab';
import TasksTab from './tabs/TasksTab';
import MilestonesTab from './tabs/MilestonesTab';
import MembersTab from './tabs/MembersTab';
import ActivityTab from './tabs/ActivityTab';
import SettingsTab from './tabs/SettingsTab';

type TabKey = 'overview' | 'tasks' | 'milestones' | 'members' | 'activity' | 'settings';

const TAB_LABELS: Record<TabKey, string> = {
  overview: '概览', tasks: '任务', milestones: '里程碑',
  members: '成员', activity: '动态', settings: '设置',
};

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

  const handleDelete = () => {
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

  const handleRemoveWs = async (workspaceId: string) => {
    await removeWorkspace(current.id, workspaceId);
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
        {(Object.keys(TAB_LABELS) as TabKey[]).map((k) => (
          <button
            key={k}
            className={`btn ${tab === k ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: '0', borderBottom: tab === k ? '2px solid var(--blue-500)' : '2px solid transparent' }}
            onClick={() => setTab(k)}
            disabled={k === 'settings' && !canManage}
          >
            {TAB_LABELS[k]}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab stats={stats} />}
      {tab === 'tasks' && <TasksTab tasks={tasks} />}
      {tab === 'milestones' && <MilestonesTab milestones={milestones} />}
      {tab === 'members' && <MembersTab members={members} />}
      {tab === 'activity' && <ActivityTab activity={activity} />}
      {tab === 'settings' && (
        <SettingsTab
          group={current}
          canManage={!!canManage}
          onEdit={() => setEditModalOpen(true)}
          onDelete={handleDelete}
          onAddWorkspace={() => setAddWsModalOpen(true)}
          onRemoveWorkspace={handleRemoveWs}
        />
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
