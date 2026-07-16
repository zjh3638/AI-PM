import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaceStore } from '../stores/workspaceStore';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../api/client';

describe('workspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspaces: [],
      total: 0,
      loading: false,
      current: null,
      members: [],
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has empty workspaces and members', () => {
      const state = useWorkspaceStore.getState();
      expect(state.workspaces).toEqual([]);
      expect(state.members).toEqual([]);
      expect(state.current).toBeNull();
      expect(state.total).toBe(0);
    });
  });

  describe('fetchList', () => {
    it('sets workspaces from API', async () => {
      const mockWs = [{ id: '1', name: 'WS1', key: 'WS1' }];
      vi.mocked(api.get).mockResolvedValueOnce({ code: 0, message: 'ok', data: mockWs, total: 1 });

      await useWorkspaceStore.getState().fetchList({ keyword: 'test' });

      expect(api.get).toHaveBeenCalledWith('/workspaces', { params: { keyword: 'test' } });
      expect(useWorkspaceStore.getState().workspaces).toEqual(mockWs);
      expect(useWorkspaceStore.getState().total).toBe(1);
      expect(useWorkspaceStore.getState().loading).toBe(false);
    });
  });

  describe('fetchDetail', () => {
    it('sets current workspace', async () => {
      const mockWs = { id: '1', name: 'MyWS', key: 'MY-WS' };
      vi.mocked(api.get).mockResolvedValueOnce({ code: 0, message: 'ok', data: mockWs });

      await useWorkspaceStore.getState().fetchDetail('1');

      expect(api.get).toHaveBeenCalledWith('/workspaces/1');
      expect(useWorkspaceStore.getState().current).toEqual(mockWs);
    });
  });

  describe('fetchMembers', () => {
    it('sets members from API', async () => {
      const mockMembers = [{ id: 'm1', user_id: 'u1', role: 'MEMBER' }];
      vi.mocked(api.get).mockResolvedValueOnce({ code: 0, message: 'ok', data: mockMembers });

      await useWorkspaceStore.getState().fetchMembers('ws1');

      expect(api.get).toHaveBeenCalledWith('/workspaces/ws1/members');
      expect(useWorkspaceStore.getState().members).toEqual(mockMembers);
    });
  });

  describe('create', () => {
    it('calls API and returns created workspace', async () => {
      const newWs = { id: '2', name: 'NewWS', key: 'NEW' };
      vi.mocked(api.post).mockResolvedValueOnce({ code: 0, message: 'ok', data: newWs });

      const result = await useWorkspaceStore.getState().create({
        name: 'NewWS',
        key: 'NEW',
      });

      expect(api.post).toHaveBeenCalledWith('/workspaces', { name: 'NewWS', key: 'NEW' });
      expect(result).toEqual(newWs);
    });
  });

  describe('update', () => {
    it('calls API and refetches detail', async () => {
      vi.mocked(api.patch).mockResolvedValueOnce({ code: 0, message: 'ok', data: null });
      const mockWs = { id: '1', name: 'Updated' };
      vi.mocked(api.get).mockResolvedValueOnce({ code: 0, message: 'ok', data: mockWs });

      await useWorkspaceStore.getState().update('1', { name: 'Updated' });

      expect(api.patch).toHaveBeenCalledWith('/workspaces/1', { name: 'Updated' });
      expect(useWorkspaceStore.getState().current).toEqual(mockWs);
    });
  });

  describe('archive', () => {
    it('calls API and refetches list', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ code: 0, message: 'ok', data: null });
      vi.mocked(api.get).mockResolvedValueOnce({ code: 0, message: 'ok', data: [], total: 0 });

      await useWorkspaceStore.getState().archive('1');

      expect(api.post).toHaveBeenCalledWith('/workspaces/1/archive');
      expect(useWorkspaceStore.getState().workspaces).toEqual([]);
    });
  });

  describe('addMember', () => {
    it('calls API and refetches members', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ code: 0, message: 'ok', data: null });
      const mockMembers = [{ id: 'm1', role: 'MEMBER' }];
      vi.mocked(api.get).mockResolvedValueOnce({ code: 0, message: 'ok', data: mockMembers });

      await useWorkspaceStore.getState().addMember('ws1', 'u1', 'MEMBER');

      expect(api.post).toHaveBeenCalledWith('/workspaces/ws1/members', {
        user_id: 'u1', role: 'MEMBER',
      });
      expect(useWorkspaceStore.getState().members).toEqual(mockMembers);
    });
  });

  describe('updateMember', () => {
    it('calls API and refetches members', async () => {
      vi.mocked(api.patch).mockResolvedValueOnce({ code: 0, message: 'ok', data: null });
      vi.mocked(api.get).mockResolvedValueOnce({ code: 0, message: 'ok', data: [] });

      await useWorkspaceStore.getState().updateMember('ws1', 'm1', 'MANAGER');

      expect(api.patch).toHaveBeenCalledWith('/workspaces/ws1/members/m1', { role: 'MANAGER' });
    });
  });

  describe('removeMember', () => {
    it('calls API and refetches members', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({ code: 0, message: 'ok', data: null });
      vi.mocked(api.get).mockResolvedValueOnce({ code: 0, message: 'ok', data: [] });

      await useWorkspaceStore.getState().removeMember('ws1', 'm1');

      expect(api.delete).toHaveBeenCalledWith('/workspaces/ws1/members/m1');
    });
  });
});
