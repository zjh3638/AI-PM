import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { RouteContext } from './aiTypes';

export function deriveRouteContext(
  pathname: string,
  workspace: { id: string; name: string } | undefined,
): RouteContext {
  // /workspaces/:id/tasks/:taskId → task_detail
  const taskMatch = pathname.match(/^\/workspaces\/([^/]+)\/tasks\/([^/]+)/);
  if (taskMatch) {
    return {
      page_type: 'task_detail',
      workspace_id: taskMatch[1],
      workspace_name: workspace?.name,
      task_id: taskMatch[2],
    };
  }
  // /workspaces/:id[/tab] → workspace_detail
  const wsMatch = pathname.match(/^\/workspaces\/([^/]+)(?:\/([^/]+))?/);
  if (wsMatch) {
    return {
      page_type: 'workspace_detail',
      workspace_id: wsMatch[1],
      workspace_name: workspace?.name,
      workspace_tab: wsMatch[2] || undefined,
    };
  }
  if (pathname === '/workspaces') return { page_type: 'workspace_list' };
  if (pathname === '/dashboard' || pathname === '/') return { page_type: 'dashboard' };
  if (pathname === '/personal') return { page_type: 'personal' };
  if (pathname === '/settings') return { page_type: 'admin' };
  if (pathname === '/bigscreen') return { page_type: 'bigscreen' };
  if (pathname.startsWith('/project-groups/')) return { page_type: 'project_group' };
  return { page_type: 'dashboard' };
}

export function useRouteContext(): RouteContext {
  const loc = useLocation();
  const { current } = useWorkspaceStore();
  return useMemo(
    () => deriveRouteContext(loc.pathname, current ? { id: current.id, name: current.name } : undefined),
    [loc.pathname, current?.id, current?.name],
  );
}
