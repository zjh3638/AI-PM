import { create } from 'zustand';
import api from '../api/client';
import type { Iteration } from '../types';

interface IterationState {
  iterations: Iteration[];
  current: Iteration | null;
  burndown: any;
  loading: boolean;
  fetchList(wsId: string, params?: { status?: string }): Promise<void>;
  fetchDetail(wsId: string, iterId: string): Promise<void>;
  create(wsId: string, data: Partial<Iteration>): Promise<Iteration>;
  update(wsId: string, iterId: string, data: Partial<Iteration>): Promise<void>;
  startIter(wsId: string, iterId: string): Promise<void>;
  closeIter(wsId: string, iterId: string): Promise<void>;
  fetchBurndown(wsId: string, iterId: string): Promise<void>;
}

export const useIterationStore = create<IterationState>((set, get) => ({
  iterations: [],
  current: null,
  burndown: null,
  loading: false,

  fetchList: async (wsId, params) => {
    set({ loading: true });
    const res: any = await api.get(`/workspaces/${wsId}/iterations`, { params });
    set({ iterations: res.data || [], loading: false });
  },

  fetchDetail: async (wsId, iterId) => {
    const res: any = await api.get(`/workspaces/${wsId}/iterations/${iterId}`);
    set({ current: res.data });
    return res.data;
  },

  create: async (wsId, data) => {
    const res: any = await api.post(`/workspaces/${wsId}/iterations`, data);
    const it = res.data;
    set((s) => ({ iterations: [...s.iterations, it] }));
    return it;
  },

  update: async (wsId, iterId, data) => {
    await api.patch(`/workspaces/${wsId}/iterations/${iterId}`, data);
    get().fetchList(wsId);
  },

  startIter: async (wsId, iterId) => {
    await api.post(`/workspaces/${wsId}/iterations/${iterId}/start`);
    get().fetchList(wsId);
  },

  closeIter: async (wsId, iterId) => {
    await api.post(`/workspaces/${wsId}/iterations/${iterId}/close`);
    get().fetchList(wsId);
  },

  fetchBurndown: async (wsId, iterId) => {
    const res: any = await api.get(`/workspaces/${wsId}/iterations/${iterId}/burndown`);
    set({ burndown: res.data });
  },
}));
