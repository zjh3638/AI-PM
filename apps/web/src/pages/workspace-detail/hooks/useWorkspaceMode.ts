import { useState, useMemo } from 'react';
import { useWorkspaceStore } from '../../../stores/workspaceStore';

export type WorkspaceType = 'PROJECT' | 'TOPIC';

export type TrackKey = 'iteration_id' | 'milestone_id';

export interface TabConfig {
  key: string;
  label: string;
}

export interface ViewConfig {
  key: string;
  label: string;
}

export interface WorkspaceMode {
  type: WorkspaceType;
  isFull: boolean;
  trackKey: TrackKey;
  trackLabel: string;
  selectedTrackId: string;
  setSelectedTrackId: (id: string) => void;
  tabs: TabConfig[];
  views: ViewConfig[];
}

const PROJECT_TABS: TabConfig[] = [
  { key: 'backlog', label: '需求池' },
  { key: 'tasks', label: '任务看板' },
  { key: 'kb', label: '知识库' },
  { key: 'iterations', label: '迭代' },
  { key: 'members', label: '成员' },
  { key: 'risks', label: '风险管理' },
  { key: 'reports', label: '报表' },
];

const TOPIC_TABS: TabConfig[] = [
  { key: 'tasks', label: '任务看板' },
  { key: 'kb', label: '知识库' },
  { key: 'members', label: '成员' },
  { key: 'risks', label: '风险管理' },
];

const PROJECT_VIEWS: ViewConfig[] = [
  { key: 'kanban', label: '看板' },
  { key: 'list', label: '列表' },
];

const TOPIC_VIEWS: ViewConfig[] = [
  { key: 'kanban', label: '看板(状态)' },
  { key: 'kanban-ms', label: '看板(里程碑)' },
  { key: 'list', label: '列表' },
];

export function useWorkspaceMode(): WorkspaceMode {
  const current = useWorkspaceStore((s) => s.current);
  const type: WorkspaceType = (current?.type as WorkspaceType) || 'PROJECT';
  const isFull = type === 'PROJECT';

  const [selectedIteration, setSelectedIteration] = useState<string>('');
  const [selectedMilestone, setSelectedMilestone] = useState<string>('');

  return useMemo<WorkspaceMode>(() => {
    const trackKey: TrackKey = isFull ? 'iteration_id' : 'milestone_id';
    const trackLabel = isFull ? '迭代' : '里程碑';
    const selectedTrackId = isFull ? selectedIteration : selectedMilestone;
    const setSelectedTrackId = isFull ? setSelectedIteration : setSelectedMilestone;

    return {
      type,
      isFull,
      trackKey,
      trackLabel,
      selectedTrackId,
      setSelectedTrackId,
      tabs: isFull ? PROJECT_TABS : TOPIC_TABS,
      views: isFull ? PROJECT_VIEWS : TOPIC_VIEWS,
    };
  }, [type, isFull, selectedIteration, selectedMilestone]);
}
