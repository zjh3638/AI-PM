import { create } from 'zustand';
import type {
  ProjectGroup, ProjectGroupStats, ProjectGroupMember,
  ProjectGroupActivity, ProjectGroupMilestone, Task,
} from '../types';
import api from '../api/client';

interface ProjectGroupState {
  groups: ProjectGroup[];
  total: number;
  loading: boolean;
  current: ProjectGroup | null;
  stats: ProjectGroupStats[];
  members: ProjectGroupMember[];
  milestones: ProjectGroupMilestone[];
  activity: ProjectGroupActivity[];
  tasks: Task[];

  fetchList: (params?: Record<string, any>) => Promise<void>;
  fetchDetail: (id: string) => Promise<void>;
  create: (data: { name: string; description?: string }) => Promise<ProjectGroup>;
  update: (id: string, data: Partial<ProjectGroup>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addWorkspace: (groupId: string, workspaceId: string) => Promise<void>;
  removeWorkspace: (groupId: string, workspaceId: string) => Promise<void>;
  fetchStats: (id: string) => Promise<void>;
  fetchMembers: (id: string) => Promise<void>;
  fetchMilestones: (id: string) => Promise<void>;
  fetchActivity: (id: string) => Promise<void>;
  fetchTasks: (id: string, params?: Record<string, any>) => Promise<void>;
}

export const useProjectGroupStore = create<ProjectGroupState>((set, get) => ({
  groups: [],
  total: 0,
  loading: false,
  current: null,
  stats: [],
  members: [],
  milestones: [],
  activity: [],
  tasks: [],

  fetchList: async (params = {}) => {
    set({ loading: true });
    const data = await api.get('/project-groups', { params });
    set({ groups: data.data, total: data.total, loading: false });
  },

  fetchDetail: async (id) => {
    const data = await api.get(`/project-groups/${id}`);
    set({ current: data.data });
  },

  create: async (payload) => {
    const data = await api.post('/project-groups', payload);
    return data.data;
  },

  update: async (id, payload) => {
    await api.patch(`/project-groups/${id}`, payload);
    await get().fetchDetail(id);
  },

  remove: async (id) => {
    await api.delete(`/project-groups/${id}`);
    await get().fetchList();
  },

  addWorkspace: async (groupId, workspaceId) => {
    await api.post(`/project-groups/${groupId}/workspaces`, { workspace_id: workspaceId });
    await get().fetchDetail(groupId);
  },

  removeWorkspace: async (groupId, workspaceId) => {
    await api.delete(`/project-groups/${groupId}/workspaces/${workspaceId}`);
    await get().fetchDetail(groupId);
  },

  fetchStats: async (id) => {
    const data = await api.get(`/project-groups/${id}/stats`);
    set({ stats: data.data });
  },

  fetchMembers: async (id) => {
    const data = await api.get(`/project-groups/${id}/members`);
    set({ members: data.data });
  },

  fetchMilestones: async (id) => {
    const data = await api.get(`/project-groups/${id}/milestones`);
    set({ milestones: data.data });
  },

  fetchActivity: async (id) => {
    const data = await api.get(`/project-groups/${id}/activity`);
    set({ activity: data.data });
  },

  fetchTasks: async (id, params = {}) => {
    const data = await api.get(`/project-groups/${id}/tasks`, { params });
    set({ tasks: data.data });
  },
}));