import { create } from 'zustand';
import type { ProjectReport, ReportType } from '../types';
import api from '../api/client';

/**
 * 报告 store —— 同时服务「项目」与「项目群」两种维度。
 * 调用方传入 basePath：
 *   项目:   /workspaces/{id}/reports
 *   项目群: /project-groups/{id}/reports
 */
interface ReportState {
  reports: ProjectReport[];
  loading: boolean;
  fetchList: (basePath: string, reportType?: ReportType) => Promise<void>;
  get: (basePath: string, reportId: string) => Promise<ProjectReport | null>;
  create: (basePath: string, data: { report_type: ReportType; title?: string }) => Promise<ProjectReport>;
  update: (basePath: string, reportId: string, data: { title?: string; content?: string }) => Promise<ProjectReport>;
  publish: (basePath: string, reportId: string) => Promise<void>;
  remove: (basePath: string, reportId: string) => Promise<void>;
  push: (basePath: string, reportId: string, channel: string) => Promise<void>;
}

export const useReportStore = create<ReportState>((set, get) => ({
  reports: [],
  loading: false,

  fetchList: async (basePath, reportType) => {
    set({ loading: true });
    try {
      const params: Record<string, string> = {};
      if (reportType) params.report_type = reportType;
      const res = await api.get(basePath, { params });
      set({ reports: res.data || [], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  get: async (basePath, reportId) => {
    const res = await api.get(`${basePath}/${reportId}`);
    return res.data || null;
  },

  create: async (basePath, data) => {
    const res = await api.post(basePath, data);
    await get().fetchList(basePath);
    return res.data;
  },

  update: async (basePath, reportId, data) => {
    const res = await api.patch(`${basePath}/${reportId}`, data);
    await get().fetchList(basePath);
    return res.data;
  },

  publish: async (basePath, reportId) => {
    await api.post(`${basePath}/${reportId}/publish`);
    await get().fetchList(basePath);
  },

  remove: async (basePath, reportId) => {
    await api.delete(`${basePath}/${reportId}`);
    await get().fetchList(basePath);
  },

  push: async (basePath, reportId, channel) => {
    await api.post(`${basePath}/${reportId}/push`, { channel });
  },
}));
