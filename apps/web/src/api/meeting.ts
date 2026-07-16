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
    dimension_id: string;
    meeting_type?: string;
  }) => api.post('/meetings', data).then(r => r.data),

  get: (id: string): Promise<Meeting> =>
    api.get(`/meetings/${id}`).then(r => r.data),

  getBoard: (id: string, workspaceId: string): Promise<BoardData> =>
    api
      .get(`/meetings/${id}/board`, { params: { workspace_id: workspaceId } })
      .then(r => r.data),

  addNote: (
    id: string,
    note: { who: string; text: string; note_type?: string },
  ) => api.post(`/meetings/${id}/notes`, note).then(r => r.data),

  close: (id: string) =>
    api.post(`/meetings/${id}/close`).then(r => r.data),
};
