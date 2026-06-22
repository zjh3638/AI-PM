import { describe, it, expect } from 'vitest';
import { deriveRouteContext } from './useRouteContext';

describe('deriveRouteContext', () => {
  it('dashboard', () => {
    const ctx = deriveRouteContext('/dashboard', undefined);
    expect(ctx.page_type).toBe('dashboard');
  });

  it('workspace detail kanban', () => {
    const ctx = deriveRouteContext('/workspaces/ws-1/kanban', { id: 'ws-1', name: '项目A' });
    expect(ctx.page_type).toBe('workspace_detail');
    expect(ctx.workspace_id).toBe('ws-1');
    expect(ctx.workspace_name).toBe('项目A');
    expect(ctx.workspace_tab).toBe('kanban');
  });

  it('workspace detail without tab', () => {
    const ctx = deriveRouteContext('/workspaces/ws-2', { id: 'ws-2', name: '项目B' });
    expect(ctx.page_type).toBe('workspace_detail');
    expect(ctx.workspace_tab).toBeUndefined();
  });

  it('task detail', () => {
    const ctx = deriveRouteContext('/workspaces/ws-1/tasks/task-9', { id: 'ws-1', name: '项目A' });
    expect(ctx.page_type).toBe('task_detail');
    expect(ctx.task_id).toBe('task-9');
  });

  it('personal page does not inject workspace', () => {
    const ctx = deriveRouteContext('/personal', { id: 'ws-1', name: 'X' });
    expect(ctx.page_type).toBe('personal');
    expect(ctx.workspace_id).toBeUndefined();
  });

  it('admin / settings', () => {
    expect(deriveRouteContext('/settings', undefined).page_type).toBe('admin');
  });

  it('project group', () => {
    expect(deriveRouteContext('/project-groups/g-1', undefined).page_type).toBe('project_group');
  });

  it('bigscreen', () => {
    expect(deriveRouteContext('/bigscreen', undefined).page_type).toBe('bigscreen');
  });
});
