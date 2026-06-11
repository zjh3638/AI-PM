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

  const priorityLabel: Record<string, string> = {
    CRITICAL: '紧急', HIGH: '高', MEDIUM: '中', LOW: '低',
  };

  return (
    <div>
      {/* Header */}
      <div className="focus-header">
        <div className="greeting">{getGreeting()}，{displayName}</div>
        <div className="date">{formatDate()}</div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/workspaces')}>
          📁 我的项目 ({workspaces.length})
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/bigscreen')}>
          📊 会议大屏
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/personal')}>
          👤 个人中心
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: '我的任务', value: stats?.my_tasks ?? '...', color: '#6366f1', sub: '待处理' },
          { label: '待审核', value: (inReviewTasks || stats?.review_tasks) ?? 0, color: '#f59e0b', sub: '需要 Review' },
          { label: '已逾期', value: (overdueTasks || stats?.overdue_tasks) ?? 0, color: overdueTasks > 0 ? '#ef4444' : '#34d399', sub: overdueTasks > 0 ? '需要处理' : '无逾期' },
          { label: '进行中项目', value: stats?.active_projects ?? workspaces.length, color: '#3b82f6', sub: '个' },
        ].map((kpi) => (
          <div key={kpi.label}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
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
        </div>

        {/* Right — Project Health + Upcoming */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div className="section-label">项目健康度</div>
            <div className="health-list">
              {wsStats.length > 0 ? (
                wsStats.map(({ ws, pct, total, done, overdue }) => (
                  <div key={ws.id} className="health-row" onClick={() => navigate(`/workspaces/${ws.id}`)}>
                    <span className="hname">{ws.name}</span>
                    <span className="hstat">
                      <span className={`badge${pct < 50 ? ' badge-amber' : ' badge-green'}`}>{pct}%</span>
                      {overdue > 0 ? <span style={{ color: 'var(--red-500)', fontSize: '0.72rem' }}>⚠ {overdue}逾期</span> : '✓ 正常'}
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{done}/{total}</span>
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>暂无项目</div>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          {activity.length > 0 && (
            <div>
              <div className="section-label">最近动态</div>
              <div>
                {activity.map((a: any) => (
                  <div key={a.id}
                    style={{
                      padding: '8px 0', borderBottom: '1px solid var(--border-light)',
                      display: 'flex', gap: 8, alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--blue-600)', minWidth: 44, textAlign: 'right', paddingTop: 1 }}>
                      {timeAgo(a.created_at)}
                    </span>
                    <span style={{ fontSize: '0.75rem' }}>
                      <strong>{a.user_name}</strong> {a.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* My Tasks */}
      {myTasks.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="section-label" style={{ marginBottom: 10 }}>我的任务</div>
          {myTasks.map(({ wsName, wsId, tasks }) => (
            <div key={wsId} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, cursor: 'pointer' }} onClick={() => navigate(`/workspaces/${wsId}`)}>
                📁 {wsName} ({tasks.length})
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tasks.map((t: any) => (
                  <div key={t.id}
                    onClick={() => navigate(`/workspaces/${wsId}`)}
                    style={{
                      background: 'var(--bg-raised)', border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-sm)', padding: '6px 10px',
                      fontSize: '0.74rem', cursor: 'pointer', maxWidth: 280,
                    }}>
                    <div style={{ fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    <div style={{ display: 'flex', gap: 8, fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                      <span>{t.status === 'TODO' ? '待办' : t.status === 'IN_PROGRESS' ? '进行中' : t.status === 'IN_REVIEW' ? '审核中' : t.status}</span>
                      {t.phase && <span>· {t.phase === 'PLAN' ? '需求' : t.phase === 'DESIGN' ? '设计' : t.phase === 'DEVELOPMENT' ? '开发' : t.phase === 'TESTING' ? '测试' : t.phase === 'RELEASE' ? '发布' : t.phase}</span>}
                      {t.due_date && <span style={{ color: new Date(t.due_date) < new Date() ? 'var(--red-500)' : 'var(--text-muted)' }}>📅 {t.due_date}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
