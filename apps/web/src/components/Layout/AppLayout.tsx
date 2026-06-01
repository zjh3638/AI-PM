import { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Button, Avatar, Dropdown, theme } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  BellOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';
import DashboardPage from '../../pages/dashboard/DashboardPage';
import WorkspaceListPage from '../../pages/workspace-list/WorkspaceListPage';
import WorkspaceDetailPage from '../../pages/workspace-detail/WorkspaceDetailPage';
import PersonalCenterPage from '../../pages/personal/PersonalCenterPage';
import PlaceholderPage from '../../pages/placeholder/PlaceholderPage';
import SearchBar from '../search/SearchBar';

const { Header, Content } = Layout;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { token: themeToken } = theme.useToken();

  const navItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/workspaces', icon: <AppstoreOutlined />, label: '工作空间' },
    { key: '/personal', icon: <UserOutlined />, label: '个人中心' },
    { key: '/settings', icon: <SettingOutlined />, label: '系统管理' },
  ];

  const userMenuItems = [
    { key: 'personal', icon: <UserOutlined />, label: '个人中心' },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  const handleNavClick = (key: string) => navigate(key);
  const handleUserMenu = ({ key }: { key: string }) => {
    if (key === 'logout') logout();
    if (key === 'personal') navigate('/personal');
  };

  const activeKey = '/' + location.pathname.split('/')[1];

  return (
    <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Signal Bar */}
      <div
        style={{
          height: 36,
          background: '#0f172a',
          color: 'rgba(255,255,255,0.88)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 16,
          fontSize: 12,
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', gap: 20, flex: 1, overflow: 'hidden' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.06)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706', flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap' }}>3 个风险项需关注</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.06)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap' }}>里程碑 M2 即将到期</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <ClockCircleOutlined style={{ fontSize: 11, opacity: 0.5 }} />
          <span style={{ fontSize: 11, opacity: 0.5 }}>11:24</span>
          <BellOutlined style={{ fontSize: 13, opacity: 0.7, cursor: 'pointer' }} />
        </div>
      </div>

      {/* Top Navigation */}
      <Header
        style={{
          height: 48,
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          position: 'sticky',
          top: 36,
          zIndex: 90,
        }}
      >
        {/* Logo */}
        <div
          onClick={() => navigate('/dashboard')}
          style={{
            fontWeight: 700,
            fontSize: 15,
            marginRight: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            color: '#0f172a',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 10,
              fontWeight: 800,
            }}
          >
            PM
          </span>
          AI-PM
        </div>

        {/* Nav items */}
        {navItems.map((item) => (
          <Button
            key={item.key}
            type="text"
            onClick={() => handleNavClick(item.key)}
            style={{
              height: 32,
              padding: '4px 14px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              color: activeKey === item.key ? '#1d4ed8' : '#475569',
              background: activeKey === item.key ? '#eff6ff' : 'transparent',
            }}
          >
            {item.icon}
            <span style={{ marginLeft: 6 }}>{item.label}</span>
          </Button>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SearchBar />
          <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenu }}>
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 6 }}>
              <Avatar
                size={28}
                icon={<UserOutlined />}
                style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: 11 }}
              />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>
                {user?.display_name || user?.username || '用户'}
              </span>
            </div>
          </Dropdown>
        </div>
      </Header>

      {/* Content */}
      <Content style={{ maxWidth: 1120, margin: '0 auto', padding: '28px 20px 60px', width: '100%' }}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workspaces" element={<WorkspaceListPage />} />
          <Route path="/workspaces/:id/*" element={<WorkspaceDetailPage />} />
          <Route path="/personal" element={<PersonalCenterPage />} />
          <Route path="/settings" element={<PlaceholderPage title="系统管理" />} />
          <Route path="/" element={<DashboardPage />} />
        </Routes>
      </Content>
    </Layout>
  );
}
