import { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import DashboardPage from '../../pages/dashboard/DashboardPage';
import WorkspaceListPage from '../../pages/workspace-list/WorkspaceListPage';
import WorkspaceDetailPage from '../../pages/workspace-detail/WorkspaceDetailPage';
import ProjectGroupListPage from '../../pages/project-group-list/ProjectGroupListPage';
import PersonalCenterPage from '../../pages/personal/PersonalCenterPage';
import PlaceholderPage from '../../pages/placeholder/PlaceholderPage';
import BigScreenPage from '../../pages/bigscreen/BigScreenPage';
import MeetingListPage from '../../pages/meeting/MeetingListPage';
import MeetingBoardPage from '../../pages/meeting/MeetingBoardPage';
import AdminPage from '../../pages/admin/AdminPage';
import ProjectGroupDetailPage from '../../pages/project-group-detail/ProjectGroupDetailPage';
import SearchBar from '../search/SearchBar';
import { Can } from '../Can';
import AdminRoute from '../AdminRoute';

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
  const [signals, setSignals] = useState(SIGNALS);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  // Restore user on page refresh
  useEffect(() => {
    if (token && !user) fetchUser();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [dropdownOpen]);

  const handleLogout = async () => {
    setDropdownOpen(false);
    await logout();
  };

  const dismissSignal = (id: number) => setSignals((s) => s.filter((x) => x.id !== id));

  const activeKey = '/' + location.pathname.split('/')[1];

  const navItems = [
    { key: '/dashboard', label: '我的关注' },
    { key: '/workspaces', label: '工作空间' },
    { key: '/meetings', label: '会议' },
    { key: '/personal', label: '个人中心' },
  ];

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
          <Can systemRole={['SUPER_ADMIN', 'ADMIN']}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/settings')}
              title="系统管理"
            >
              系统
            </button>
          </Can>
          <div className="nav-avatar-wrap" ref={avatarRef}>
            <span
              className="user-avatar"
              onClick={() => setDropdownOpen((v) => !v)}
              title={user?.display_name || user?.username || '用户'}
            >
              {(user?.display_name || user?.username || '用')[0]}
            </span>
            {dropdownOpen && (
              <div className="user-dropdown">
                <button
                  className="user-dropdown-item"
                  onClick={() => { setDropdownOpen(false); navigate('/personal'); }}
                >
                  <UserOutlined /> 个人中心
                </button>
                <button className="user-dropdown-item" onClick={handleLogout}>
                  <LogoutOutlined /> 退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className={activeKey === '/meetings' || activeKey === '/bigscreen' || activeKey === '/project-groups' || activeKey === '/workspaces' ? 'page-wide' : 'page'}>
        <Routes>
          <Route path="/project-groups" element={<ProjectGroupListPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workspaces" element={<WorkspaceListPage />} />
          <Route path="/workspaces/:id/*" element={<WorkspaceDetailPage />} />
          <Route path="/project-groups/:id" element={<ProjectGroupDetailPage />} />
          <Route path="/bigscreen" element={<BigScreenPage />} />
          <Route path="/meetings" element={<MeetingListPage />} />
          <Route path="/meetings/:id" element={<MeetingBoardPage />} />
          <Route path="/personal" element={<PersonalCenterPage />} />
          <Route path="/settings" element={<AdminRoute><AdminPage /></AdminRoute>} />
          <Route path="/" element={<DashboardPage />} />
        </Routes>
      </div>
    </div>
  );
}
