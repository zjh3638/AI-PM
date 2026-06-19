import type { Milestone } from '../../types';

export function getFileIcon(mimeType: string): string {
  if (!mimeType) return '📎';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📕';
  if (mimeType.startsWith('text/')) return '📝';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('compress') || mimeType.includes('tar') || mimeType.includes('gzip')) return '📦';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  return '📎';
}

export function buildDependencyChain(milestones: Milestone[]): Milestone[] {
  const visited = new Set<string>();
  const result: Milestone[] = [];
  function visit(ms: Milestone) {
    if (visited.has(ms.id)) return;
    visited.add(ms.id);
    const dep = milestones.find(m => m.id === ms.depends_on_id);
    if (dep) visit(dep);
    result.push(ms);
  }
  milestones.forEach(visit);
  return result;
}

export function isOverdue(ms: Milestone): boolean {
  if (ms.phase === 'DONE') return false;
  if (!ms.end_date) return false;
  return new Date(ms.end_date) < new Date();
}
