import { create } from 'zustand';
import api from '../api/client';

export interface Doc {
  id: string; title: string; content: string; doc_type: string;
  path: string; version: number; tags: string[];
  created_at: string; updated_at: string; author_name: string;
}

interface DocState {
  docs: Doc[]; current: Doc | null; loading: boolean;
  fetchList(wsId: string): Promise<void>;
  fetchDetail(wsId: string, docId: string): Promise<void>;
  create(wsId: string, data: any): Promise<Doc>;
  update(wsId: string, docId: string, data: any): Promise<void>;
  remove(wsId: string, docId: string): Promise<void>;
}

export const useDocumentStore = create<DocState>((set, get) => ({
  docs: [], current: null, loading: false,
  fetchList: async (wsId) => {
    set({ loading: true });
    const res: any = await api.get(`/workspaces/${wsId}/docs`);
    set({ docs: res.data || [], loading: false });
  },
  fetchDetail: async (wsId, docId) => {
    const res: any = await api.get(`/workspaces/${wsId}/docs/${docId}`);
    set({ current: res.data });
  },
  create: async (wsId, data) => {
    const res: any = await api.post(`/workspaces/${wsId}/docs`, data);
    get().fetchList(wsId);
    return res.data;
  },
  update: async (wsId, docId, data) => {
    await api.patch(`/workspaces/${wsId}/docs/${docId}`, data);
    get().fetchList(wsId);
  },
  remove: async (wsId, docId) => {
    await api.delete(`/workspaces/${wsId}/docs/${docId}`);
    get().fetchList(wsId);
  },
}));
