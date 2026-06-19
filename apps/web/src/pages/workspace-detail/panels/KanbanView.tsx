import { useEffect, useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTaskStore } from '../../../stores/taskStore';
import { useAuthStore } from '../../../stores/authStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { useMilestoneStore } from '../../../stores/milestoneStore';
import { MILESTONE_PHASE_LABELS, MILESTONE_PHASE_COLORS } from '../../../types';
import type { Task } from '../../../types';
import api from '../../../api/client';

export default function KanbanView({ onCreateTask, onEditTask, scopeFilter, isFull, milestoneMode }: { onCreateTask: (status: string, phase?: string, parentStoryId?: string) => void; onEditTask: (task: Task) => void; scopeFilter: string; isFull: boolean; milestoneMode?: boolean }) {
  const { id: wsId } = useParams<{ id: string }>();
  const { moveTask, update, advancePhase, returnPhase, kanbanVersion } = useTaskStore();
  const { user } = useAuthStore();
  const { members, current } = useWorkspaceStore();
  const { milestones } = useMilestoneStore();
  const strictGate = current?.strict_gate !== false;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = useState<string | null>(null);

  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [childMap, setChildMap] = useState<Record<string, any[]>>({});

  const [kanban, setKanban] = useState<Record<string, Task[]>>({});
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'phase' | 'status'>('status');
  const groupBy = milestoneMode ? 'milestone' : (isFull ? viewMode : 'status');

  const fetchKanbanData = useCallback(async (wsId: string, groupBy: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { group_by: groupBy };
      if (isFull && !milestoneMode) params.task_type = 'STORY';
      const result = await api.get(`/workspaces/${wsId}/kanban`, { params });
      setKanban(result.data || {});
    } catch { /* ignore */ }
    setLoading(false);
  }, [isFull, milestoneMode]);

  useEffect(() => { if (wsId) fetchKanbanData(wsId, groupBy); }, [wsId, groupBy, kanbanVersion]);

  const toggleExpand = async (storyId: string) => {
    const next = new Set(expandedStories);
    if (next.has(storyId)) { next.delete(storyId); setExpandedStories(next); return; }
    next.add(storyId); setExpandedStories(next);
    if (!childMap[storyId] && wsId) {
      try {
        const res: any = await api.get(`/workspaces/${wsId}/tasks`, { params: { parent_id: storyId, page_size: 100 } });
        setChildMap(prev => ({ ...prev, [storyId]: res.data || [] }));
      } catch { /* ignore */ }
    }
  };

  const isMgr = user ? members.some(m => m.user_id === user.id && (m.role === 'OWNER' || m.role === 'MANAGER')) || members.length === 0 : false;
  const canDrag = (_task: Task): boolean => true;

  const fullStatusColDefs: { key: string; title: string; icon?: string }[] = [
    { key: 'TODO', title: '待办' },
    { key: 'IN_PROGRESS', title: '进行中' },
    { key: 'IN_REVIEW', title: '待 Review' },
    { key: 'DONE', title: '已完成' },
  ];
  const topicStatusColDefs: { key: string; title: string; icon?: string }[] = [
    { key: 'TODO', title: '待办' },
    { key: 'IN_PROGRESS', title: '进行中' },
    { key: 'DONE', title: '已完成' },
  ];
  const allPhaseColDefs: { key: string; title: string; icon?: string; deliverables: string }[] = [
    { key: 'BACKLOG', title: '需求池', icon: '📥', deliverables: '设置需求负责人、规划迭代' },
    { key: 'PLAN', title: '需求规划', icon: '📋', deliverables: '需求PRD' },
    { key: 'DESIGN', title: '方案设计', icon: '🎨', deliverables: '设计文档' },
    { key: 'DEVELOPMENT', title: '开发实现', icon: '💻', deliverables: 'Story自测报告' },
    { key: 'TESTING', title: '测试验证', icon: '🧪', deliverables: '测试报告' },
    { key: 'RELEASE', title: '发布上线', icon: '🚀', deliverables: '需求评价（五星打分、说明性评价）' },
  ];

  const phaseColDefs = allPhaseColDefs;
  const colDefs = milestoneMode
    ? Object.keys(kanban).map(key => {
        const meta = (kanban[key] || []).find((t: any) => t._col_meta);
        return { key, title: (meta as any)?._col_title || key, phase: (meta as any)?._col_phase || '', color: (meta as any)?._col_color };
      })
    : (isFull ? (viewMode === 'phase' ? phaseColDefs : fullStatusColDefs) : topicStatusColDefs);

  const statusBadge: Record<string, { bg: string; label: string }> = {
    TODO: { bg: 'transparent', label: '待办' },
    IN_PROGRESS: { bg: 'var(--blue-100)', label: '进行中' },
    IN_REVIEW: { bg: 'var(--amber-100)', label: '审核中' },
    DONE: { bg: 'var(--green-100)', label: '✓' },
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handleDragStart = (e: React.DragEvent, taskId: string, colKey: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.setData('fromKey', colKey);
  };

  const [gateOpen, setGateOpen] = useState<string | null>(null);
  const [gateNote, setGateNote] = useState('');
  const [dragError, setDragError] = useState('');

  const statusCycle: Record<string, string> = isFull
    ? { TODO: 'IN_PROGRESS', IN_PROGRESS: 'IN_REVIEW', IN_REVIEW: 'DONE', DONE: 'TODO' }
    : { TODO: 'IN_PROGRESS', IN_PROGRESS: 'DONE', DONE: 'TODO' };

  const handleStatusQuick = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    if (!wsId) return;
    if (task.status === 'DONE' && !isMgr) {
      setDragError('只有项目负责人可以重新打开已完成任务');
      setTimeout(() => setDragError(''), 3000);
      return;
    }
    const nextStatus = statusCycle[task.status] || 'TODO';
    try {
      await update(wsId, task.id, { status: nextStatus } as any);
      await fetchKanbanData(wsId, groupBy);
    } catch (err: any) {
      const msg = err?.response?.data?.message || '状态变更失败';
      setDragError(msg);
      setTimeout(() => setDragError(''), 3000);
    }
  };

  const handleDrop = async (colKey: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragError('');
    const taskId = e.dataTransfer.getData('taskId');
    const fromKey = e.dataTransfer.getData('fromKey');
    if (!taskId || !wsId) return;

    if (fromKey === colKey) {
      if (!isFull) return;
      const task = Object.values(kanban).flat().find(t => t.id === taskId);
      if (!task) return;
      if (task.status === 'DONE' && !isMgr) {
        setDragError('只有项目负责人可以重新打开已完成任务');
        setTimeout(() => setDragError(''), 3000);
        return;
      }
      const nextStatus = statusCycle[task.status] || 'TODO';
      try {
        await update(wsId, taskId, { status: nextStatus } as any);
        await fetchKanbanData(wsId, groupBy);
      } catch (err: any) {
        const msg = err?.response?.data?.message || '状态变更失败';
        setDragError(msg);
        setTimeout(() => setDragError(''), 3000);
      }
      return;
    }

    try {
      if (milestoneMode) {
        const targetMsId = colKey === '__unclassified__' ? '' : colKey;
        await update(wsId, taskId, { milestone_id: targetMsId || null } as any);
        await fetchKanbanData(wsId, groupBy);
      } else if (isFull) {
        const phaseIdx = phaseColDefs.findIndex(p => p.key === fromKey);
        const targetIdx = phaseColDefs.findIndex(p => p.key === colKey);
        if (targetIdx === phaseIdx + 1) {
          await advancePhase(wsId, taskId, '通过拖拽推进阶段');
        } else if (targetIdx === phaseIdx - 1) {
          await returnPhase(wsId, taskId);
        } else if (targetIdx !== phaseIdx) {
          setDragError('只能拖拽到相邻阶段'); return;
        }
        await fetchKanbanData(wsId, groupBy);
      } else {
        await moveTask(wsId, taskId, colKey, 0);
        await fetchKanbanData(wsId, groupBy);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '操作失败：没有权限或状态不正确';
      setDragError(msg);
      setTimeout(() => setDragError(''), 4000);
    }
  };

  const handleAdvancePhase = async () => {
    if (!wsId || !gateOpen || !gateNote.trim()) return;
    const tasks = (kanban[gateOpen] || []).filter((t: Task) => t.status === 'DONE');
    for (const t of tasks) {
      try {
        await advancePhase(wsId, t.id, gateNote);
      } catch { /* skip */ }
    }
    await fetchKanbanData(wsId, groupBy);
    setGateOpen(null);
    setGateNote('');
  };

  const handleBatchAction = async (value: string) => {
    if (!wsId || selected.size === 0) return;
    const promises: Promise<any>[] = [];
    selected.forEach((taskId) => {
      if (batchAction === 'status') promises.push(update(wsId, taskId, { status: value } as any));
      else if (batchAction === 'priority') promises.push(update(wsId, taskId, { priority: value } as any));
    });
    await Promise.all(promises);
    await fetchKanbanData(wsId, groupBy);
    setSelected(new Set());
    setBatchAction(null);
  };

  if (loading) return <div className="empty-state"><div className="empty-icon">⏳</div>加载中...</div>;

  return (
    <div>
      {dragError && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 2000,
          background: 'var(--red-500)', color: '#fff', padding: '8px 20px',
          borderRadius: 'var(--radius-md)', fontSize: '0.78rem', fontWeight: 500,
          boxShadow: '0 4px 16px rgba(239,68,68,0.3)',
          animation: 'fadeInDown 0.25s ease',
        }}>
          ⚠ {dragError}
        </div>
      )}

      <div className={`batch-bar${selected.size > 0 ? ' visible' : ''}`}>
        <span className="batch-count">已选 {selected.size} 项</span>
        {!batchAction ? (
          <>
            <button onClick={() => setBatchAction('status')}>改状态</button>
            <button onClick={() => setBatchAction('priority')}>改优先级</button>
          </>
        ) : (
          <>
            {batchAction === 'status' && (
              <select onChange={(e) => handleBatchAction(e.target.value)} autoFocus style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: 4, border: '1px solid var(--border)' }}>
                <option value="">选择状态...</option>
                <option value="TODO">待办</option>
                <option value="IN_PROGRESS">进行中</option>
                <option value="IN_REVIEW">待 Review</option>
                <option value="DONE">已完成</option>
              </select>
            )}
            {batchAction === 'priority' && (
              <select onChange={(e) => handleBatchAction(e.target.value)} autoFocus style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: 4, border: '1px solid var(--border)' }}>
                <option value="">选择优先级...</option>
                <option value="CRITICAL">紧急</option>
                <option value="HIGH">高</option>
                <option value="MEDIUM">中</option>
                <option value="LOW">低</option>
              </select>
            )}
            <button onClick={() => setBatchAction(null)}>取消</button>
          </>
        )}
        <button onClick={() => { setSelected(new Set()); setBatchAction(null); }}>✕</button>
      </div>

      {isFull && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button
            className={`btn btn-sm ${viewMode === 'phase' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('phase')}
          >阶段视图</button>
          <button
            className={`btn btn-sm ${viewMode === 'status' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('status')}
          >状态视图</button>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${colDefs.length}, minmax(180px, 1fr))`,
        gap: 10,
        overflowX: 'auto',
      }}>
        {colDefs.map((col) => {
          const colTasks = (kanban[col.key] || []).filter((t: any) => !t._col_meta);
          const doneCount = colTasks.filter((t: Task) => t.status === 'DONE').length;
          const total = colTasks.length;
          const allDone = total > 0 && doneCount === total;
          const phaseIdx = phaseColDefs.findIndex(p => p.key === col.key);
          const isLast = phaseIdx === phaseColDefs.length - 1;
          return (
          <div
            key={col.key}
            className="kanban-col"
            onDrop={(e) => handleDrop(col.key, e)}
            onDragOver={(e) => e.preventDefault()}
            style={{ margin: 0 }}
          >
            <div className="col-head" style={isFull ? { flexDirection: 'column', gap: 4, marginBottom: 12 } : {}}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span>{isFull && (col as any).icon ? `${(col as any).icon} ` : ''}{col.title}
                  {milestoneMode && (col as any).phase && (
                    <span style={{ marginLeft: 6, fontSize: '0.58rem', padding: '1px 5px', borderRadius: 3, background: (MILESTONE_PHASE_COLORS[(col as any).phase] || 'var(--blue-400)') + '18', color: MILESTONE_PHASE_COLORS[(col as any).phase], fontWeight: 500 }}>{MILESTONE_PHASE_LABELS[(col as any).phase]}</span>
                  )}
                </span>
                <span className="badge" style={{ background: 'var(--bg-hover)' }}>{total}</span>
              </div>
              {isFull && (
                <>
                  {total > 0 && (
                    <div style={{ width: '100%', height: 4, background: 'var(--border-light)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${Math.round((doneCount/total)*100)}%`, background: allDone ? 'var(--green-400)' : 'var(--blue-400)', borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                  )}
                  {strictGate && doneCount > 0 && !isLast && (
                    <button
                      className="btn btn-primary btn-xs"
                      style={{ width: '100%', fontSize: '0.68rem', marginTop: 2 }}
                      onClick={() => setGateOpen(col.key)}
                    >
                      推进 {doneCount} 个到「{phaseColDefs[phaseIdx + 1]?.title}」
                    </button>
                  )}
                  {!strictGate && doneCount > 0 && !isLast && (
                    <button
                      className="btn btn-ghost btn-xs"
                      style={{ width: '100%', fontSize: '0.68rem', marginTop: 2 }}
                      onClick={async () => {
                        const tasks = (kanban[col.key] || []).filter((t: Task) => t.status === 'DONE');
                        for (const t of tasks) {
                          try { await advancePhase(wsId!, t.id, '直接推进'); } catch { /* skip */ }
                        }
                        await fetchKanbanData(wsId!, groupBy);
                      }}
                    >
                      ⚡ 直接推进 {doneCount} 个
                    </button>
                  )}
                  {total > 0 && !allDone && (
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>{doneCount}/{total} 完成</div>
                  )}
                </>
              )}
            </div>
            {colTasks.filter((t: Task) => !scopeFilter || (isFull ? t.iteration_id === scopeFilter : t.milestone_id === scopeFilter)).map((story: Task) => {
                const isOverdue = story.due_date && new Date(story.due_date) < new Date() && story.status !== 'DONE';
                const children = childMap[story.id] || [];
                const childDone = children.filter((c: any) => c.status === 'DONE').length;
                const isExpanded = expandedStories.has(story.id);
                return (
              <div key={story.id}>
                <div
                  className={`kanban-card type-story${selected.has(story.id) ? ' selected' : ''}${isOverdue ? ' overdue' : ''}${!canDrag(story) ? ' locked' : ''}`}
                  title={story.title}
                  onClick={(e) => { if (e.shiftKey) toggleSelect(story.id); else onEditTask(story); }}
                  draggable={canDrag(story)}
                  onDragStart={(e) => { if (!canDrag(story)) { e.preventDefault(); return; } handleDragStart(e, story.id, isFull && viewMode === 'phase' ? story.phase : story.status); }}
                  style={{ cursor: 'pointer', borderLeft: `3px solid ${({CRITICAL:'var(--red-400)',HIGH:'var(--amber-400)',MEDIUM:'var(--blue-400)',LOW:'var(--text-muted)'})[story.priority] || 'var(--border)'}` }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <div className="card-title" style={{ flex: 1 }}>{story.title}</div>
                    {children.length > 0 || (story.children_count ?? 0) > 0 ? (
                      <span onClick={(e) => { e.stopPropagation(); toggleExpand(story.id); }}
                        style={{ fontSize: '0.65rem', cursor: 'pointer', padding: '0 4px', transform: isExpanded ? 'rotate(90deg)' : '', transition: '0.15s', flexShrink: 0 }} title="展开子任务">▶</span>
                    ) : (
                      <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)', flexShrink: 0 }}>{story.children_count ?? 0}</span>
                    )}
                  </div>
                  <div className="card-meta" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="card-status-btn"
                      onClick={(e) => { e.stopPropagation(); handleStatusQuick(e, story); }}
                      style={{ fontSize: '0.55rem', padding: '1px 5px', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 500, background: statusBadge[story.status]?.bg || 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                    >{statusBadge[story.status]?.label || story.status}</button>
                    {story.status !== 'DONE' && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!wsId) return;
                          try {
                            await update(wsId, story.id, { status: 'DONE' } as any);
                            await fetchKanbanData(wsId, groupBy);
                          } catch (err: any) {
                            setDragError(err?.response?.data?.message || '完成失败');
                            setTimeout(() => setDragError(''), 3000);
                          }
                        }}
                        style={{ fontSize: '0.55rem', padding: '1px 4px', border: '1px solid var(--green-300)', borderRadius: 3, cursor: 'pointer', background: 'var(--green-50)', color: 'var(--green-600)', fontWeight: 600 }}
                        title="快速完成"
                      >✓</button>
                    )}
                    {story.priority === 'CRITICAL' && <span style={{ color: 'var(--red-600)', fontWeight: 500, fontSize: '0.6rem' }}>紧急</span>}
                    {story.priority === 'HIGH' && <span style={{ color: 'var(--amber-600)', fontSize: '0.6rem' }}>高</span>}
                    {isOverdue && <span style={{ color: 'var(--red-500)', fontSize: '0.6rem' }}>⚠ 逾期</span>}
                    {story.assignee_name && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }} title={story.assignee_name}>{story.assignee_name}</span>}
                  </div>
                  {!isFull && story.milestone_name && (
                    <div style={{ marginTop: 4, fontSize: '0.58rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>📍 {story.milestone_name}</span>
                      {story.milestone_id && (() => {
                        const ms = milestones.find(m => m.id === story.milestone_id);
                        if (!ms) return null;
                        const msPhase = ms.phase || 'PLANNING';
                        return (
                          <span style={{
                            padding: '1px 5px', borderRadius: 3, fontSize: '0.55rem',
                            background: (MILESTONE_PHASE_COLORS[msPhase] || 'var(--blue-400)') + '18',
                            color: MILESTONE_PHASE_COLORS[msPhase] || 'var(--text-muted)',
                            fontWeight: 500,
                          }}>
                            {MILESTONE_PHASE_LABELS[msPhase]}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                  {isFull && story.task_type === 'STORY' && (
                    <div style={{ display: 'flex', gap: 2, marginTop: 4, alignItems: 'center' }}>
                      {['BACKLOG', 'PLAN', 'DESIGN', 'DEVELOPMENT', 'TESTING', 'RELEASE'].map((ph, i) => {
                        const phaseIdx2 = ['BACKLOG', 'PLAN', 'DESIGN', 'DEVELOPMENT', 'TESTING', 'RELEASE'].indexOf(story.phase);
                        const isPhase = ph === story.phase;
                        const isPast = i <= phaseIdx2;
                        return (
                          <div key={ph} style={{
                            flex: 1, height: 3, borderRadius: 2,
                            background: isPhase ? 'var(--blue-500)' : isPast ? 'var(--green-300)' : 'var(--border-light)',
                            transition: 'background 0.3s',
                          }} title={({BACKLOG:'需求池',PLAN:'需求规划',DESIGN:'方案设计',DEVELOPMENT:'开发实现',TESTING:'测试验证',RELEASE:'发布上线'})[ph]} />
                        );
                      })}
                    </div>
                  )}
                  {children.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ height: 3, background: 'var(--border-light)', borderRadius: 2, marginBottom: 2 }}>
                        <div style={{ height: '100%', width: `${Math.round((childDone/children.length)*100)}%`, background: 'var(--green-400)', borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>子任务 {childDone}/{children.length}</div>
                    </div>
                  )}
                  {!children.length && story.children_count > 0 && (
                    <div style={{ marginTop: 4, fontSize: '0.55rem', color: 'var(--text-muted)' }}>{story.children_count} 个子任务（点击展开加载）</div>
                  )}
                  {isFull && story.task_type === 'STORY' && story.phase === 'DESIGN' && story.design_review_status && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.55rem', padding: '1px 5px', borderRadius: 3,
                        background: story.design_review_status === 'APPROVED' ? '#d4edda' :
                                     story.design_review_status === 'REJECTED' ? '#f8d7da' : '#fff3cd',
                        color: story.design_review_status === 'APPROVED' ? '#155724' :
                               story.design_review_status === 'REJECTED' ? '#721c24' : '#856404' }}>
                        {story.design_review_status === 'APPROVED' ? '方案评审 ✓' :
                         story.design_review_status === 'REJECTED' ? '方案评审 ✗' : '方案待评审'}
                      </span>
                    </div>
                  )}
                </div>
                {isExpanded && (
                  <div style={{ marginLeft: 8, marginTop: 2, marginBottom: 6, padding: '4px 8px', background: 'var(--bg-raised)', borderRadius: 'var(--radius-sm)', borderLeft: '2px solid var(--border-light)' }}>
                    {children.map((child: any) => {
                      const childTypeIcon: Record<string, string> = { TASK: '✅', BUG: '🐛', SUB_TASK: '📌', SPIKE: '🔬' };
                      return (
                      <div key={child.id}
                        onClick={(e) => { e.stopPropagation(); onEditTask(child); }}
                        style={{ padding: '3px 6px', marginBottom: 2, borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.68rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
                        <span>{childTypeIcon[child.task_type] || '📄'} {child.title}</span>
                        <span style={{ fontSize: '0.56rem', color: ({TODO:'var(--text-muted)',IN_PROGRESS:'var(--blue-500)',IN_REVIEW:'var(--amber-500)',DONE:'var(--green-500)'})[child.status] || 'var(--text-muted)', fontWeight: 500 }}>
                          {({TODO:'待办',IN_PROGRESS:'进行中',IN_REVIEW:'审核中',DONE:'✓'})[child.status] || child.status}
                        </span>
                      </div>
                      );
                    })}
                    <div onClick={(e) => { e.stopPropagation(); onCreateTask('TODO', undefined, story.id); }}
                      style={{ padding: '3px 6px', marginTop: 4, borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.64rem', color: 'var(--text-muted)', textAlign: 'center', border: '1px dashed var(--border)', background: 'transparent' }}>
                      + 添加子任务
                    </div>
                  </div>
                )}
              </div>
                );
            })}
            <div className="col-add" onClick={() => onCreateTask(isFull ? 'TODO' : col.key, isFull ? col.key : undefined)}>{isFull ? '+ 新建需求' : '+ 新建任务'}</div>
          </div>
          );
        })}
      </div>

      {gateOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => { setGateOpen(null); setGateNote(''); }}>
          <div style={{
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
            padding: 24, width: 420, maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 4 }}>推进阶段</h3>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              从「{phaseColDefs.find(p => p.key === gateOpen)?.title}」推进到「{phaseColDefs[phaseColDefs.findIndex(p => p.key === gateOpen) + 1]?.title}」
            </p>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 12, padding: '8px 12px', background: 'var(--bg-raised)', borderRadius: 'var(--radius-sm)' }}>
              <strong>要求产出物：</strong>
              <span style={{ marginLeft: 4 }}>{phaseColDefs.find(p => p.key === gateOpen)?.deliverables}</span>
            </div>
            {gateOpen === 'BACKLOG' && (
              <div style={{ fontSize: '0.7rem', color: 'var(--amber-600)', marginBottom: 8, padding: '6px 10px', background: '#fff8e1', borderRadius: 'var(--radius-sm)' }}>
                ⚠️ 请确认已<strong>设置需求负责人</strong>并<strong>规划到迭代</strong>
              </div>
            )}
            {gateOpen === 'PLAN' && (
              <div style={{ fontSize: '0.7rem', color: 'var(--amber-600)', marginBottom: 8, padding: '6px 10px', background: '#fff8e1', borderRadius: 'var(--radius-sm)' }}>
                ⚠️ 请确认<strong>需求PRD</strong>已完成，可在需求详情中编写PRD文档
              </div>
            )}
            {gateOpen === 'DESIGN' && (
              <div style={{ fontSize: '0.7rem', color: 'var(--amber-600)', marginBottom: 8, padding: '6px 10px', background: '#fff8e1', borderRadius: 'var(--radius-sm)' }}>
                ⚠️ 请确认<strong>设计文档</strong>已完成且<strong>设计评审</strong>已通过，推进后将进入开发实现阶段
              </div>
            )}
            {gateOpen === 'DEVELOPMENT' && (
              <div style={{ fontSize: '0.7rem', color: 'var(--amber-600)', marginBottom: 8, padding: '6px 10px', background: '#fff8e1', borderRadius: 'var(--radius-sm)' }}>
                ⚠️ 所有子任务需标记为<strong>已完成</strong>，并填写<strong>Story自测报告</strong>
              </div>
            )}
            {gateOpen === 'TESTING' && (
              <div style={{ fontSize: '0.7rem', color: 'var(--amber-600)', marginBottom: 8, padding: '6px 10px', background: '#fff8e1', borderRadius: 'var(--radius-sm)' }}>
                ⚠️ 请确认<strong>测试报告</strong>已完成，测试不通过的需求可单独退回开发
              </div>
            )}
            <textarea
              placeholder="填写产出物说明（必填）..."
              value={gateNote}
              onChange={(e) => setGateNote(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', fontFamily: 'inherit', resize: 'vertical' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => { setGateOpen(null); setGateNote(''); }}>取消</button>
              <button className="btn btn-primary" disabled={!gateNote.trim()} onClick={handleAdvancePhase}>
                确认推进（{kanban[gateOpen]?.filter((t: Task) => t.status === 'DONE').length || 0} 个任务）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
