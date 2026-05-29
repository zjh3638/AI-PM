import React from 'react';
import { usePermission } from '../hooks/usePermission';
import type { SystemRole } from '../types';

interface CanProps {
  systemRole?: SystemRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function Can({ systemRole, children, fallback = null }: CanProps) {
  const { user } = usePermission();

  if (systemRole && user && !systemRole.includes(user.system_role as SystemRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
