import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/Layout/AppLayout';
import LoginPage from './pages/login/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import WorkspaceListPage from './pages/workspace-list/WorkspaceListPage';
import WorkspaceDetailPage from './pages/workspace-detail/WorkspaceDetailPage';
import WorkspaceCastPage from './pages/workspace-detail/WorkspaceCastPage';
import ProjectGroupCastPage from './pages/project-group-detail/ProjectGroupCastPage';
import PersonalCenterPage from './pages/personal/PersonalCenterPage';
import PlaceholderPage from './pages/placeholder/PlaceholderPage';
import { useAuthStore } from './stores/authStore';
import { setMessageInstance } from './utils/feedback';
import theme from './theme';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * 必须放在 <AntdApp> 内部：通过 useApp() 拿到带主题/上下文绑定的
 * message 实例，注入到 feedback.ts 的 holder，供 axios 拦截器等
 * 非组件环境使用，同时静态 message.success 等也能正确消费上下文。
 */
function AppShell() {
  const { message } = AntdApp.useApp();
  useEffect(() => {
    setMessageInstance(message);
    return () => setMessageInstance(null);
  }, [message]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/workspaces/:id/cast"
          element={
            <ProtectedRoute>
              <WorkspaceCastPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project-groups/:id/cast"
          element={
            <ProtectedRoute>
              <ProjectGroupCastPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <AntdApp>
        <AppShell />
      </AntdApp>
    </ConfigProvider>
  );
}
