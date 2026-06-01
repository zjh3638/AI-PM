import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import api from '../../api/client';

export default function PersonalCenterPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('todos');
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/dashboard/my-tasks'),
      api.get('/dashboard/review-queue'),
      // Fetch recent activity across workspaces
      api.get('/workspaces').then(async (wsRes: any) => {
        const wss = wsRes.data || [];
        const allActivity: any[] = [];
        for (const ws of wss.slice(0, 3)) {
          try {
            const res = await api.get(`/workspaces/${ws.id}/tasks?page_size=5&sort_by=updated_at&sort_dir=desc`);
            const tasks = res.data || [];
            for (const t of tasks) {
              if (t.updated_at) allActivity.push({ ...t, _wsName: ws.name });
            }
          } catch { /* skip */ }
        }
        return allActivity.sort((a: any, b: any) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 8);
      }),
    ])
      .then(([t, r, msg]) => {
        setMyTasks(t.data || []);
        setReviewQueue(r.data || []);
        setMessages(msg || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const tabs = [
    { key: 'todos', label: '我的待办', count: myTasks.length },
    { key: 'reviews', label: '待 Review', count: reviewQueue.length },
    { key: 'messages', label: '动态', count: messages.length },
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
              myTasks.map((t: any) => (
                <div key={t.id} className="todo-item" onClick={() => navigate(`/workspaces/${t.workspace_id}`)} style={{ cursor: 'pointer' }}>
                  <div className="todo-checkbox" />
                  <span className="todo-text">{t.title}</span>
                  <span className="todo-meta">
                    {t.status === 'TODO' ? <span className="badge" style={{ background: 'var(--bg-hover)' }}>待办</span> : <span className="badge" style={{ background: 'var(--blue-100)', color: 'var(--blue-600)' }}>进行中</span>}
                    {t.phase && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t.phase === 'REQUIREMENTS' ? '需求' : t.phase === 'DESIGN' ? '设计' : t.phase === 'DEVELOPMENT' ? '开发' : t.phase === 'TESTING' ? '测试' : t.phase === 'RELEASE' ? '发布' : ''}</span>}
                    {t.due_date && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: new Date(t.due_date) < new Date() ? 'var(--red-500)' : 'var(--text-muted)' }}>📅 {t.due_date}</span>}
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
              reviewQueue.map((t: any) => (
                <div key={t.id} className="review-item" onClick={() => navigate(`/workspaces/${t.workspace_id}`)} style={{ cursor: 'pointer' }}>
                  <div className="review-icon">📋</div>
                  <div className="review-info">
                    <div className="ri-title">{t.title}</div>
                    <div className="ri-meta">
                      {t.phase && <span className="badge badge-blue" style={{ marginRight: 6, fontSize: '0.62rem' }}>{t.phase === 'REQUIREMENTS' ? '需求' : t.phase === 'DESIGN' ? '设计' : t.phase === 'DEVELOPMENT' ? '开发' : t.phase === 'TESTING' ? '测试' : '发布'}</span>}
                      {t.milestone_name && <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginRight: 6 }}>{t.milestone_name}</span>}
                      {t.assignee_name || '未分配'}
                    </div>
                  </div>
                  <div className="review-actions">
                    <button className="btn btn-primary btn-xs" onClick={async (e) => {
                      e.stopPropagation();
                      try { await api.patch(`/workspaces/${t.workspace_id}/tasks/${t.id}`, { status: 'DONE' }); setReviewQueue(prev => prev.filter(x => x.id !== t.id)); } catch { /* skip */ }
                    }}>确认</button>
                    <button className="btn btn-ghost btn-xs" onClick={(e) => {
                      e.stopPropagation();
                      try { api.patch(`/workspaces/${t.workspace_id}/tasks/${t.id}`, { status: 'IN_PROGRESS' }); setReviewQueue(prev => prev.filter(x => x.id !== t.id)); } catch { /* skip */ }
                    }}>打回</button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Messages Panel — recent activity */}
          <div className={`personal-panel${activeTab === 'messages' ? ' active' : ''}`}>
            {messages.length === 0 ? (
              <div className="empty-state">暂无动态</div>
            ) : (
              messages.map((t: any) => {
                const actionText = t.status === 'DONE' ? '完成了' : t.status === 'IN_REVIEW' ? '提交了 Review' : t.status === 'IN_PROGRESS' ? '开始处理' : '创建了';
                return (
                  <div key={t.id} className="msg-item" onClick={() => navigate(`/workspaces/${t.workspace_id}`)} style={{ cursor: 'pointer' }}>
                    <span className="msg-dot" style={{ background: t.status === 'DONE' ? 'var(--green-400)' : t.status === 'IN_REVIEW' ? 'var(--amber-400)' : 'var(--blue-400)' }} />
                    <div className="msg-content">
                      <div className="mc-text">[{t._wsName}] {t.assignee_name || '未知'} {actionText} 「{t.title}」</div>
                      <div className="mc-time">{t.updated_at?.slice(0, 10)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
