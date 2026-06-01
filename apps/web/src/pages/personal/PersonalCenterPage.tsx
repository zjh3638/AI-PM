import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import api from '../../api/client';

export default function PersonalCenterPage() {
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState('todos');
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/dashboard/my-tasks'),
      api.get('/dashboard/review-queue'),
    ])
      .then(([t, r]) => {
        setMyTasks(t.data || []);
        setReviewQueue(r.data || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const tabs = [
    { key: 'todos', label: '我的待办', count: myTasks.length },
    { key: 'reviews', label: '待 Review', count: reviewQueue.length },
    { key: 'messages', label: '消息', count: 5 },
  ];

  // Mock messages
  const messages = [
    { unread: true, text: 'AI 开发工程师提交了 3 个 PR，等待 Review', time: '10 分钟前' },
    { unread: true, text: '王芳提交了新需求「数据导出功能」等待评审', time: '2 小时前' },
    { unread: true, text: 'Q3 改版前端重构任务已延期 3 天', time: '3 小时前' },
    { unread: false, text: '李四完成了首页线框图 Review', time: '昨天 16:30' },
    { unread: false, text: '周报已自动生成，请查收', time: '昨天 09:00' },
  ];

  return (
    <div>
      {/* Personal Header */}
      <div className="personal-header">
        <div className="personal-avatar">
          {(user?.display_name || user?.username || '用')[0]}
        </div>
        <div className="personal-info">
          <h2>{user?.display_name || user?.username || '用户'}</h2>
          <div className="pi-meta">
            {user?.email || '未设置邮箱'} · {user?.department_name || '未分配部门'} · {user?.system_role === 'SUPER_ADMIN' ? '超级管理员' : '成员'}
          </div>
        </div>
        <div className="personal-actions">
          <button className="btn btn-ghost btn-sm">编辑资料</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="personal-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`personal-tab${activeTab === t.key ? ' active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`pt-badge${t.key === 'messages' ? '' : ''}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      {loading ? (
        <div className="empty-state">加载中...</div>
      ) : (
        <>
          {/* Todos Panel */}
          <div className={`personal-panel${activeTab === 'todos' ? ' active' : ''}`}>
            {myTasks.length === 0 ? (
              <div className="empty-state">暂无待办事项</div>
            ) : (
              myTasks.map((t: any, i: number) => (
                <div key={t.id || i} className="todo-item">
                  <div className="todo-checkbox" />
                  <span className="todo-text">{t.title}</span>
                  <span className="todo-meta">
                    {t.priority && <span className="badge badge-blue">{t.priority}</span>}
                    {t.due_date && <span style={{ marginLeft: 8 }}>{t.due_date}</span>}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Review Panel */}
          <div className={`personal-panel${activeTab === 'reviews' ? ' active' : ''}`}>
            {reviewQueue.length === 0 ? (
              <div className="empty-state">暂无待 Review 项</div>
            ) : (
              reviewQueue.map((t: any, i: number) => (
                <div key={t.id || i} className="review-item">
                  <div className="review-icon">📋</div>
                  <div className="review-info">
                    <div className="ri-title">{t.title}</div>
                    <div className="ri-meta">
                      {t.task_type && <span className="badge badge-blue" style={{ marginRight: 6 }}>{t.task_type}</span>}
                      {t.assignee_name || '未分配'}
                    </div>
                  </div>
                  <span className="review-agent">AI Agent</span>
                  <div className="review-actions">
                    <button className="btn btn-primary btn-xs">确认</button>
                    <button className="btn btn-ghost btn-xs">打回</button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Messages Panel */}
          <div className={`personal-panel${activeTab === 'messages' ? ' active' : ''}`}>
            {messages.map((m, i) => (
              <div key={i} className={`msg-item${m.unread ? ' unread' : ''}`}>
                <span className={`msg-dot${m.unread ? ' new' : ''}`} />
                <div className="msg-content">
                  <div className="mc-text">{m.text}</div>
                  <div className="mc-time">{m.time}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
