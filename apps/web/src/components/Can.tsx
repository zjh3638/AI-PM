import React from 'react';
import { usePermission } from '../hooks/usePermission';
import type { SystemRole } from '../types';

interface CanProps {
  systemRole?: SystemRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function Can({ systemRole, children, fallback = null }: CanProps) {
  const { user, loading } = usePermission();

  // While user data is loading, hide privileged content instead of leaking it
  if (loading) {
    return <>{fallback}</>;
  }

  if (systemRole && user && !systemRole.includes(user.system_role as SystemRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
