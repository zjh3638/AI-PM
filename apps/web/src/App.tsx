import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/Layout/AppLayout';
import LoginPage from './pages/login/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import WorkspaceListPage from './pages/workspace-list/WorkspaceListPage';
import WorkspaceDetailPage from './pages/workspace-detail/WorkspaceDetailPage';
import PersonalCenterPage from './pages/personal/PersonalCenterPage';
import PlaceholderPage from './pages/placeholder/PlaceholderPage';
import { useAuthStore } from './stores/authStore';
import theme from './theme';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
    </ConfigProvider>
  );
}
