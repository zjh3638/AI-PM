import { useEffect, useState } from 'react';
import { Tabs, Typography, Descriptions, Tag, Button, Space, Spin, message, Modal, Select, List, Avatar, Popconfirm } from 'antd';
import { PlusOutlined, UserOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useAuthStore } from '../../stores/authStore';
import type { WorkspaceMember } from '../../types';
import PlaceholderPage from '../placeholder/PlaceholderPage';
import TasksTab from './tabs/TasksTab';
import KanbanBoard from '../../components/task/KanbanBoard';
import KnowledgeTab from './tabs/KnowledgeTab';

const { Title } = Typography;

const typeLabels: Record<string, string> = { PROJECT: '项目', OPERATION: '运维', OTHER: '其他' };
const roleLabels: Record<string, string> = { OWNER: '所有者', MANAGER: '管理员', MEMBER: '成员', VIEWER: '观察者', AI_AGENT: 'AI Agent' };
const roleColors: Record<string, string> = { OWNER: 'red', MANAGER: 'blue', MEMBER: 'green', VIEWER: 'default', AI_AGENT: 'purple' };

export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { current, members, loading, fetchDetail, fetchMembers, update, archive, addMember, updateMember, removeMember } = useWorkspaceStore();
  const user = useAuthStore((s) => s.user);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('MEMBER');
  const [editingMember, setEditingMember] = useState<WorkspaceMember | null>(null);
  const [editRole, setEditRole] = useState('');

  useEffect(() => {
    if (id) {
      fetchDetail(id);
      fetchMembers(id);
    }
  }, [id]);

  const handleAddMember = async () => {
    if (!selectedUserId || !id) return;
    await addMember(id, selectedUserId, selectedRole);
    setAddModalOpen(false);
    setSelectedUserId('');
    setSelectedRole('MEMBER');
    message.success('成员已添加');
  };

  const handleUpdateRole = async () => {
    if (!id || !editingMember) return;
    await updateMember(id, editingMember.id, editRole);
    setEditingMember(null);
    message.success('角色已更新');
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!id) return;
    await removeMember(id, memberId);
    message.success('成员已移除');
  };

  const handleArchive = async () => {
    if (!id) return;
    await archive(id);
    message.success('工作空间已归档');
    navigate('/workspaces');
  };

  const currentUserMember = members.find((m) => m.user_id === user?.id);
  const canManage = currentUserMember?.role === 'OWNER' || currentUserMember?.role === 'MANAGER';
  const isOwner = currentUserMember?.role === 'OWNER';

  if (loading || !current) {
    return <Spin spinning style={{ display: 'block', marginTop: 100 }} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{current.name}</Title>
        <Space>
          <Tag color={typeLabels[current.type] === '项目' ? 'blue' : 'green'}>{typeLabels[current.type]}</Tag>
          {isOwner && current.status === 'ACTIVE' && (
            <Popconfirm title="确定归档此工作空间？归档后不可编辑。" onConfirm={handleArchive}>
              <Button danger size="small">归档</Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: 'overview',
            label: '概览',
            children: (
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="标识">{current.key}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={current.status === 'ACTIVE' ? 'green' : 'orange'}>
                    {current.status === 'ACTIVE' ? '活跃' : '已归档'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="可见性">{current.visibility}</Descriptions.Item>
                <Descriptions.Item label="成员数">{current.member_count} 人</Descriptions.Item>
                <Descriptions.Item label="创建时间">{current.created_at}</Descriptions.Item>
                <Descriptions.Item label="更新时间">{current.updated_at}</Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>
                  {current.description || '暂无描述'}
                </Descriptions.Item>
              </Descriptions>
            ),
          },
          { key: 'tasks', label: '任务列表', children: <TasksTab /> },
          { key: 'kanban', label: '看板', children: <KanbanBoard /> },
          { key: 'knowledge', label: '知识', children: <KnowledgeTab /> },
          { key: 'analysis', label: '分析', children: <PlaceholderPage title="分析" /> },
          { key: 'automation', label: '自动化', children: <PlaceholderPage title="自动化" /> },
          {
            key: 'members',
            label: `成员 (${members.length})`,
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <span></span>
                  {canManage && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
                      添加成员
                    </Button>
                  )}
                </div>
                <List
                  dataSource={members}
                  renderItem={(m: WorkspaceMember) => (
                    <List.Item
                      actions={
                        canManage && m.role !== 'OWNER'
                          ? [
                              <Button
                                key="edit"
                                type="link"
                                icon={<EditOutlined />}
                                onClick={() => { setEditingMember(m); setEditRole(m.role); }}
                              />,
                              <Popconfirm
                                key="remove"
                                title="确定移除该成员？"
                                onConfirm={() => handleRemoveMember(m.id)}
                              >
                                <Button type="link" danger icon={<DeleteOutlined />} />
                              </Popconfirm>,
                            ]
                          : []
                      }
                    >
                      <List.Item.Meta
                        avatar={<Avatar icon={<UserOutlined />} src={m.user_avatar} />}
                        title={
                          <Space>
                            {m.user_name || m.ai_agent_id || m.user_id}
                            <Tag color={roleColors[m.role]}>{roleLabels[m.role]}</Tag>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              </div>
            ),
          },
          { key: 'ai_agent', label: 'AI Agent', children: <PlaceholderPage title="AI Agent" /> },
        ]}
      />

      <Modal
        title="添加成员"
        open={addModalOpen}
        onOk={handleAddMember}
        onCancel={() => setAddModalOpen(false)}
        okText="添加"
        cancelText="取消"
        okButtonProps={{ disabled: !selectedUserId }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <span style={{ marginRight: 8 }}>用户 ID:</span>
            <Select
              showSearch
              style={{ width: 280 }}
              placeholder="输入用户 ID 搜索"
              value={selectedUserId || undefined}
              onChange={(v) => setSelectedUserId(v)}
            />
          </div>
          <div>
            <span style={{ marginRight: 8 }}>角色:</span>
            <Select
              style={{ width: 200 }}
              value={selectedRole}
              onChange={(v) => setSelectedRole(v)}
              options={[
                { label: '管理员', value: 'MANAGER' },
                { label: '成员', value: 'MEMBER' },
                { label: '观察者', value: 'VIEWER' },
              ]}
            />
          </div>
        </Space>
      </Modal>

      <Modal
        title="修改成员角色"
        open={!!editingMember}
        onOk={handleUpdateRole}
        onCancel={() => setEditingMember(null)}
        okText="保存"
        cancelText="取消"
      >
        <Select
          style={{ width: 200 }}
          value={editRole}
          onChange={(v) => setEditRole(v)}
          options={[
            { label: '管理员', value: 'MANAGER' },
            { label: '成员', value: 'MEMBER' },
            { label: '观察者', value: 'VIEWER' },
          ]}
        />
      </Modal>
    </div>
  );
}
