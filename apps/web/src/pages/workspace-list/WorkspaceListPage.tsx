import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Select, Row, Col, Modal, message } from 'antd';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const typeLabels: Record<string, { label: string; cls: string }> = {
  PROJECT: { label: '研发项目', cls: 'company' },
  OPERATION: { label: '专题项目', cls: 'dept' },
  OTHER: { label: '事务工作', cls: 'normal' },
};

// Mock health data — will come from backend later
function getHealthColor(idx: number): string {
  const colors = ['warn', 'good', 'good'];
  return colors[idx % colors.length];
}

function getHealthPct(idx: number): number {
  const pcts = [67, 85, 92];
  return pcts[idx % pcts.length];
}

export default function WorkspaceListPage() {
  const navigate = useNavigate();
  const { workspaces, total, loading, fetchList, create } = useWorkspaceStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [filterType, setFilterType] = useState('');
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchList({ keyword: keyword || undefined, type: filterType || undefined });
  }, [keyword, filterType]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const ws = await create(values);
      setModalOpen(false);
      form.resetFields();
      message.success('工作空间创建成功');
      navigate(`/workspaces/${ws.id}`);
    } catch {
      // validation error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="stream-header">
        <h2>工作空间</h2>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
            + 从模板创建
          </button>
          <button className="btn btn-ghost" onClick={() => setModalOpen(true)}>
            空白创建
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <Input
          placeholder="搜索工作空间..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
          style={{ width: 240 }}
        />
        <Select
          placeholder="类型筛选"
          value={filterType || undefined}
          onChange={(v) => setFilterType(v || '')}
          allowClear
          style={{ width: 120 }}
          options={[
            { label: '研发项目', value: 'PROJECT' },
            { label: '专题项目', value: 'OPERATION' },
            { label: '事务工作', value: 'OTHER' },
          ]}
        />
      </div>

      {/* Workspace Cards Grid */}
      {loading ? (
        <div className="empty-state">
          <div className="empty-icon">⏳</div>
          <div>加载中...</div>
        </div>
      ) : workspaces.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📂</div>
          <div>暂无工作空间</div>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setModalOpen(true)}>
            创建第一个工作空间
          </button>
        </div>
      ) : (
        <div className="stream-grid">
          {workspaces.map((ws, idx) => {
            const tier = typeLabels[ws.type] || typeLabels.OTHER;
            const healthColor = getHealthColor(idx);
            return (
              <div
                key={ws.id}
                className="ws-card"
                onClick={() => navigate(`/workspaces/${ws.id}`)}
              >
                <div className="ws-head">
                  <span className="ws-name">{ws.name}</span>
                  <span className={`ws-tier ${tier.cls}`}>{tier.label}</span>
                </div>
                <div className="ws-summary">
                  {ws.description || '暂无描述'}。成员 {ws.member_count} 人，标识 {ws.key}。
                </div>
                <div className="ws-stats">
                  <span>
                    任务 <span className="sv">—</span>
                  </span>
                  <span>
                    风险{' '}
                    <span className="sv" style={{ color: healthColor === 'warn' ? 'var(--amber-600)' : 'var(--green-600)' }}>
                      {healthColor === 'warn' ? '1' : '0'}
                    </span>
                  </span>
                  <span>
                    健康度
                    <span className="health-bar">
                      <span
                        className={`fill ${healthColor}`}
                        style={{ width: `${getHealthPct(idx)}%` }}
                      />
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        title="创建工作空间"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        confirmLoading={submitting}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="工作空间名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：官网重构项目" />
          </Form.Item>
          <Form.Item
            name="key"
            label="标识"
            rules={[
              { required: true, message: '请输入标识' },
              { pattern: /^[a-zA-Z0-9_-]+$/, message: '仅允许字母、数字、下划线和连字符' },
            ]}
          >
            <Input placeholder="例如：website-redesign" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="工作空间描述（可选）" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="type" label="类型" initialValue="PROJECT">
                <Select
                  options={[
                    { label: '项目', value: 'PROJECT' },
                    { label: '运维', value: 'OPERATION' },
                    { label: '其他', value: 'OTHER' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="visibility" label="可见性" initialValue="PRIVATE">
                <Select
                  options={[
                    { label: '私有', value: 'PRIVATE' },
                    { label: '部门可见', value: 'DEPARTMENT' },
                    { label: '公开', value: 'PUBLIC' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
