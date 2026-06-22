import { create } from 'zustand';
import type { UserInfo } from '../types';
import api from '../api/client';

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  loading: boolean;
  login: (username: string, password: string, source?: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: null,
  loading: false,

  login: async (username: string, password: string, source = "LOCAL") => {
    const result = await api.post('/auth/login', { username, password, source });
    const { access_token, user } = result.data;
    localStorage.setItem('token', access_token);
    set({ token: access_token, user });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null });
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
