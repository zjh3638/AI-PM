import { useAuthStore } from '../stores/authStore';
import type { SystemRole, WorkspaceRole } from '../types';

export function usePermission() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  const hasSystemRole = (...roles: SystemRole[]) => {
    if (!user) return false;
    return roles.includes(user.system_role as SystemRole);
  };

  const hasWorkspaceRole = (
    member: { role: WorkspaceRole } | null | undefined,
    ...roles: WorkspaceRole[]
  ) => {
    if (!member) return false;
    return roles.includes(member.role);
  };

  return { user, loading, hasSystemRole, hasWorkspaceRole };
}
