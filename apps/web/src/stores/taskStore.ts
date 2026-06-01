import { create } from 'zustand';
import type { Task, Epic } from '../types';
import api from '../api/client';

interface TaskState {
  tasks: Task[];
  total: number;
  loading: boolean;
  current: Task | null;
  children: Task[];
  epics: Epic[];
  kanban: Record<string, Task[]>;

  fetchList: (wsId: string, params?: Record<string, any>) => Promise<void>;
  fetchDetail: (wsId: string, taskId: string) => Promise<void>;
  fetchChildren: (wsId: string, taskId: string) => Promise<void>;
  fetchEpics: (wsId: string) => Promise<void>;
  fetchKanban: (wsId: string) => Promise<void>;
  create: (wsId: string, data: Partial<Task>) => Promise<Task>;
  update: (wsId: string, taskId: string, data: Partial<Task>) => Promise<void>;
  remove: (wsId: string, taskId: string) => Promise<void>;
  moveTask: (wsId: string, taskId: string, newStatus: string, sortOrder: number) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  total: 0,
  loading: false,
  current: null,
  children: [],
  epics: [],
  kanban: {},

  fetchList: async (wsId, params = {}) => {
    set({ loading: true });
    const result = await api.get(`/workspaces/${wsId}/tasks`, { params });
    set({ tasks: result.data, total: result.total, loading: false });
  },

  fetchDetail: async (wsId, taskId) => {
    const result = await api.get(`/workspaces/${wsId}/tasks/${taskId}`);
    set({ current: result.data });
  },

  fetchChildren: async (wsId, taskId) => {
    const result = await api.get(`/workspaces/${wsId}/tasks/${taskId}/children`);
    set({ children: result.data });
  },

  fetchEpics: async (wsId) => {
    const result = await api.get(`/workspaces/${wsId}/epics`);
    set({ epics: result.data });
  },

  fetchKanban: async (wsId) => {
    const result = await api.get(`/workspaces/${wsId}/kanban`);
    set({ kanban: result.data });
  },

  create: async (wsId, payload) => {
    const result = await api.post(`/workspaces/${wsId}/tasks`, payload);
    await get().fetchKanban(wsId);
    await get().fetchList(wsId);
    return result.data;
  },

  update: async (wsId, taskId, payload) => {
    await api.patch(`/workspaces/${wsId}/tasks/${taskId}`, payload);
    await get().fetchKanban(wsId);
    await get().fetchList(wsId);
  },

  remove: async (wsId, taskId) => {
    await api.delete(`/workspaces/${wsId}/tasks/${taskId}`);
    await get().fetchKanban(wsId);
    await get().fetchList(wsId);
  },

  moveTask: async (wsId, taskId, newStatus, sortOrder) => {
    await api.patch(`/workspaces/${wsId}/tasks/${taskId}/move`, { new_status: newStatus, sort_order: sortOrder });
    await get().fetchKanban(wsId);
  },
}));
