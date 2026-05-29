import { useEffect, useState } from 'react';
import { Card, Typography, Button, Input, Select, Row, Col, Space, Empty, Modal, Form, Tag, Spin, message, Dropdown } from 'antd';
import { PlusOutlined, SearchOutlined, AppstoreOutlined, EllipsisOutlined, UserOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const { Title, Text, Paragraph } = Typography;

const typeLabels: Record<string, string> = { PROJECT: '项目', OPERATION: '运维', OTHER: '其他' };
const typeColors: Record<string, string> = { PROJECT: 'blue', OPERATION: 'green', OTHER: 'default' };

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>工作空间</Title>
        <Space>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索工作空间"
            style={{ width: 240 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
          />
          <Select
            placeholder="类型筛选"
            style={{ width: 120 }}
            value={filterType || undefined}
            onChange={(v) => setFilterType(v || '')}
            allowClear
            options={[
              { label: '项目', value: 'PROJECT' },
              { label: '运维', value: 'OPERATION' },
              { label: '其他', value: 'OTHER' },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            创建工作空间
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        {workspaces.length === 0 ? (
          <Empty description="暂无工作空间，点击上方按钮创建第一个项目" />
        ) : (
          <Row gutter={[16, 16]}>
            {workspaces.map((ws) => (
              <Col key={ws.id} xs={24} sm={12} lg={8} xl={6}>
                <Card
                  hoverable
                  onClick={() => navigate(`/workspaces/${ws.id}`)}
                  actions={[
                    <FolderOpenOutlined key="open" onClick={(e) => { e.stopPropagation(); navigate(`/workspaces/${ws.id}`); }} />,
                  ]}
                >
                  <Card.Meta
                    avatar={<AppstoreOutlined style={{ fontSize: 24, color: '#1677ff' }} />}
                    title={
                      <Space>
                        <Text strong>{ws.name}</Text>
                        <Tag color={typeColors[ws.type]}>{typeLabels[ws.type]}</Tag>
                      </Space>
                    }
                    description={
                      <>
                        <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 8 }}>
                          {ws.description || '暂无描述'}
                        </Paragraph>
                        <Space size={12}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            <UserOutlined /> {ws.member_count} 人
                          </Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>{ws.key}</Text>
                        </Space>
                      </>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Spin>

      <Modal
        title="创建工作空间"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
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
