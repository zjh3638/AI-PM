import { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Avatar, Dropdown, theme } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';
import DashboardPage from '../../pages/dashboard/DashboardPage';
import WorkspaceListPage from '../../pages/workspace-list/WorkspaceListPage';
import WorkspaceDetailPage from '../../pages/workspace-detail/WorkspaceDetailPage';
import PersonalCenterPage from '../../pages/personal/PersonalCenterPage';
import PlaceholderPage from '../../pages/placeholder/PlaceholderPage';
import SearchBar from '../search/SearchBar';

const { Header, Sider, Content } = Layout;

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { token: themeToken } = theme.useToken();

  const menuItems = [
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

  const handleMenuClick = ({ key }: { key: string }) => navigate(key);
  const handleUserMenu = ({ key }: { key: string }) => {
    if (key === 'logout') logout();
    if (key === 'personal') navigate('/personal');
  };

  const selectedKey = '/' + location.pathname.split('/')[1];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="light">
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: collapsed ? 16 : 20 }}>
          {collapsed ? 'PM' : 'AI-PM'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: themeToken.colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
            <SearchBar />
            <div style={{ flex: 1 }} />
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenu }}>
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar icon={<UserOutlined />} />
                <span>{user?.display_name || user?.username || '用户'}</span>
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: themeToken.colorBgContainer, borderRadius: 8 }}>
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
    </Layout>
  );
}
