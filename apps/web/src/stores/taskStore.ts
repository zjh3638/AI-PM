import { create } from 'zustand';
import type { Task, Epic, TaskPermissions } from '../types';
import api from '../api/client';

interface TaskState {
  tasks: Task[];
  total: number;
  loading: boolean;
  current: Task | null;
  currentPermissions: TaskPermissions | null;
  children: Task[];
  epics: Epic[];
  kanban: Record<string, Task[]>;
  kanbanGroupBy: string;

  fetchList: (wsId: string, params?: Record<string, any>) => Promise<void>;
  fetchDetail: (wsId: string, taskId: string) => Promise<void>;
  fetchChildren: (wsId: string, taskId: string) => Promise<void>;
  fetchEpics: (wsId: string) => Promise<void>;
  fetchKanban: (wsId: string, groupBy?: string, taskType?: string) => Promise<void>;
  fetchPermissions: (wsId: string, taskId: string) => Promise<TaskPermissions>;
  create: (wsId: string, data: Partial<Task>) => Promise<Task>;
  update: (wsId: string, taskId: string, data: Partial<Task>) => Promise<void>;
  remove: (wsId: string, taskId: string) => Promise<void>;
  moveTask: (wsId: string, taskId: string, newStatus: string, sortOrder: number) => Promise<void>;
  advancePhase: (wsId: string, taskId: string, content?: string) => Promise<Task>;
  splitStory: (wsId: string, taskId: string, children: Partial<Task>[]) => Promise<Task[]>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  total: 0,
  loading: false,
  current: null,
  currentPermissions: null,
  children: [],
  epics: [],
  kanban: {},
  kanbanGroupBy: 'status',

  fetchList: async (wsId, params = {}) => {
    set({ loading: true });
    const result = await api.get(`/workspaces/${wsId}/tasks`, { params });
    set({ tasks: result.data, total: result.total, loading: false });
  },

  fetchDetail: async (wsId, taskId) => {
    const result = await api.get(`/workspaces/${wsId}/tasks/${taskId}`);
    set({ current: result.data, currentPermissions: result.data.permissions || null });
  },

  fetchChildren: async (wsId, taskId) => {
    const result = await api.get(`/workspaces/${wsId}/tasks/${taskId}/children`);
    set({ children: result.data });
  },

  fetchEpics: async (wsId) => {
    const result = await api.get(`/workspaces/${wsId}/epics`);
    set({ epics: result.data });
  },

  fetchKanban: async (wsId, groupBy = 'status', taskType = '') => {
    const params: Record<string, string> = { group_by: groupBy };
    if (taskType) params.task_type = taskType;
    const result = await api.get(`/workspaces/${wsId}/kanban`, { params });
    set({ kanban: result.data, kanbanGroupBy: groupBy });
  },

  fetchPermissions: async (wsId, taskId) => {
    const result = await api.get(`/workspaces/${wsId}/tasks/${taskId}/permissions`);
    set({ currentPermissions: result.data });
    return result.data;
  },

  create: async (wsId, payload) => {
    const result = await api.post(`/workspaces/${wsId}/tasks`, payload);
    await get().fetchKanban(wsId, get().kanbanGroupBy);
    await get().fetchList(wsId);
    return result.data;
  },

  update: async (wsId, taskId, payload) => {
    await api.patch(`/workspaces/${wsId}/tasks/${taskId}`, payload);
    await get().fetchKanban(wsId, get().kanbanGroupBy);
    await get().fetchList(wsId);
  },

  remove: async (wsId, taskId) => {
    await api.delete(`/workspaces/${wsId}/tasks/${taskId}`);
    await get().fetchKanban(wsId, get().kanbanGroupBy);
    await get().fetchList(wsId);
  },

  moveTask: async (wsId, taskId, newStatus, sortOrder) => {
    await api.patch(`/workspaces/${wsId}/tasks/${taskId}/move`, { new_status: newStatus, sort_order: sortOrder });
    await get().fetchKanban(wsId, get().kanbanGroupBy);
  },

  advancePhase: async (wsId, taskId, content = '') => {
    const result = await api.post(`/workspaces/${wsId}/tasks/${taskId}/advance-phase`, { content });
    await get().fetchKanban(wsId, 'phase');
    return result.data;
  },

  splitStory: async (wsId, taskId, children) => {
    const result = await api.post(`/workspaces/${wsId}/tasks/${taskId}/split`, { children });
    await get().fetchKanban(wsId, get().kanbanGroupBy);
    await get().fetchChildren(wsId, taskId);
    return result.data;
  },
}));
