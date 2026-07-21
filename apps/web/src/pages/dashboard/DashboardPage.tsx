import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useTaskStore } from '../../stores/taskStore';
import api from '../../api/client';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function formatDate(): string {
  return new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const mins = Math.floor((now - d) / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { workspaces, fetchList: fetchWss } = useWorkspaceStore();
  const { fetchKanban } = useTaskStore();
  const [briefingOpen, setBriefingOpen] = useState(true);
  const [wsTasks, setWsTasks] = useState<Record<string, any[]>>({});
  const [activity, setActivity] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [adminData, setAdminData] = useState<any>(null);

  const isSuperAdmin = user?.system_role === 'SUPER_ADMIN';
  const isAdmin = isSuperAdmin || user?.system_role === 'ADMIN';

  useEffect(() => { fetchWss({}); }, []);

  // Fetch stats, activity, and upcoming from dashboard API
  useEffect(() => {
    (async () => {
      try {
        const [statsRes, activityRes, upcomingRes] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/dashboard/activity'),
          api.get('/dashboard/upcoming'),
        ]);
        setStats(statsRes.data);
        setActivity(activityRes.data || []);
        setUpcoming(upcomingRes.data || []);
      } catch { /* skip */ }
    })();
  }, []);

  // SUPER_ADMIN: fetch admin-level stats
  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      try {
        const res = await api.get('/admin/stats');
        setAdminData(res.data);
      } catch { /* skip */ }
    })();
  }, [isSuperAdmin]);

  // Fetch kanban for each workspace for health display
  useEffect(() => {
    if (workspaces.length === 0) return;
    workspaces.forEach(async (ws) => {
      try {
        await fetchKanban(ws.id);
        const all = Object.values(useTaskStore.getState().kanban).flat() as any[];
        setWsTasks(prev => ({ ...prev, [ws.id]: all }));
      } catch { /* skip */ }
    });
  }, [workspaces.length]);

  const displayName = user?.display_name || user?.username || '用户';

  // Compute real stats
  const allWsTasks = Object.values(wsTasks).flat();
  const totalTasks = allWsTasks.length;
  const doneTasks = allWsTasks.filter((t: any) => t.status === 'DONE').length;
  const overdueTasks = allWsTasks.filter((t: any) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'DONE').length;
  const inReviewTasks = allWsTasks.filter((t: any) => t.status === 'IN_REVIEW').length;

  // My tasks across all projects
  const [myTasks, setMyTasks] = useState<{ wsName: string; wsId: string; tasks: any[] }[]>([]);
  useEffect(() => {
    if (!user?.id || workspaces.length === 0) return;
    (async () => {
      const result: { wsName: string; wsId: string; tasks: any[] }[] = [];
      for (const ws of workspaces) {
        try {
          const res = await api.get(`/workspaces/${ws.id}/tasks`, { params: { assignee_id: user.id, page_size: 50 } });
          const myTs = (res.data || []).filter((t: any) => t.status !== 'DONE');
          if (myTs.length > 0) result.push({ wsName: ws.name, wsId: ws.id, tasks: myTs });
        } catch { /* skip */ }
      }
      setMyTasks(result);
    })();
  }, [workspaces.length, user?.id]);

  const wsStats = workspaces.map((ws) => {
    const tasks = wsTasks[ws.id] || [];
    const done = tasks.filter((t: any) => t.status === 'DONE').length;
    const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
    const overdue = tasks.filter((t: any) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'DONE').length;
    return { ws, pct, total: tasks.length, done, overdue };
  });

  // KPI cards — role-aware
  const kpiCards = isAdmin
    ? [
        { label: '我待办', value: stats?.my_tasks ?? '...', color: '#6366f1', sub: '我的任务', to: '/personal?tab=todos' },
        { label: '待审核', value: (inReviewTasks ?? stats?.review_tasks) ?? 0, color: '#f59e0b', sub: '需要 Review', to: '/personal?tab=reviews' },
        { label: '项目数', value: workspaces.length, color: '#3b82f6', sub: `${stats?.active_projects ?? 0} 活跃`, to: '/workspaces' },
        { label: '已逾期', value: (overdueTasks ?? stats?.overdue_tasks) ?? 0, color: overdueTasks > 0 ? '#ef4444' : '#34d399', sub: overdueTasks > 0 ? '需要处理' : '无逾期', to: '/personal?tab=todos' },
      ]
    : [
        { label: '我的任务', value: stats?.my_tasks ?? '...', color: '#6366f1', sub: '待处理', to: '/personal?tab=todos' },
        { label: '待审核', value: (inReviewTasks ?? stats?.review_tasks) ?? 0, color: '#f59e0b', sub: '需要 Review', to: '/personal?tab=reviews' },
        { label: '已逾期', value: (overdueTasks ?? stats?.overdue_tasks) ?? 0, color: overdueTasks > 0 ? '#ef4444' : '#34d399', sub: overdueTasks > 0 ? '需要处理' : '无逾期', to: '/personal?tab=todos' },
        { label: '进行中项目', value: stats?.active_projects ?? workspaces.length, color: '#3b82f6', sub: '个', to: '/workspaces' },
      ];

  return (
    <div>
      {/* Header */}
      <div className="focus-header">
        <div className="greeting">{getGreeting()}，{displayName}</div>
        <div className="date">{formatDate()}</div>
      </div>

      {/* Quick Actions — role-aware */}
      <div className="dash-actions">
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/workspaces')}>
          📁 我的项目 ({workspaces.length})
        </button>
        {isAdmin && (
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin')}>
            ⚙️ 系统管理
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/bigscreen')}>
          📊 会议大屏
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/personal')}>
          👤 个人中心
        </button>
      </div>

      {/* KPI Cards — role-aware */}
      <div className="kpi-grid">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className="kpi-card kpi-clickable" onClick={() => navigate(kpi.to)}>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="kpi-sub">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* SUPER_ADMIN: System overview */}
      {isSuperAdmin && adminData && (
        <div className="briefing-box" style={{ marginBottom: 16 }}>
          <div className="briefing-head">
            <span className="head-left">
              <span className="ai-badge">🛡️</span>
              系统概览
            </span>
          </div>
          <div className="briefing-body">
            系统共 <strong>{adminData.total_users ?? '...'} 个用户</strong>，
            <strong>{adminData.total_workspaces ?? workspaces.length} 个项目</strong>，
            <strong>{adminData.total_tasks ?? totalTasks} 个任务</strong>。
            {adminData.active_users != null && <> 近7天活跃用户 <strong>{adminData.active_users}</strong> 人。</>}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className={`briefing-box${briefingOpen ? '' : ' collapsed'}`}>
        <div className="briefing-head" onClick={() => setBriefingOpen(!briefingOpen)}>
          <span className="head-left">
            <span className="ai-badge">📊</span>
            项目概览
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{briefingOpen ? '收起 ▾' : '展开 ▸'}</span>
        </div>
        <div className="briefing-body">
          你参与了 <strong>{workspaces.length} 个项目</strong>，共有 <strong>{totalTasks} 个任务</strong>。
          已完成 {doneTasks} 个（{totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0}%），
          待审核 {inReviewTasks} 个，已逾期 {overdueTasks} 个。
          {overdueTasks > 0 && <span style={{ color: 'var(--red-500)' }}> 有逾期任务需要关注。</span>}
        </div>
      </div>

      {/* Main Grid: Need Attention + Project Health + Upcoming */}
      <div className="main-grid">
        {/* Left — Need Focus */}
        <div>
          <div className="section-label">需要你关注</div>

          {overdueTasks > 0 && (
            <div className="need-card" onClick={() => navigate('/workspaces')}>
              <span className="priority urgent">逾期</span>
              <h4>{overdueTasks} 个任务已逾期，需要处理</h4>
              <div className="meta"><span>请检查任务状态并更新排期</span></div>
            </div>
          )}

          {inReviewTasks > 0 && (
            <div className="need-card" onClick={() => navigate('/workspaces')}>
              <span className="priority high">待审核</span>
              <h4>{inReviewTasks} 个任务等待 Review</h4>
              <div className="meta"><span>请及时审核并反馈</span></div>
            </div>
          )}

          {upcoming.length > 0 && upcoming.slice(0, 3).map((t: any) => {
            const daysLeft = Math.ceil((new Date(t.due_date).getTime() - Date.now()) / 86400000);
            return (
              <div key={t.id} className="need-card" onClick={() => navigate(`/workspaces/${t.workspace_id}`)}>
                <span className={`priority${daysLeft <= 1 ? ' urgent' : ' high'}`}>📅 {daysLeft <= 1 ? '今天' : `${daysLeft}天后`}</span>
                <h4>{t.title}</h4>
                <div className="meta"><span>{t.assignee_name ? `负责人: ${t.assignee_name}` : '未分配'}</span></div>
              </div>
            );
          })}

          {overdueTasks === 0 && inReviewTasks === 0 && upcoming.length === 0 && (
            <div className="need-card">
              <span className="priority high">开始</span>
              <h4>暂无需要关注的事项</h4>
              <div className="meta"><span>一切都在轨道上 🎉</span></div>
            </div>
          )}

          {/* My Tasks */}
          {myTasks.length > 0 && (
            <div className="my-tasks-section">
              <div className="section-label">我的任务</div>
              {myTasks.map(({ wsName, wsId, tasks }) => (
                <div key={wsId} className="task-ws-group">
                  <div className="task-ws-header" onClick={() => navigate(`/workspaces/${wsId}`)}>
                    📁 {wsName} ({tasks.length})
                  </div>
                  <div className="task-chip-list">
                    {tasks.map((t: any) => (
                      <div key={t.id} className="task-chip" onClick={() => navigate(`/workspaces/${wsId}`)}>
                        <div className="task-chip-title">{t.title}</div>
                        <div className="task-chip-meta">
                          <span>{t.status === 'TODO' ? '待办' : t.status === 'IN_PROGRESS' ? '进行中' : t.status === 'IN_REVIEW' ? '审核中' : t.status}</span>
                          {t.phase && <span>· {t.phase === 'PLAN' ? '需求' : t.phase === 'DESIGN' ? '设计' : t.phase === 'DEVELOPMENT' ? '开发' : t.phase === 'TESTING' ? '测试' : t.phase === 'RELEASE' ? '发布' : t.phase}</span>}
                          {t.due_date && <span className={new Date(t.due_date) < new Date() ? 'text-red' : 'text-muted'}>📅 {t.due_date}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — Project Health + Upcoming */}
        <div className="right-col">
          <div>
            <div className="section-label">项目健康度</div>
            <div className="health-list">
              {wsStats.length > 0 ? (
                wsStats.map(({ ws, pct, total, done, overdue }) => (
                  <div key={ws.id} className="health-row" onClick={() => navigate(`/workspaces/${ws.id}`)}>
                    <span className="hname">{ws.name}</span>
                    <span className="hstat">
                      <span className={`badge${pct < 50 ? ' badge-amber' : ' badge-green'}`}>{pct}%</span>
                      {overdue > 0 ? <span className="hstat-warn">⚠ {overdue}逾期</span> : '✓ 正常'}
                      <span className="hstat-count">{done}/{total}</span>
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-state" style={{ padding: 16 }}>暂无项目</div>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          {activity.length > 0 && (
            <div>
              <div className="section-label">最近动态</div>
              <div>
                {activity.map((a: any) => (
                  <div key={a.id} className="activity-item">
                    <span className="activity-time">{timeAgo(a.created_at)}</span>
                    <span className="activity-text">
                      <strong>{a.user_name}</strong> {a.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
