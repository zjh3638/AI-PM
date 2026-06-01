import { create } from 'zustand';
import api from '../api/client';
import type { Milestone } from '../types';

interface MilestoneState {
  milestones: Milestone[];
  loading: boolean;
  fetchList(wsId: string): Promise<void>;
  create(wsId: string, data: Partial<Milestone>): Promise<Milestone>;
  update(wsId: string, msId: string, data: Partial<Milestone>): Promise<void>;
  remove(wsId: string, msId: string): Promise<void>;
}

export const useMilestoneStore = create<MilestoneState>((set, get) => ({
  milestones: [],
  loading: false,

  fetchList: async (wsId) => {
    set({ loading: true });
    const res: any = await api.get(`/workspaces/${wsId}/milestones`);
    set({ milestones: res.data || [], loading: false });
  },

  create: async (wsId, data) => {
    const res: any = await api.post(`/workspaces/${wsId}/milestones`, data);
    get().fetchList(wsId);
    return res.data;
  },

  update: async (wsId, msId, data) => {
    await api.patch(`/workspaces/${wsId}/milestones/${msId}`, data);
    get().fetchList(wsId);
  },

  remove: async (wsId, msId) => {
    await api.delete(`/workspaces/${wsId}/milestones/${msId}`);
    get().fetchList(wsId);
  },
}));
