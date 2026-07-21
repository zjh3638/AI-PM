import { create } from 'zustand';
import type { Task, TaskTemplate } from '../types';
import api from '../api/client';

/** 从模板创建任务的入参 */
export interface CreateFromTemplatePayload {
  variables?: Record<string, string>;
  milestone_id?: string | null;
  iteration_id?: string | null;
  assignee_id?: string | null;
  due_date?: string | null;
  work_item_overrides?: Record<string, { assignee_id?: string | null; due_date?: string | null }>;
}

interface TemplateState {
  templates: TaskTemplate[];
  loading: boolean;

  fetchTemplates: (wsId: string, category?: string) => Promise<void>;
  createTemplate: (wsId: string, data: Partial<TaskTemplate>) => Promise<TaskTemplate>;
  updateTemplate: (wsId: string, templateId: string, data: Partial<TaskTemplate>) => Promise<TaskTemplate>;
  deleteTemplate: (wsId: string, templateId: string) => Promise<void>;
  createTaskFromTemplate: (wsId: string, templateId: string, payload: CreateFromTemplatePayload) => Promise<Task>;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  loading: false,

  fetchTemplates: async (wsId, category) => {
    set({ loading: true });
    try {
      const params: Record<string, string> = {};
      if (category) params.category = category;
      const result = await api.get(`/workspaces/${wsId}/task-templates`, { params });
      set({ templates: result.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createTemplate: async (wsId, data) => {
    const result = await api.post(`/workspaces/${wsId}/task-templates`, data);
    await get().fetchTemplates(wsId);
    return result.data;
  },

  updateTemplate: async (wsId, templateId, data) => {
    const result = await api.patch(`/workspaces/${wsId}/task-templates/${templateId}`, data);
    await get().fetchTemplates(wsId);
    return result.data;
  },

  deleteTemplate: async (wsId, templateId) => {
    await api.delete(`/workspaces/${wsId}/task-templates/${templateId}`);
    await get().fetchTemplates(wsId);
  },

  createTaskFromTemplate: async (wsId, templateId, payload) => {
    const result = await api.post(`/workspaces/${wsId}/task-templates/${templateId}/create-task`, payload);
    return result.data;
  },
}));
