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
  type: 'PROJECT' | 'TOPIC';
  status: 'ACTIVE' | 'ARCHIVED';
  visibility: 'PRIVATE' | 'DEPARTMENT' | 'PUBLIC';
  member_count: number;
  department_id: string | null;
  department_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  git_repo_path: string | null;
  template_name: string | null;
  strict_gate: boolean;
  wecom_enabled?: boolean;
  wecom_chat_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectGroup {
  id: string;
  name: string;
  description: string | null;
  creator_id: string;
  creator_name: string | null;
  workspace_count: number;
  workspaces: { id: string; name: string; key?: string }[];
  created_at: string;
  updated_at: string;
}

export interface ProjectGroupStats {
  workspace_id: string;
  workspace_name: string;
  total: number;
  done: number;
  overdue: number;
  completion: number;
}

export interface ProjectGroupMember {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  project_count: number;
  projects: { workspace_id: string; workspace_name: string }[];
}

export interface ProjectGroupActivity {
  id: string;
  task_id: string;
  user_name: string;
  workspace_name: string;
  action_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface ProjectGroupMilestone {
  type: 'milestone' | 'iteration';
  id: string;
  name: string;
  workspace_id: string;
  workspace_name: string;
  due_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status: string | null;
}

export interface ProjectGroupTask {
  id: string;
  title: string;
  status: string;
  phase: string;
  priority: string;
  task_type: string;
  workspace_id: string;
  workspace_name: string;
  assignee_id: string | null;
  due_date: string | null;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_avatar: string | null;
  ai_agent_id: string | null;
  role: 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER' | 'AI_AGENT';
}

export interface TaskPermissions {
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_move: boolean;
  can_advance_phase: boolean;
  can_change_assignee: boolean;
  can_change_reviewer: boolean;
  can_split: boolean;
  can_create_test: boolean;
  can_review_requirement: boolean;
  can_review_design: boolean;
  is_assignee: boolean;
  is_reviewer: boolean;
  is_proposer: boolean;
  is_analyst: boolean;
  is_qa_owner: boolean;
  is_verifier: boolean;
  available_transitions: Record<string, boolean>;
  role: 'manager' | 'assignee' | 'reviewer' | 'member';
}

export interface WorkItem {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  sort_order: number;
}

export interface Task {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  epic_id: string | null;
  iteration_id: string | null;
  milestone_id: string | null;
  milestone_name: string | null;
  iteration_name: string | null;
  task_type: TaskType;
  title: string;
  description: string | null;
  status: TaskStatus;
  phase: string;
  priority: TaskPriority;
  severity: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  proposer_id: string | null;
  proposer_name: string | null;
  analyst_id: string | null;
  analyst_name: string | null;
  qa_owner_id: string | null;
  qa_owner_name: string | null;
  verifier_id: string | null;
  verifier_name: string | null;
  requirement_review_status: string | null;
  requirement_reviewer_id: string | null;
  requirement_reviewer_name: string | null;
  requirement_review_note: string | null;
  design_review_status: string | null;
  design_reviewer_id: string | null;
  design_reviewer_name: string | null;
  design_review_note: string | null;
  acceptance_owner_id: string | null;
  acceptance_owner_name: string | null;
  design_doc: string | null;
  prd_doc: string | null;
  self_test_report: string | null;
  test_report: string | null;
  rating: number | null;
  evaluation: string | null;
  reviewer_ids: string[];
  estimation: number | null;
  estimation_unit: string | null;
  sort_order: number;
  due_date: string | null;
  work_items: WorkItem[];
  work_items_total: number;
  work_items_done: number;
  created_from_template_id: string | null;
  created_from_template_name: string | null;
  children_count: number;
  permissions: TaskPermissions | null;
  created_at: string;
  updated_at: string;
}

// 任务模板
export interface WorkItemTemplate {
  title: string;
  description?: string | null;
  sort_order: number;
}

export interface TaskTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  task_type: TaskType;
  title_template: string;
  description_template: string | null;
  priority: TaskPriority;
  phase: string;
  estimation: number | null;
  estimation_unit: string | null;
  work_items_template: WorkItemTemplate[];
  work_items_count: number;
  category: string | null;
  tags: string[];
  usage_count: number;
  creator_id: string;
  creator_name: string | null;
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
  phase: string;
  sort_order: number;
  color: string | null;
  depends_on_id: string | null;
  depends_on_name: string | null;
  task_count: number;
  done_count: number;
  created_at: string;
  updated_at: string;
}

export const MILESTONE_PHASE_LABELS: Record<string, string> = {
  PLANNING: '计划',
  ACTIVE: '执行中',
  REVIEW: '审核中',
  DONE: '已完成',
};

export const MILESTONE_PHASE_COLORS: Record<string, string> = {
  PLANNING: 'var(--blue-500)',
  ACTIVE: 'var(--amber-500)',
  REVIEW: 'var(--purple-500)',
  DONE: 'var(--green-500)',
};

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

export const PHASE_LABELS: Record<string, string> = {
  BACKLOG: '需求池',
  PLAN: '需求规划',
  DESIGN: '方案设计',
  DEVELOPMENT: '开发实现',
  TESTING: '测试验证',
  RELEASE: '发布上线',
};

export const STATUS_LABELS: Record<string, string> = {
  TODO: '待办',
  IN_PROGRESS: '进行中',
  IN_REVIEW: '审核中',
  DONE: '已完成',
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  EPIC: '史诗',
  STORY: '需求',
  TASK: '任务',
  SUB_TASK: '子任务',
  BUG: '缺陷',
  SPIKE: '调研',
};

export const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: '紧急',
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
};

// Risk management
export type RiskType = 'SCHEDULE' | 'QUALITY' | 'RESOURCE' | 'SCOPE' | 'OTHER';
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type RiskStatus = 'IDENTIFIED' | 'MITIGATING' | 'CLOSED';

export interface Risk {
  id: string;
  workspace_id: string;
  milestone_id: string | null;
  milestone_name: string | null;
  title: string;
  description: string | null;
  risk_type: RiskType;
  probability: RiskSeverity;
  impact: RiskSeverity;
  status: RiskStatus;
  mitigation: string | null;
  owner_id: string | null;
  owner_name: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const RISK_TYPE_LABELS: Record<string, string> = {
  SCHEDULE: '进度',
  QUALITY: '质量',
  RESOURCE: '资源',
  SCOPE: '范围',
  OTHER: '其他',
};

export const RISK_SEVERITY_LABELS: Record<string, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
};

export const RISK_STATUS_LABELS: Record<string, string> = {
  IDENTIFIED: '已识别',
  MITIGATING: '应对中',
  CLOSED: '已关闭',
};

// Project reports (周报/月报)
export type ReportType = 'WEEKLY' | 'MONTHLY';
export type ReportStatus = 'DRAFT' | 'PUBLISHED';

export interface ProjectReport {
  id: string;
  workspace_id: string;
  report_type: ReportType;
  period_start: string | null;
  period_end: string | null;
  title: string;
  content: string | null;
  summary_data: any | null;
  status: ReportStatus;
  created_by: string;
  created_by_name: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export const REPORT_TYPE_LABELS: Record<string, string> = {
  WEEKLY: '周报',
  MONTHLY: '月报',
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
};

// Task progress feedback
export interface TaskProgress {
  id: string;
  task_id: string;
  progress: number;
  note: string | null;
  created_by: string;
  creator_name: string | null;
  created_at: string;
}
