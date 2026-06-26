import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import DashboardPage from '../../pages/dashboard/DashboardPage';
import WorkspaceListPage from '../../pages/workspace-list/WorkspaceListPage';
import WorkspaceDetailPage from '../../pages/workspace-detail/WorkspaceDetailPage';
import PersonalCenterPage from '../../pages/personal/PersonalCenterPage';
import PlaceholderPage from '../../pages/placeholder/PlaceholderPage';
import BigScreenPage from '../../pages/bigscreen/BigScreenPage';
import MeetingBoardPage from '../../pages/meeting/MeetingBoardPage';
import AdminPage from '../../pages/admin/AdminPage';
import ProjectGroupDetailPage from '../../pages/project-group-detail/ProjectGroupDetailPage';
import SearchBar from '../search/SearchBar';
import AiDrawer from './AiDrawer';

// Signal data — will be dynamic later
const SIGNALS = [
  { id: 1, dot: 'risk', text: 'Q3 改版：前端重构延期 3 天' },
  { id: 2, dot: 'warn', text: '李四本周负载 120%' },
  { id: 3, dot: 'info', text: '数据平台：到达关键里程碑' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token, logout, fetchUser } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signals, setSignals] = useState(SIGNALS);

  // Restore user on page refresh
  useEffect(() => {
    if (token && !user) fetchUser();
  }, []);

  const dismissSignal = (id: number) => setSignals((s) => s.filter((x) => x.id !== id));

  const activeKey = '/' + location.pathname.split('/')[1];

  const navItems = [
    { key: '/dashboard', label: '我的关注' },
    { key: '/workspaces', label: '工作空间' },
    { key: '/meetings', label: '会议' },
    { key: '/personal', label: '个人中心' },
  ];

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setDrawerOpen(true);
      }
      if (e.key === 'Escape') {
        setDrawerOpen(false);
      }
    },
    [],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
      {/* Signal Bar */}
      <div className="signal-bar">
        <div className="signals">
          {signals.map((s) => (
            <span key={s.id} className="signal-item">
              <span className={`dot ${s.dot}`} />
              {s.text}
              <span className="dismiss" onClick={() => dismissSignal(s.id)} style={{ marginLeft: 2, fontSize: '0.7rem', opacity: 0.4, cursor: 'pointer', padding: '0 2px' }}>
                ✕
              </span>
            </span>
          ))}
        </div>
        <div className="bar-right">
          <span className="time">
            {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button onClick={() => navigate('/dashboard')}>简报</button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="nav">
        <div className="logo" onClick={() => navigate('/dashboard')}>
          <span className="icon">PM</span>
          AI PM
        </div>
        {navItems.map((item) => (
          <button
            key={item.key}
            className={`nav-item${activeKey === item.key ? ' active' : ''}`}
            onClick={() => navigate(item.key)}
          >
            {item.label}
          </button>
        ))}
        <span className="spacer" />
        <div className="nav-right">
          <SearchBar />
          <button className="btn btn-ghost btn-sm" onClick={() => setDrawerOpen(true)} title="AI 对话 (Ctrl+K)">
            AI
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/settings')}
            title="系统管理"
          >
            系统
          </button>
          <span className="user-avatar">
            {(user?.display_name || user?.username || '用')[0]}
          </span>
        </div>
      </nav>

      {/* Content */}
      <div className={activeKey === '/meetings' || activeKey === '/bigscreen' ? 'page-wide' : 'page'}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workspaces" element={<WorkspaceListPage />} />
          <Route path="/workspaces/:id/*" element={<WorkspaceDetailPage />} />
          <Route path="/project-groups/:id" element={<ProjectGroupDetailPage />} />
          <Route path="/bigscreen" element={<BigScreenPage />} />
          <Route path="/meetings/:id" element={<MeetingBoardPage />} />
          <Route path="/personal" element={<PersonalCenterPage />} />
          <Route path="/settings" element={<AdminPage />} />
          <Route path="/" element={<DashboardPage />} />
        </Routes>
      </div>

      {/* AI Drawer */}
      <AiDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
