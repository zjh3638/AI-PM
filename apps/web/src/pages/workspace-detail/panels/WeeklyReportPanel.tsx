import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { useAuthStore } from '../../../stores/authStore';
import ReportWorkbench from './ReportWorkbench';
import type { WorkspaceMember } from '../../../types';

/** 项目（workspace）维度周报/月报面板。 */
export default function WeeklyReportPanel() {
  const { id: wsId } = useParams<{ id: string }>();
  const { members, fetchMembers } = useWorkspaceStore();
  const { user } = useAuthStore();

  useEffect(() => { if (wsId) fetchMembers(wsId); }, [wsId]);

  const canManage = useMemo(() => {
    if (!user) return false;
    return members.some((m: WorkspaceMember) =>
      m.user_id === user.id && (m.role === 'OWNER' || m.role === 'MANAGER'));
  }, [members, user]);

  if (!wsId) return null;

  return (
    <ReportWorkbench
      basePath={`/workspaces/${wsId}/reports`}
      canManage={canManage}
      enablePush
    />
  );
}
