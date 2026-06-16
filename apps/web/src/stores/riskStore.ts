import { create } from 'zustand';
import type { Risk, RiskType, RiskStatus } from '../types';
import api from '../api/client';

interface RiskState {
  risks: Risk[];
  loading: boolean;
  filter: { status?: RiskStatus; risk_type?: RiskType; milestone_id?: string };

  setFilter: (filter: Partial<RiskState['filter']>) => void;
  fetchList: (workspaceId: string) => Promise<void>;
  create: (workspaceId: string, data: Partial<Risk>) => Promise<void>;
  update: (workspaceId: string, riskId: string, data: Partial<Risk>) => Promise<void>;
  startMitigation: (workspaceId: string, riskId: string) => Promise<void>;
  close: (workspaceId: string, riskId: string) => Promise<void>;
}

export const useRiskStore = create<RiskState>((set, get) => ({
  risks: [],
  loading: false,
  filter: {},

  setFilter: (filter) => {
    set((s) => ({ filter: { ...s.filter, ...filter } }));
  },

  fetchList: async (workspaceId: string) => {
    set({ loading: true });
    const { filter } = get();
    const params: Record<string, string> = {};
    if (filter.status) params.status = filter.status;
    if (filter.risk_type) params.risk_type = filter.risk_type;
    if (filter.milestone_id) params.milestone_id = filter.milestone_id;

    const res = await api.get(`/workspaces/${workspaceId}/risks`, { params });
    set({ risks: res.data || [], loading: false });
  },

  create: async (workspaceId: string, data: Partial<Risk>) => {
    await api.post(`/workspaces/${workspaceId}/risks`, data);
    await get().fetchList(workspaceId);
  },

  update: async (workspaceId: string, riskId: string, data: Partial<Risk>) => {
    await api.patch(`/workspaces/${workspaceId}/risks/${riskId}`, data);
    await get().fetchList(workspaceId);
  },

  startMitigation: async (workspaceId: string, riskId: string) => {
    await api.post(`/workspaces/${workspaceId}/risks/${riskId}/start-mitigation`);
    await get().fetchList(workspaceId);
  },

  close: async (workspaceId: string, riskId: string) => {
    await api.post(`/workspaces/${workspaceId}/risks/${riskId}/close`);
    await get().fetchList(workspaceId);
  },
}));
