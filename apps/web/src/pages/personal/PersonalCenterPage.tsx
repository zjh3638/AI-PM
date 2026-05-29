import { useEffect, useState } from 'react';
import { Card, Descriptions, Avatar, Tabs, Typography, List, Tag, Spin, Space } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';
import api from '../../api/client';

const { Title, Text } = Typography;

export default function PersonalCenterPage() {
  const user = useAuthStore((s) => s.user);
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/dashboard/my-tasks'),
      api.get('/dashboard/review-queue'),
    ]).then(([t, r]) => {
      setMyTasks(t.data);
      setReviewQueue(r.data);
    }).finally(() => setLoading(false));
  }, []);

  const priorityColors: Record<string, string> = { CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'blue', LOW: 'default' };
  const statusLabels: Record<string, string> = { TODO: '待开始', IN_PROGRESS: '进行中', IN_REVIEW: '待Review', DONE: '已完成' };

  return (
    <div>
      <Title level={4}>个人中心</Title>
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <Avatar size={64} icon={<UserOutlined />} />
          <div>
            <Title level={5} style={{ margin: 0 }}>{user?.display_name || user?.username || '用户'}</Title>
            <Text type="secondary">{user?.email || '未设置邮箱'}</Text>
          </div>
        </div>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="用户名">{user?.username}</Descriptions.Item>
          <Descriptions.Item label="系统角色">{user?.system_role}</Descriptions.Item>
          <Descriptions.Item label="部门">{user?.department_name || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Spin spinning={loading}>
        <Tabs
          defaultActiveKey="todos"
          items={[
            {
              key: 'todos',
              label: `待办 (${myTasks.length})`,
              children: myTasks.length === 0 ? <Text type="secondary">暂无待办事项</Text> : (
                <List size="small" dataSource={myTasks} renderItem={(t: any) => (
                  <List.Item>
                    <List.Item.Meta
                      title={t.title}
                      description={
                        <Space>
                          <Tag>{statusLabels[t.status] || t.status}</Tag>
                          <Tag color={priorityColors[t.priority]}>{t.priority}</Tag>
                          {t.due_date && <Text type="secondary" style={{ fontSize: 12 }}>截止: {t.due_date}</Text>}
                        </Space>
                      }
                    />
                  </List.Item>
                )} />
              ),
            },
            {
              key: 'reviews',
              label: `待Review (${reviewQueue.length})`,
              children: reviewQueue.length === 0 ? <Text type="secondary">暂无待Review项</Text> : (
                <List size="small" dataSource={reviewQueue} renderItem={(t: any) => (
                  <List.Item>
                    <List.Item.Meta
                      title={t.title}
                      description={<Space><Tag>{t.task_type}</Tag><Text type="secondary">{t.assignee_name || '未分配'}</Text></Space>}
                    />
                  </List.Item>
                )} />
              ),
            },
            { key: 'messages', label: '消息', children: <Text type="secondary">暂无消息</Text> },
          ]}
        />
      </Spin>
    </div>
  );
}
