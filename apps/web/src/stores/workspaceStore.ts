import { create } from 'zustand';
import type { Workspace, WorkspaceMember } from '../types';
import api from '../api/client';

interface FocusSignal {
  type: string;
  level: 'red' | 'amber' | 'green';
  text: string;
  action: string;
  action_target: string;
}

interface WorkspaceState {
  workspaces: Workspace[];
  total: number;
  loading: boolean;
  current: Workspace | null;
  members: WorkspaceMember[];
  focusSignals: FocusSignal[];
  fetchList: (params?: Record<string, any>) => Promise<void>;
  fetchDetail: (id: string) => Promise<void>;
  fetchMembers: (id: string) => Promise<void>;
  fetchFocusSignals: (id: string) => Promise<void>;
  create: (data: Partial<Workspace>) => Promise<Workspace>;
  update: (id: string, data: Partial<Workspace>) => Promise<void>;
  archive: (id: string) => Promise<void>;
  addMember: (wsId: string, userId: string, role: string) => Promise<void>;
  updateMember: (wsId: string, memberId: string, role: string) => Promise<void>;
  removeMember: (wsId: string, memberId: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  total: 0,
  loading: false,
  current: null,
  members: [],
  focusSignals: [],

  fetchList: async (params = {}) => {
    set({ loading: true });
    const data = await api.get('/workspaces', { params });
    set({ workspaces: data.data, total: data.total, loading: false });
  },

  fetchDetail: async (id: string) => {
    const data = await api.get(`/workspaces/${id}`);
    set({ current: data.data });
  },

  fetchMembers: async (id: string) => {
    const data = await api.get(`/workspaces/${id}/members`);
    set({ members: data.data });
  },

  fetchFocusSignals: async (id: string) => {
    try {
      const data = await api.get(`/workspaces/${id}/focus-signals`);
      set({ focusSignals: data.data || [] });
    } catch { /* ignore */ }
  },

  create: async (payload) => {
    const data = await api.post('/workspaces', payload);
    return data.data;
  },

  update: async (id, payload) => {
    await api.patch(`/workspaces/${id}`, payload);
    await get().fetchDetail(id);
  },

  archive: async (id) => {
    await api.post(`/workspaces/${id}/archive`);
    await get().fetchList();
  },

  addMember: async (wsId, userId, role) => {
    await api.post(`/workspaces/${wsId}/members`, { user_id: userId, role });
    await get().fetchMembers(wsId);
  },

  updateMember: async (wsId, memberId, role) => {
    await api.patch(`/workspaces/${wsId}/members/${memberId}`, { role });
    await get().fetchMembers(wsId);
  },

  removeMember: async (wsId, memberId) => {
    await api.delete(`/workspaces/${wsId}/members/${memberId}`);
    await get().fetchMembers(wsId);
  },
}));
