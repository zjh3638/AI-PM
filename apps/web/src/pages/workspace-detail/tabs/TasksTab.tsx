import { useEffect, useState } from 'react';
import { Table, Tag, Button, Select, Input, Space, Modal, Form, message, Popconfirm } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { useTaskStore } from '../../../stores/taskStore';
import { usePermission } from '../../../hooks/usePermission';
import type { Task, TaskType, TaskStatus, TaskPriority } from '../../../types';

const typeColors: Record<string, string> = { EPIC: 'purple', STORY: 'blue', TASK: 'green', SUB_TASK: 'default', BUG: 'red', SPIKE: 'orange' };
const typeLabels: Record<string, string> = { EPIC: 'Epic', STORY: 'Story', TASK: '任务', SUB_TASK: '子任务', BUG: '缺陷', SPIKE: '调研' };
const priorityColors: Record<string, string> = { CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'blue', LOW: 'default' };
const statusLabels: Record<string, string> = { TODO: '待开始', IN_PROGRESS: '进行中', IN_REVIEW: '待Review', DONE: '已完成' };

export default function TasksTab() {
  const { id: wsId } = useParams<{ id: string }>();
  const { tasks, total, loading, fetchList, create, remove } = useTaskStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [filters, setFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    if (wsId) fetchList(wsId, { ...filters, page: 1, page_size: 50 });
  }, [wsId, filters]);

  const handleCreate = async () => {
    const values = await form.validateFields();
    if (!wsId) return;
    await create(wsId, values);
    setModalOpen(false);
    form.resetFields();
    message.success('任务已创建');
    fetchList(wsId, { ...filters, page: 1, page_size: 50 });
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: Task) => (
        <Space>
          <Tag color={typeColors[record.task_type]}>{typeLabels[record.task_type]}</Tag>
          {text}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => <Tag>{statusLabels[s] || s}</Tag>,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (p: string) => <Tag color={priorityColors[p]}>{p}</Tag>,
    },
    {
      title: '负责人',
      dataIndex: 'assignee_name',
      key: 'assignee',
      width: 100,
      render: (name: string | null) => name || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: Task) => (
        <Popconfirm title="确定删除此任务？" onConfirm={() => wsId && remove(wsId, record.id)}>
          <Button type="link" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Select
            placeholder="类型"
            style={{ width: 100 }}
            allowClear
            onChange={(v) => setFilters((f) => ({ ...f, task_type: v || '' }))}
            options={Object.entries(typeLabels).map(([k, v]) => ({ label: v, value: k }))}
          />
          <Select
            placeholder="状态"
            style={{ width: 100 }}
            allowClear
            onChange={(v) => setFilters((f) => ({ ...f, status: v || '' }))}
            options={Object.entries(statusLabels).map(([k, v]) => ({ label: v, value: k }))}
          />
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索任务"
            style={{ width: 200 }}
            allowClear
            onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value || '' }))}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          创建任务
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={tasks}
        loading={loading}
        size="small"
        pagination={{ total, pageSize: 50 }}
      />

      <Modal
        title="创建任务"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="任务标题" rules={[{ required: true }]}>
            <Input placeholder="任务标题" />
          </Form.Item>
          <Form.Item name="task_type" label="类型" initialValue="TASK">
            <Select options={Object.entries(typeLabels).map(([k, v]) => ({ label: v, value: k }))} />
          </Form.Item>
          <Form.Item name="priority" label="优先级" initialValue="MEDIUM">
            <Select options={[
              { label: '紧急', value: 'CRITICAL' },
              { label: '高', value: 'HIGH' },
              { label: '中', value: 'MEDIUM' },
              { label: '低', value: 'LOW' },
            ]} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
