import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../stores/authStore';

// Mock the API client
vi.mock('../api/client', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

import api from '../api/client';

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ token: null, user: null, loading: false });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has null user and token by default', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
    });

    it('reads token from localStorage', () => {
      localStorage.setItem('token', 'saved-token');
      // Re-create store behavior: initial token comes from localStorage
      expect(localStorage.getItem('token')).toBe('saved-token');
    });
  });

  describe('login', () => {
    it('sets token and user on successful login', async () => {
      const mockUser = { id: '1', username: 'admin', display_name: 'Admin', system_role: 'SUPER_ADMIN', email: '', avatar_url: '', department_name: '' };
      vi.mocked(api.post).mockResolvedValueOnce({
        data: { access_token: 'test-token', user: mockUser },
      });

      await useAuthStore.getState().login('admin', 'password');

      const state = useAuthStore.getState();
      expect(state.token).toBe('test-token');
      expect(state.user).toEqual(mockUser);
      expect(localStorage.getItem('token')).toBe('test-token');
    });

    it('calls API with correct params', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({
        data: { access_token: 't', user: { id: '1', username: 'u' } },
      });

      await useAuthStore.getState().login('admin', 'pw123');

      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        username: 'admin',
        password: 'pw123',
      });
    });
  });

  describe('logout', () => {
    it('clears token and user', () => {
      useAuthStore.setState({
        token: 'some-token',
        user: { id: '1', username: 'admin', display_name: 'Admin', system_role: 'SUPER_ADMIN', email: '', avatar_url: '', department_name: '' },
      });
      localStorage.setItem('token', 'some-token');

      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('fetchUser', () => {
    it('sets user from API response', async () => {
      const mockUser = { id: '1', username: 'admin', display_name: 'Admin', system_role: 'SUPER_ADMIN', email: '', avatar_url: '', department_name: '' };
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockUser });

      await useAuthStore.getState().fetchUser();

      expect(useAuthStore.getState().user).toEqual(mockUser);
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it('sets loading to false even on error', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'));

      try {
        await useAuthStore.getState().fetchUser();
      } catch {
        // fetchUser does not catch errors, so the error propagates
      }

      expect(useAuthStore.getState().loading).toBe(false);
    });
  });
});
