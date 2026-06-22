import MilestoneSidebar from './MilestoneSidebar';
import IterationSidebar from './IterationSidebar';
import type { Milestone } from '../../../types';
import type { WorkspaceMode } from '../hooks/useWorkspaceMode';

export default function TrackSidebar({
  mode,
  onEditMilestone,
}: {
  mode: WorkspaceMode;
  onEditMilestone?: (ms: Milestone) => void;
}) {
  if (mode.isFull) {
    return (
      <IterationSidebar
        selectedId={mode.selectedTrackId}
        onSelect={mode.setSelectedTrackId}
      />
    );
  }
  return (
    <MilestoneSidebar
      selectedId={mode.selectedTrackId}
      onSelect={mode.setSelectedTrackId}
      onEdit={onEditMilestone || (() => {})}
    />
  );
}
