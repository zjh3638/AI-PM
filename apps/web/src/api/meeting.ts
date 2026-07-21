import api from './client';

export interface Meeting {
  id: string;
  title: string;
  dimension: 'PROJECT_GROUP' | 'PROJECT';
  dimension_id: string;
  meeting_type: string;
  status: string;
  summary: string | null;
  notes: Array<{
    who: string;
    text: string;
    type: 'speech' | 'decision' | 'action';
    time: string;
  }> | null;
  host_id: string;
  created_at: string;
  updated_at: string | null;
}

export interface BoardData {
  workspace_id: string;
  workspace_name: string;
  owner_name: string | null;
  health: 'on-track' | 'at-risk' | 'blocked';
  pct: number;
  total_tasks: number;
  done: number;
  overdue: number;
  milestones: MilestoneData[];
  risks: RiskData[];
  recent_completed: CompletedTask[];
}

export interface MilestoneData {
  id: string;
  name: string;
  phase: string;
  pct: number;
  due_date: string | null;
  overdue: boolean;
  total_tasks: number;
  done_tasks: number;
  completed: Array<{
    title: string;
    assignee_name: string | null;
    completed_at: string | null;
  }>;
  in_progress: Array<{
    title: string;
    assignee_name: string | null;
    status: string;
  }>;
  delayed: Array<{
    title: string;
    assignee_name: string | null;
    due_date: string | null;
  }>;
}

export interface RiskData {
  id: string;
  title: string;
  description: string | null;
  level: string;
  owner_name: string | null;
  status: string;
  milestone_name: string | null;
}

export interface CompletedTask {
  title: string;
  assignee_name: string | null;
  completed_at: string | null;
}

// ── Big-screen timeline (multi-project milestone axis) ──────────────

export interface TimelineMilestone {
  id: string;
  name: string;
  phase: string;
  status: 'done' | 'active' | 'risk' | 'late' | 'upcoming';
  start_date: string | null;
  end_date: string | null;
  actual_date: string | null;
  slip_days: number;
  owner_name: string | null;
  depends_on_id: string | null;
  pct: number;
  total_tasks: number;
  done_tasks: number;
}

export interface TimelineTask {
  id: string;
  title: string;
  milestone_id: string | null;
  assignee_name: string | null;
  status: string;
  start_date: string | null;
  due_date: string | null;
  pct: number;
  critical: boolean;
  is_milestone_row: boolean;
}

export interface TimelineProject {
  workspace_id: string;
  name: string;
  owner_name: string | null;
  department_name: string | null;
  health: 'on-track' | 'at-risk' | 'blocked';
  pct: number;
  milestones: TimelineMilestone[];
  tasks: TimelineTask[];
}

export interface TimelineKeyPerson {
  user_id: string;
  name: string;
  role: string | null;
  pct: number;
  total_tasks: number;
  done_tasks: number;
  overdue_tasks: number;
  load: number;
  flag: 'ok' | 'warn' | 'block';
}

export interface TimelineRisk {
  id: string;
  title: string;
  description: string | null;
  level: string;
  status: string;
  owner_name: string | null;
  milestone_name: string | null;
  workspace_name: string | null;
  mitigation: string | null;
}

export interface TimelineData {
  window_start: string | null;
  window_end: string | null;
  projects: TimelineProject[];
  key_persons: TimelineKeyPerson[];
  risks: TimelineRisk[];
}

// ── Org-project tree (for meeting creation TreeSelect) ──────────────

export interface OrgProjectNode {
  id: string;
  name: string;
  parent_id: string | null;
  path: string;
  projects: Array<{ id: string; name: string; owner_name: string | null; department_id: string | null }>;
  children: OrgProjectNode[];
}

export const meetingApi = {
  list: (params?: {
    dimension?: string;
    dimension_id?: string;
    status?: string;
  }): Promise<Meeting[]> =>
    api.get('/meetings', { params }).then(r => r.data),

  create: (data: {
    title: string;
    dimension: string;
    dimension_id?: string;
    meeting_type?: string;
    workspace_ids?: string[];
  }) => api.post('/meetings', data).then(r => r.data),

  get: (id: string): Promise<Meeting> =>
    api.get(`/meetings/${id}`).then(r => r.data),

  getBoard: (id: string, workspaceId: string): Promise<BoardData> =>
    api
      .get(`/meetings/${id}/board`, { params: { workspace_id: workspaceId } })
      .then(r => r.data),

  getTimeline: (id: string): Promise<TimelineData> =>
    api.get(`/meetings/${id}/timeline`).then(r => r.data),

  getOrgProjects: (): Promise<OrgProjectNode[]> =>
    api.get('/meetings/org-projects').then(r => r.data),

  addNote: (
    id: string,
    note: { who: string; text: string; note_type?: string },
  ) => api.post(`/meetings/${id}/notes`, note).then(r => r.data),

  close: (id: string) =>
    api.post(`/meetings/${id}/close`).then(r => r.data),

  remove: (id: string) =>
    api.delete(`/meetings/${id}`).then(r => r.data),
};
