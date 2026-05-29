import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTaskStore } from '../stores/taskStore';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../api/client';

describe('taskStore', () => {
  beforeEach(() => {
    useTaskStore.setState({
      tasks: [],
      total: 0,
      loading: false,
      current: null,
      children: [],
      epics: [],
      kanban: {},
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has empty collections', () => {
      const state = useTaskStore.getState();
      expect(state.tasks).toEqual([]);
      expect(state.children).toEqual([]);
      expect(state.epics).toEqual([]);
      expect(state.kanban).toEqual({});
      expect(state.current).toBeNull();
      expect(state.total).toBe(0);
      expect(state.loading).toBe(false);
    });
  });

  describe('fetchList', () => {
    it('sets tasks from API', async () => {
      const mockTasks = [{ id: '1', title: 'Task 1' }];
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockTasks, total: 1 });

      await useTaskStore.getState().fetchList('ws1', { status: 'TODO' });

      expect(api.get).toHaveBeenCalledWith('/workspaces/ws1/tasks', { params: { status: 'TODO' } });
      expect(useTaskStore.getState().tasks).toEqual(mockTasks);
      expect(useTaskStore.getState().total).toBe(1);
      expect(useTaskStore.getState().loading).toBe(false);
    });
  });

  describe('fetchDetail', () => {
    it('sets current task', async () => {
      const mockTask = { id: '1', title: 'My Task' };
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockTask });

      await useTaskStore.getState().fetchDetail('ws1', '1');

      expect(api.get).toHaveBeenCalledWith('/workspaces/ws1/tasks/1');
      expect(useTaskStore.getState().current).toEqual(mockTask);
    });
  });

  describe('fetchChildren', () => {
    it('sets children from API', async () => {
      const mockChildren = [{ id: '2', title: 'Subtask 1' }];
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockChildren });

      await useTaskStore.getState().fetchChildren('ws1', '1');

      expect(api.get).toHaveBeenCalledWith('/workspaces/ws1/tasks/1/children');
      expect(useTaskStore.getState().children).toEqual(mockChildren);
    });
  });

  describe('fetchEpics', () => {
    it('sets epics from API', async () => {
      const mockEpics = [{ id: '1', title: 'Epic 1', total_stories: 3, done_stories: 1 }];
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockEpics });

      await useTaskStore.getState().fetchEpics('ws1');

      expect(api.get).toHaveBeenCalledWith('/workspaces/ws1/epics');
      expect(useTaskStore.getState().epics).toEqual(mockEpics);
    });
  });

  describe('fetchKanban', () => {
    it('sets kanban board from API', async () => {
      const mockKanban = {
        TODO: [{ id: '1', title: 'Todo' }],
        IN_PROGRESS: [],
        DONE: [],
      };
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockKanban });

      await useTaskStore.getState().fetchKanban('ws1');

      expect(api.get).toHaveBeenCalledWith('/workspaces/ws1/kanban');
      expect(useTaskStore.getState().kanban).toEqual(mockKanban);
    });
  });

  describe('create', () => {
    it('calls API and returns created task', async () => {
      const newTask = { id: '2', title: 'New Task' };
      vi.mocked(api.post).mockResolvedValueOnce({ data: newTask });

      const result = await useTaskStore.getState().create('ws1', { title: 'New Task', priority: 'HIGH' });

      expect(api.post).toHaveBeenCalledWith('/workspaces/ws1/tasks', {
        title: 'New Task', priority: 'HIGH',
      });
      expect(result).toEqual(newTask);
    });
  });

  describe('update', () => {
    it('calls API and refetches detail', async () => {
      vi.mocked(api.patch).mockResolvedValueOnce({});
      const updatedTask = { id: '1', title: 'Updated Task' };
      vi.mocked(api.get).mockResolvedValueOnce({ data: updatedTask });

      await useTaskStore.getState().update('ws1', '1', { title: 'Updated Task' });

      expect(api.patch).toHaveBeenCalledWith('/workspaces/ws1/tasks/1', { title: 'Updated Task' });
      expect(useTaskStore.getState().current).toEqual(updatedTask);
    });
  });

  describe('remove', () => {
    it('calls API and refetches list', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({});
      vi.mocked(api.get).mockResolvedValueOnce({ data: [], total: 0 });

      await useTaskStore.getState().remove('ws1', '1');

      expect(api.delete).toHaveBeenCalledWith('/workspaces/ws1/tasks/1');
      expect(useTaskStore.getState().tasks).toEqual([]);
    });
  });

  describe('moveTask', () => {
    it('calls API and refetches kanban', async () => {
      vi.mocked(api.patch).mockResolvedValueOnce({});
      const mockKanban = { TODO: [], IN_PROGRESS: [{ id: '1', title: 'Moved' }], DONE: [] };
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockKanban });

      await useTaskStore.getState().moveTask('ws1', '1', 'IN_PROGRESS', 3);

      expect(api.patch).toHaveBeenCalledWith('/workspaces/ws1/tasks/1/move', {
        new_status: 'IN_PROGRESS', sort_order: 3,
      });
      expect(useTaskStore.getState().kanban).toEqual(mockKanban);
    });
  });
});
