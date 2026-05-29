import { useEffect, useCallback } from 'react';
import { Card, Tag, Avatar, Typography, Empty, Spin } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { useTaskStore } from '../../stores/taskStore';
import type { Task } from '../../types';

const { Text } = Typography;

const columns = [
  { key: 'TODO', title: '待开始', color: '#d9d9d9' },
  { key: 'IN_PROGRESS', title: '进行中', color: '#1677ff' },
  { key: 'IN_REVIEW', title: '待Review', color: '#faad14' },
  { key: 'DONE', title: '已完成', color: '#52c41a' },
];

const priorityColors: Record<string, string> = { CRITICAL: '#f5222d', HIGH: '#fa8c16', MEDIUM: '#1677ff', LOW: '#8c8c8c' };
const typeLabels: Record<string, string> = { EPIC: 'Epic', STORY: 'Story', TASK: '任务', SUB_TASK: '子任务', BUG: 'Bug', SPIKE: 'Spike' };

function TaskCard({ task, onDragStart }: { task: Task; onDragStart: (e: React.DragEvent, task: Task) => void }) {
  return (
    <Card
      size="small"
      style={{ marginBottom: 8, cursor: 'grab', borderLeft: `3px solid ${priorityColors[task.priority] || '#d9d9d9'}` }}
      draggable
      onDragStart={(e) => onDragStart(e, task)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Tag style={{ fontSize: 10 }}>{typeLabels[task.task_type]}</Tag>
      </div>
      <Text style={{ fontSize: 13 }}>{task.title}</Text>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <Avatar size={20} icon={<UserOutlined />} src={task.assignee_name ? undefined : undefined}>
          {task.assignee_name?.[0]}
        </Avatar>
        {task.estimation && <Text type="secondary" style={{ fontSize: 11 }}>{task.estimation} pts</Text>}
      </div>
    </Card>
  );
}

export default function KanbanBoard() {
  const { id: wsId } = useParams<{ id: string }>();
  const { kanban, loading, fetchKanban, moveTask } = useTaskStore();

  useEffect(() => {
    if (wsId) fetchKanban(wsId);
  }, [wsId]);

  const handleDragStart = useCallback((e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData('taskId', task.id);
    e.dataTransfer.setData('taskStatus', task.status);
  }, []);

  const handleDrop = useCallback(
    async (colKey: string, e: React.DragEvent) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData('taskId');
      const fromStatus = e.dataTransfer.getData('taskStatus');
      if (taskId && wsId && fromStatus !== colKey) {
        await moveTask(wsId, taskId, colKey, 0);
      }
    },
    [wsId, moveTask]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  if (loading) return <Spin spinning style={{ display: 'block', marginTop: 40 }} />;

  return (
    <div style={{ display: 'flex', gap: 12, overflow: 'auto', paddingBottom: 16 }}>
      {columns.map((col) => (
        <div
          key={col.key}
          style={{
            flex: 1,
            minWidth: 220,
            background: '#f5f5f5',
            borderRadius: 8,
            padding: 12,
          }}
          onDrop={(e) => handleDrop(col.key, e)}
          onDragOver={handleDragOver}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
              <Text strong>{col.title}</Text>
            </div>
            <Tag>{(kanban[col.key] || []).length}</Tag>
          </div>
          {(kanban[col.key] || []).length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <Text type="secondary">暂无任务</Text>
            </div>
          ) : (
            (kanban[col.key] || []).map((task: Task) => (
              <TaskCard key={task.id} task={task} onDragStart={handleDragStart} />
            ))
          )}
        </div>
      ))}
    </div>
  );
}
