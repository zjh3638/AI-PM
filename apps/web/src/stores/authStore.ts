import { create } from 'zustand';
import type { UserInfo } from '../types';
import api from '../api/client';

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  loading: boolean;
  loginLoading: boolean;
  login: (username: string, password: string, source?: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: null,
  loading: false,
  loginLoading: false,

  login: async (username: string, password: string, source = "LOCAL") => {
    set({ loginLoading: true });
    try {
      const result = await api.post('/auth/login', { username, password, source });
      const { access_token, user } = result.data;
      localStorage.setItem('token', access_token);
      set({ token: access_token, user, loginLoading: false });
    } catch {
      set({ loginLoading: false });
      throw new Error('登录失败，请检查用户名和密码');
    }
  },

  logout: async () => {
    // 通知后端（fire-and-forget，不阻塞 UI）
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    localStorage.removeItem('token');
    set({ token: null, user: null });
    window.location.href = '/login';
  },

  fetchUser: async () => {
    set({ loading: true });
    try {
      const result = await api.get('/auth/me');
      set({ user: result.data });
    } finally {
      set({ loading: false });
    }
  },
}));
