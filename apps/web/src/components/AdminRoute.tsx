import { Navigate } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';

/**
 * 管理员路由守卫 — 仅 SUPER_ADMIN / ADMIN 可访问子页面。
 * 非管理员重定向到首页，加载中显示空白避免闪烁。
 */
export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = usePermission();

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>;
  }

  if (!user || (user.system_role !== 'SUPER_ADMIN' && user.system_role !== 'ADMIN')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
