export interface UserInfo {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  department_name: string | null;
  system_role: string;
}

export interface Workspace {
  id: string;
  name: string;
  key: string;
  description: string;
  type: 'PROJECT' | 'OPERATION' | 'OTHER';
  status: 'ACTIVE' | 'ARCHIVED';
  visibility: 'PRIVATE' | 'DEPARTMENT' | 'PUBLIC';
  member_count: number;
  department_id: string | null;
  git_repo_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_avatar: string | null;
  ai_agent_id: string | null;
  role: 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER' | 'AI_AGENT';
}

export interface Task {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  epic_id: string | null;
  iteration_id: string | null;
  milestone_id: string | null;
  milestone_name: string | null;
  task_type: TaskType;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  severity: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  estimation: number | null;
  estimation_unit: string | null;
  sort_order: number;
  due_date: string | null;
  children_count: number;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  plan: string | null;
  owner_id: string | null;
  owner_name: string | null;
  start_date: string;
  end_date: string;
  status: string;
  sort_order: number;
  color: string | null;
  task_count: number;
  done_count: number;
  created_at: string;
  updated_at: string;
}

export interface Iteration {
  id: string;
  workspace_id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  capacity_points: number;
  committed_points: number;
  status: string;
  task_count: number;
  created_at: string;
  updated_at: string;
}

export interface Epic {
  id: string;
  title: string;
  task_type: string;
  status: string;
  priority: string;
  total_stories: number;
  done_stories: number;
  total_points: number;
  completed_points: number;
  created_at: string;
}

export type SystemRole = 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER' | 'EXTERNAL';
export type WorkspaceRole = 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER' | 'AI_AGENT';
export type TaskType = 'EPIC' | 'STORY' | 'TASK' | 'SUB_TASK' | 'BUG' | 'SPIKE';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
