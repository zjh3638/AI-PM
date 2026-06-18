import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Select, Row, Col, Modal, message } from 'antd';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import ProjectGroupListPage from '../project-group-list/ProjectGroupListPage';
import api from '../../api/client';

const typeLabels: Record<string, { label: string; cls: string }> = {
  PROJECT: { label: '研发项目', cls: 'company' },
  TOPIC: { label: '专题项目', cls: 'dept' },
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
  const [view, setView] = useState<'workspaces' | 'groups'>('workspaces');
  const [modalOpen, setModalOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterOwnerId, setFilterOwnerId] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  const flattenDepts = (items: any[], depth: number = 0): any[] => {
    const result: any[] = [];
    for (const d of items) {
      result.push({ id: d.id, label: '  '.repeat(depth) + d.name });
      if (d.children?.length) result.push(...flattenDepts(d.children, depth + 1));
    }
    return result;
  };
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchList({ keyword: keyword || undefined, type: filterType || undefined, owner_id: filterOwnerId || undefined, department_id: filterDepartmentId || undefined });
  }, [keyword, filterType, filterOwnerId, filterDepartmentId]);

  useEffect(() => {
    api.get('/users', { params: { page_size: 100 } }).then((r: any) => setUsers(r.data || []));
    api.get('/departments/tree').then((r: any) => setDepartments(r.data || []));
  }, []);

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
      {/* View Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border-light)' }}>
        <button
          className={`btn ${view === 'workspaces' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ borderRadius: '0', borderBottom: view === 'workspaces' ? '2px solid var(--blue-500)' : '2px solid transparent' }}
          onClick={() => setView('workspaces')}
        >
          我的项目
        </button>
        <button
          className={`btn ${view === 'groups' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ borderRadius: '0', borderBottom: view === 'groups' ? '2px solid var(--blue-500)' : '2px solid transparent' }}
          onClick={() => setView('groups')}
        >
          项目群
        </button>
      </div>

      {view === 'groups' && <ProjectGroupListPage />}
      {view === 'workspaces' && (
      <>
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
            { label: '专题项目', value: 'TOPIC' },
          ]}
        />
        <Select
          placeholder="团队筛选"
          value={filterDepartmentId || undefined}
          onChange={(v) => setFilterDepartmentId(v || '')}
          allowClear
          style={{ width: 140 }}
          options={flattenDepts(departments).map((d: any) => ({ label: d.label, value: d.id }))}
        />
        <Select
          placeholder="负责人筛选"
          value={filterOwnerId || undefined}
          onChange={(v) => setFilterOwnerId(v || '')}
          allowClear
          showSearch
          filterOption={(input, option) => (option?.label as string || '').includes(input)}
          style={{ width: 160 }}
          options={users.map((u: any) => ({ label: u.display_name, value: u.id }))}
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
            const tier = typeLabels[ws.type] || typeLabels.TOPIC;
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
                  <div>{ws.description || '暂无描述'}</div>
                  <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {ws.owner_name ? <span>负责人: {ws.owner_name}</span> : <span>未指定负责人</span>}
                    {ws.department_name && <span> · 团队: {ws.department_name}</span>}
                    <span> · {ws.member_count} 人</span>
                  </div>
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
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="工作空间描述（可选）" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="type" label="类型" initialValue="PROJECT">
                <Select
                  options={[
                    { label: '研发项目', value: 'PROJECT' },
                    { label: '专题项目', value: 'TOPIC' },
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
          <Form.Item name="owner_id" label="项目负责人">
            <Select
              placeholder="选择负责人（默认创建者）"
              allowClear
              showSearch
              filterOption={(input, option) => (option?.label as string || '').includes(input)}
              options={users.map((u: any) => ({ label: u.display_name, value: u.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      </>
      )}
    </div>
  );
}
