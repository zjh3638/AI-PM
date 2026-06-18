import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Form, Input, message } from 'antd';
import { useProjectGroupStore } from '../../stores/projectGroupStore';
import { useAuthStore } from '../../stores/authStore';

export default function ProjectGroupListPage() {
  const navigate = useNavigate();
  const { groups, loading, fetchList, create } = useProjectGroupStore();
  const user = useAuthStore((s) => s.user);
  const canCreate = user?.system_role === 'SUPER_ADMIN' || user?.system_role === 'ADMIN';
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { fetchList(); }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const g = await create(values);
      setModalOpen(false);
      form.resetFields();
      message.success('项目群创建成功');
      navigate(`/project-groups/${g.id}`);
    } catch {
      // validation error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="stream-header">
        <h2>项目群</h2>
        <div className="actions">
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
              + 新建项目群
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><div className="empty-icon">⏳</div><div>加载中...</div></div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗂️</div>
          <div>暂无项目群</div>
          {canCreate && (
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setModalOpen(true)}>
              创建第一个项目群
            </button>
          )}
        </div>
      ) : (
        <div className="stream-grid">
          {groups.map((g) => (
            <div key={g.id} className="ws-card" onClick={() => navigate(`/project-groups/${g.id}`)}>
              <div className="ws-head">
                <span className="ws-name">{g.name}</span>
                <span className="ws-tier company">项目群</span>
              </div>
              <div className="ws-summary">
                <div>{g.description || '暂无描述'}</div>
                <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {g.creator_name ? <span>创建者: {g.creator_name}</span> : null}
                  <span> · 包含 {g.workspace_count} 个项目</span>
                </div>
              </div>
              <div className="ws-stats">
                <span>子项目 <span className="sv">{g.workspace_count}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        title="创建项目群"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={submitting}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="项目群名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：Q2 重点产品线" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="项目群描述（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
