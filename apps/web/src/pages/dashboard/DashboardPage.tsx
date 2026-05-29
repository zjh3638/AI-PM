import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Typography, List, Tag, Spin } from 'antd';
import { ProjectOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import api from '../../api/client';

const { Title, Text } = Typography;

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/stats'),
      api.get('/dashboard/my-tasks'),
      api.get('/dashboard/review-queue'),
    ]).then(([s, t, r]) => {
      setStats(s.data);
      setMyTasks(t.data);
      setReviewQueue(r.data);
    }).finally(() => setLoading(false));
  }, []);

  const priorityColors: Record<string, string> = { CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'blue', LOW: 'default' };

  return (
    <div>
      <Title level={4}>工作台</Title>
      <Spin spinning={loading}>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title="进行中的项目" value={stats?.active_projects || 0} prefix={<ProjectOutlined />} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title="我的任务" value={stats?.my_tasks || 0} prefix={<CheckCircleOutlined />} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title="逾期任务" value={stats?.overdue_tasks || 0} prefix={<ClockCircleOutlined />} valueStyle={{ color: stats?.overdue_tasks > 0 ? '#cf1322' : undefined }} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card><Statistic title="待 Review" value={stats?.review_tasks || 0} prefix={<ExclamationCircleOutlined />} /></Card>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} lg={12}>
            <Card title="我的待办">
              {myTasks.length === 0 ? <Text type="secondary">暂无待办任务</Text> : (
                <List size="small" dataSource={myTasks} renderItem={(t: any) => (
                  <List.Item>
                    <List.Item.Meta
                      title={t.title}
                      description={<Tag color={priorityColors[t.priority]}>{t.priority}</Tag>}
                    />
                  </List.Item>
                )} />
              )}
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="待 Review 队列">
              {reviewQueue.length === 0 ? <Text type="secondary">暂无待 Review 任务</Text> : (
                <List size="small" dataSource={reviewQueue} renderItem={(t: any) => (
                  <List.Item>
                    <List.Item.Meta
                      title={t.title}
                      description={t.assignee_name || '未分配'}
                    />
                    <Tag>{t.task_type}</Tag>
                  </List.Item>
                )} />
              )}
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  );
}
