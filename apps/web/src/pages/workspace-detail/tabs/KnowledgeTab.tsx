import { useEffect, useState } from 'react';
import { Table, Button, Tag, Space, Modal, Form, Input, message, Popconfirm } from 'antd';
import { PlusOutlined, FileTextOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import api from '../../../api/client';

export default function KnowledgeTab() {
  const { id: wsId } = useParams<{ id: string }>();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<any>(null);
  const [form] = Form.useForm();

  const fetchDocs = async () => {
    if (!wsId) return;
    setLoading(true);
    const res = await api.get(`/workspaces/${wsId}/docs`);
    setDocs(res.data);
    setTotal(res.total);
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, [wsId]);

  const handleSave = async () => {
    const values = await form.validateFields();
    if (!wsId) return;
    if (editDoc) {
      await api.patch(`/workspaces/${wsId}/docs/${editDoc.id}`, values);
    } else {
      await api.post(`/workspaces/${wsId}/docs`, { ...values, doc_type: 'MARKDOWN' });
    }
    setModalOpen(false);
    setEditDoc(null);
    form.resetFields();
    message.success(editDoc ? '文档已更新' : '文档已创建');
    fetchDocs();
  };

  const handleDelete = async (docId: string) => {
    if (!wsId) return;
    await api.delete(`/workspaces/${wsId}/docs/${docId}`);
    message.success('文档已删除');
    fetchDocs();
  };

  const columns = [
    { title: '标题', dataIndex: 'title', key: 'title', render: (t: string) => <Space><FileTextOutlined />{t}</Space> },
    { title: '版本', dataIndex: 'version', key: 'version', width: 60, render: (v: number) => `v${v}` },
    { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', width: 180 },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, r: any) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} size="small" onClick={() => {
            setEditDoc(r);
            form.setFieldsValue(r);
            setModalOpen(true);
          }} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span></span>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditDoc(null); form.resetFields(); setModalOpen(true); }}>
          新建文档
        </Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={docs} loading={loading} size="small" pagination={{ total, pageSize: 20 }} />

      <Modal
        title={editDoc ? '编辑文档' : '新建文档'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditDoc(null); }}
        okText="保存" cancelText="取消" destroyOnClose width={700}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="文档标题" rules={[{ required: true }]}>
            <Input placeholder="文档标题" />
          </Form.Item>
          <Form.Item name="content" label="内容（Markdown）">
            <Input.TextArea rows={15} placeholder="支持 Markdown 格式" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
