import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useTaskStore } from '../../stores/taskStore';
import { useAuthStore } from '../../stores/authStore';
import { PHASE_LABELS, STATUS_LABELS } from '../../types';
import type { WorkspaceMember, Task, Iteration, Milestone } from '../../types';
import { useIterationStore } from '../../stores/iterationStore';

import { useMilestoneStore } from '../../stores/milestoneStore';
import SlidePanel from '../../components/common/SlidePanel';
import KnowledgeBasePanel from '../../components/KnowledgeBase/KnowledgeBasePanel';
import api from '../../api/client';

function getFileIcon(mimeType: string): string {
  if (!mimeType) return '📎';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📕';
  if (mimeType.startsWith('text/')) return '📝';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('compress') || mimeType.includes('tar') || mimeType.includes('gzip')) return '📦';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  return '📎';
}

/* ═══════════════════════════════════════════
   PULSE SIDEBAR
   ═══════════════════════════════════════════ */
function MilestoneSidebar({ selectedId, onSelect, onEdit }: { selectedId: string; onSelect: (id: string) => void; onEdit: (ms: Milestone) => void }) {
  const { id: wsId } = useParams<{ id: string }>();
  const { milestones, loading, fetchList, remove } = useMilestoneStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => { if (wsId) fetchList(wsId); }, [wsId]);

  const handleCreate = async () => {
    if (!wsId || !newName.trim()) return;
    await useMilestoneStore.getState().create(wsId, { name: newName, sort_order: milestones.length });
    setNewName('');
    setShowCreate(false);
  };

  // Compute all-tasks counts
  const totalTasks = milestones.reduce((s, m) => s + m.task_count, 0);
  const totalDone = milestones.reduce((s, m) => s + m.done_count, 0);
  const totalPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  return (
    <div className="pulse-sidebar">
      <div className="sidebar-section">
        <div className="ss-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>里程碑</span>
          <button className="btn-icon-sm" onClick={() => setShowCreate(!showCreate)} title="新建里程碑" style={{ width: 22, height: 22, borderRadius: 4, fontSize: '0.78rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer', background: 'var(--bg-raised)', border: '1px solid var(--border-light)', lineHeight: 1 }}>+</button>
        </div>

        {/* Inline create form */}
        {showCreate && (
          <div style={{ padding: '6px 8px', background: 'var(--bg-raised)', borderRadius: 'var(--radius-sm)', marginBottom: 6 }}>
            <input
              type="text"
              placeholder="里程碑名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
              style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none', marginBottom: 4 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-primary btn-xs" onClick={handleCreate}>创建</button>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowCreate(false)}>取消</button>
            </div>
          </div>
        )}

        <div className="sidebar-ms-list" style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
          {/* "All" option */}
          <div
            className={`sidebar-ms${selectedId === '' ? ' active' : ''}`}
            onClick={() => onSelect('')}
            style={{ opacity: selectedId === '' ? 1 : 0.6 }}
          >
            <div className="sms-row1">
              <span className="sms-name" style={{ color: 'var(--blue-600)' }}>📋 全部里程碑</span>
              <span className="sms-badge" style={{ background: 'var(--blue-100)', color: 'var(--blue-600)' }}>
                {totalTasks}
              </span>
            </div>
            <div className="sms-bar">
              <div className="sms-fill active" style={{ width: `${totalPct}%` }} />
            </div>
            <div className="sms-pct">{totalDone}/{totalTasks} · {totalPct}%</div>
          </div>

          {loading ? (
            <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.76rem' }}>加载中...</div>
          ) : milestones.length === 0 ? (
            <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.76rem' }}>暂无里程碑</div>
          ) : (
            milestones.map((ms) => {
              const pct = ms.task_count > 0 ? Math.round((ms.done_count / ms.task_count) * 100) : 0;
              const isActive = selectedId === ms.id;
              const st = ms.status;

              return (
                <div
                  key={ms.id}
                  className={`sidebar-ms${isActive ? ' active' : ''}`}
                  onClick={() => onSelect(ms.id)}
                  onDoubleClick={() => onEdit(ms)}
                >
                  <div className="sms-row1">
                    <span className="sms-name">{ms.name}</span>
                    <span className={`sms-badge ${st === 'DONE' ? 'done' : st === 'ACTIVE' ? 'active' : 'upcoming'}`}>
                      {st === 'DONE' ? '✓' : st === 'ACTIVE' ? '◎' : '○'}
                    </span>
                  </div>
                  {ms.description && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ms.description}</div>
                  )}
                  <div className="sms-bar">
                    <div className={`sms-fill ${st === 'DONE' ? 'done' : st === 'ACTIVE' ? 'active' : 'pending'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="sms-pct">
                    {ms.done_count}/{ms.task_count} · {pct}%
                    {ms.owner_name && <span> · {ms.owner_name}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* AI Summary — compact */}
      <div className="sidebar-ai expanded" style={{ borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
        <div className="sai-head">
          <span><span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: 4 }}>AI</span> 摘要</span>
        </div>
        <div className="sai-body" style={{ display: 'block' }}>
          本周完成 <strong>{totalDone} 个任务</strong>，在 <strong>{milestones.filter(m => m.status === 'ACTIVE').length} 个活跃里程碑</strong> 中推进。
        </div>
      </div>
    </div>
  );
}

function IterationSidebar({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const { id: wsId } = useParams<{ id: string }>();
  const { iterations, loading, fetchList } = useIterationStore();

  useEffect(() => { if (wsId) fetchList(wsId); }, [wsId]);

  const totalTasks = iterations.reduce((s, i) => s + i.task_count, 0);
  const activeCount = iterations.filter((i) => i.status === 'ACTIVE').length;

  const handleSelect = (id: string) => onSelect(selectedId === id ? '' : id);

  const statusIcon = (status: string) => status === 'ACTIVE' ? '◎' : status === 'CLOSED' ? '●' : '○';
  const statusColor = (status: string) => status === 'ACTIVE' ? 'var(--green-500)' : status === 'CLOSED' ? 'var(--text-muted)' : 'var(--blue-400)';

  return (
    <div className="pulse-sidebar">
      <div className="pulse-sidebar-header">
        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>迭代</span>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.72rem' }}>加载中...</div> : (
        <>
          <div
            onClick={() => onSelect('')}
            style={{
              cursor: 'pointer', padding: '10px 14px', marginBottom: 4,
              borderRadius: 'var(--radius-md)',
              background: !selectedId ? 'var(--blue-50)' : 'transparent',
              borderLeft: !selectedId ? '3px solid var(--blue-500)' : '3px solid transparent',
              fontSize: '0.74rem', fontWeight: !selectedId ? 600 : 400,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <span>全部迭代</span>
            <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{totalTasks} 个任务</span>
          </div>

          {iterations.map((it) => (
            <div
              key={it.id}
              onClick={() => handleSelect(it.id)}
              title={it.goal || undefined}
              style={{
                cursor: 'pointer', padding: '8px 14px', marginBottom: 2,
                borderRadius: 'var(--radius-md)',
                background: selectedId === it.id ? 'var(--blue-50)' : 'transparent',
                borderLeft: selectedId === it.id ? '3px solid var(--blue-500)' : '3px solid transparent',
                fontSize: '0.73rem', fontWeight: selectedId === it.id ? 500 : 400,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: statusColor(it.status), fontSize: '0.64rem' }}>{statusIcon(it.status)}</span>
                <span>{it.name}</span>
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2, marginLeft: 18 }}>
                {it.start_date} → {it.end_date}
              </div>
              {it.capacity_points > 0 && (
                <div style={{ marginTop: 4, marginLeft: 18 }}>
                  <div style={{ height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.min(100, Math.round((it.committed_points / it.capacity_points) * 100))}%`,
                      background: 'var(--blue-400)', borderRadius: 2, transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {it.committed_points}/{it.capacity_points} pts · {it.task_count} 任务
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="sidebar-ai expanded" style={{ borderTop: '1px solid var(--border-light)', paddingTop: 8, marginTop: 8 }}>
            <div className="sai-head">
              <span><span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: 4 }}>AI</span> 摘要</span>
            </div>
            <div className="sai-body" style={{ display: 'block' }}>
              共 <strong>{iterations.length} 个迭代</strong>，{activeCount} 个活跃，已提交 <strong>{
                iterations.reduce((s, i) => s + i.committed_points, 0)
              } pts</strong>。
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiRow() {
  const { id: wsId } = useParams<{ id: string }>();
  const { current } = useWorkspaceStore();
  const isFull = current?.type === 'PROJECT';
  const { milestones, fetchList } = useMilestoneStore();
  const { iterations, fetchList: fetchIterations } = useIterationStore();
  const { members, fetchMembers } = useWorkspaceStore();
  const { kanban, fetchKanban } = useTaskStore();

  useEffect(() => {
    if (wsId) {
      fetchMembers(wsId); fetchKanban(wsId);
      if (isFull) fetchIterations(wsId);
      else fetchList(wsId);
    }
  }, [wsId, isFull]);

  const totalTasks = Object.values(kanban).flat().length;
  const doneTasks = (kanban['DONE'] || []).length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const humanMembers = members.filter((m) => m.role !== 'AI_AGENT').length;

  const trackLabel = isFull ? '迭代' : '里程碑';
  const trackItems = isFull ? iterations : milestones;
  const activeItems = trackItems.filter((m: any) => m.status === 'ACTIVE').length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>任务完成</div>
        <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{doneTasks}/{totalTasks}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{pct}% 完成</div>
      </div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{trackLabel}</div>
        <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--blue-600)' }}>{activeItems}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{trackItems.length} 个{trackLabel} · {activeItems} 活跃</div>
      </div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>团队成员</div>
        <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{humanMembers}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>人 · +{members.filter(m => m.role === 'AI_AGENT').length} AI Agent</div>
      </div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>项目健康度</div>
        <div style={{ fontSize: '1.8rem', fontWeight: 700, color: pct >= 70 ? 'var(--green-600)' : pct >= 40 ? 'var(--blue-600)' : 'var(--amber-600)' }}>
          {pct >= 70 ? '良好' : pct >= 40 ? '正常' : '注意'}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>整体进度 {pct}%</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   INLINE CHAT PANEL
   ═══════════════════════════════════════════ */
function PulseChat() {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [input, setInput] = useState('');

  const send = () => {
    if (!input.trim()) return;
    setMessages((m) => [...m, { role: 'user', text: input }]);
    setInput('');
    setTimeout(() => {
      setMessages((m) => [...m, { role: 'ai', text: '收到。作为 AI 助手，我会根据项目规范处理你的请求。' }]);
    }, 800);
  };

  const commands = ['/创建任务', '/查询进度', '/查找文档', '/生成周报', '/风险分析'];

  return (
    <div className={`pulse-chat${expanded ? ' expanded' : ''}`}>
      <button className="chat-toggle-tab" onClick={() => setExpanded(!expanded)}>
        AI 对话
      </button>
      <div className="chat-inner">
        <div className="chat-head">
          <h3>AI 对话</h3>
          <button className="chat-close-btn" onClick={() => setExpanded(false)}>✕</button>
        </div>
        <div className="chat-body">
          {messages.length === 0 && (
            <div className="chat-cmds">
              {commands.map((c) => (
                <button key={c} className="chat-cmd" onClick={() => { setMessages([{ role: 'user', text: c }]); setTimeout(() => setMessages((m) => [...m, { role: 'ai', text: '正在处理...' }]), 800); }}>
                  <span className="cmd-slash">{c}</span>
                </button>
              ))}
            </div>
          )}
          <div className="chat-msgs">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {m.text}
              </div>
            ))}
          </div>
        </div>
        <div className="chat-input-area">
          <input
            type="text"
            placeholder="@知识库 输入指令..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="send-btn" onClick={send}>↑</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   KANBAN VIEW
   ═══════════════════════════════════════════ */
function KanbanView({ onCreateTask, onEditTask, scopeFilter, isFull }: { onCreateTask: (status: string, phase?: string, parentStoryId?: string) => void; onEditTask: (task: Task) => void; scopeFilter: string; isFull: boolean }) {
  const { id: wsId } = useParams<{ id: string }>();
  const { moveTask, update, advancePhase, returnPhase } = useTaskStore();
  const { user } = useAuthStore();
  const { members } = useWorkspaceStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = useState<string | null>(null);

  // Story-centric: expand stories to see child tasks
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [childMap, setChildMap] = useState<Record<string, any[]>>({});

  // Local kanban state to avoid race condition with KpiRow/ReportsPanel
  const [kanban, setKanban] = useState<Record<string, Task[]>>({});
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'phase' | 'status'>('phase');
  const groupBy = isFull ? viewMode : 'status';

  const fetchKanbanData = useCallback(async (wsId: string, groupBy: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { group_by: groupBy };
      if (isFull) params.task_type = 'STORY';
      const result = await api.get(`/workspaces/${wsId}/kanban`, { params });
      setKanban(result.data || {});
    } catch { /* ignore */ }
    setLoading(false);
  }, [isFull]);

  useEffect(() => { if (wsId) fetchKanbanData(wsId, groupBy); }, [wsId]);

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

  // Check if current user is manager (OWNER or MANAGER role)
  const isMgr = user ? members.some(m => m.user_id === user.id && (m.role === 'OWNER' || m.role === 'MANAGER')) || members.length === 0 : false;

  // All workspace members can attempt to drag — backend enforces permissions
  const canDrag = (_task: Task): boolean => true;

  const statusColDefs: { key: string; title: string; icon?: string }[] = [
    { key: 'TODO', title: '待办' },
    { key: 'IN_PROGRESS', title: '进行中' },
    { key: 'IN_REVIEW', title: '待 Review' },
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

  const phaseColDefs = allPhaseColDefs; // Always show all 6 SDLC phases for Story kanban
  const colDefs = isFull && viewMode === 'phase' ? phaseColDefs : statusColDefs;

  // Status colors for cards within a phase column
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

  const statusCycle: Record<string, string> = { TODO: 'IN_PROGRESS', IN_PROGRESS: 'IN_REVIEW', IN_REVIEW: 'DONE', DONE: 'TODO' };
  const statusQuickLabel: Record<string, string> = { TODO: '待办', IN_PROGRESS: '进行中', IN_REVIEW: '审核中', DONE: '已完成' };

  const handleStatusQuick = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    if (!wsId) return;
    // Non-managers can't reopen DONE tasks
    if (task.status === 'DONE' && !isMgr) {
      setDragError('只有项目负责人可以重新打开已完成任务');
      setTimeout(() => setDragError(''), 3000);
      return;
    }
    const nextStatus = statusCycle[task.status] || 'TODO';
    try {
      await update(wsId, task.id, { status: nextStatus } as any);
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

    // Same column: cycle status (in phase kanban) or reorder (in status kanban)
    if (fromKey === colKey) {
      if (!isFull) return; // status kanban: reorder only, no-op for now
      // Phase kanban: drag within same column → cycle to next status
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
      } catch (err: any) {
        const msg = err?.response?.data?.message || '状态变更失败';
        setDragError(msg);
        setTimeout(() => setDragError(''), 3000);
      }
      return;
    }

    try {
      if (isFull) {
        const phaseIdx = phaseColDefs.findIndex(p => p.key === fromKey);
        const targetIdx = phaseColDefs.findIndex(p => p.key === colKey);
        if (targetIdx === phaseIdx + 1) {
          // Drag right → advance phase
          await advancePhase(wsId, taskId, '通过拖拽推进阶段');
        } else if (targetIdx === phaseIdx - 1) {
          // Drag left → return phase
          await returnPhase(wsId, taskId);
        } else if (targetIdx !== phaseIdx) {
          setDragError('只能拖拽到相邻阶段'); return;
        }
        await fetchKanbanData(wsId, groupBy);  // refresh local kanban immediately
      } else {
        await moveTask(wsId, taskId, colKey, 0);
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
      {/* Drag error toast */}
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

      {/* Batch bar */}
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

      {/* View switcher — only for PROJECT workspaces */}
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
          const colTasks = (kanban[col.key] || []);
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
                <span>{isFull && col.icon ? `${col.icon} ` : ''}{col.title}</span>
                <span className="badge" style={{ background: 'var(--bg-hover)' }}>{total}</span>
              </div>
              {isFull && (
                <>
                  {total > 0 && (
                    <div style={{ width: '100%', height: 4, background: 'var(--border-light)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${Math.round((doneCount/total)*100)}%`, background: allDone ? 'var(--green-400)' : 'var(--blue-400)', borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                  )}
                  {/* Gate button: show when any story is DONE, not all */}
                  {doneCount > 0 && !isLast && (
                    <button
                      className="btn btn-primary btn-xs"
                      style={{ width: '100%', fontSize: '0.68rem', marginTop: 2 }}
                      onClick={() => setGateOpen(col.key)}
                    >
                      推进 {doneCount} 个到「{phaseColDefs[phaseIdx + 1]?.title}」
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
                    {/* Quick complete: set DONE directly */}
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
                  {/* Mini phase progress bar */}
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
                  {/* Child task progress */}
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
                  {/* Design review status badge */}
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
                {/* Expanded children */}
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
            <div className="col-add" onClick={() => onCreateTask(isFull ? 'TODO' : col.key, isFull ? col.key : undefined)}>+ 新建需求</div>
          </div>
          );
        })}
      </div>

      {/* Gate dialog */}
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
            {/* Gate-specific warnings */}
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

/* ═══════════════════════════════════════════
   LIST VIEW
   ═══════════════════════════════════════════ */
function ListView({ onEditTask, scopeFilter, isFull }: { onEditTask: (task: Task) => void; scopeFilter: string; isFull: boolean }) {
  const { id: wsId } = useParams<{ id: string }>();
  const { tasks, fetchList } = useTaskStore();

  useEffect(() => { if (wsId) fetchList(wsId, { [isFull ? 'iteration_id' : 'milestone_id']: scopeFilter || undefined }); }, [wsId, scopeFilter]);

  const statusLabels: Record<string, string> = {
    TODO: '待办', IN_PROGRESS: '进行中', IN_REVIEW: '待 Review', DONE: '已完成',
  };

  return (
    <div className="task-list">
      <div className="list-head">
        <span>任务名称</span><span>状态</span><span>优先级</span><span>负责人</span><span />
      </div>
      {tasks.map((t: Task) => {
        const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'DONE';
        return (
        <div key={t.id} className="list-row" onClick={() => onEditTask(t)} style={isOverdue ? { borderLeft: '3px solid var(--red-500)', background: 'var(--red-50)' } : {}}>
          <span className="task-title">{isOverdue ? '⚠️ ' : ''}{t.title}</span>
          <span><span className="badge" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>{statusLabels[t.status] || t.status}</span></span>
          <span style={isOverdue ? { color: 'var(--red-500)', fontWeight: 600 } : {}}>{t.priority}{t.due_date && <span style={{ marginLeft: 4, fontSize: '0.62rem', color: isOverdue ? 'var(--red-500)' : 'var(--text-muted)' }}>📅 {t.due_date}</span>}</span>
          <span>{t.assignee_name || '—'}</span>
          <span />
        </div>
        );
      })}
      {tasks.length === 0 && (
        <div className="empty-state" style={{ padding: 30 }}>暂无任务</div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════
   KNOWLEDGE BASE
   ═══════════════════════════════════════════ */
function KnowledgePanel() {
  return <KnowledgeBasePanel />;
}

/* ═══════════════════════════════════════════
   BACKLOG PANEL — requirement pool for R&D projects
   ═══════════════════════════════════════════ */
function BacklogPanel({ onEditStory, onCreateStory, selectedIteration }: { onEditStory: (story: Task) => void; onCreateStory: () => void; selectedIteration: string }) {
  const { id: wsId } = useParams<{ id: string }>();
  const { backlog, backlogLoading, fetchBacklog } = useTaskStore();
  const { iterations, fetchList: fetchIterations } = useIterationStore();

  useEffect(() => {
    if (wsId) { fetchBacklog(wsId); fetchIterations(wsId); }
  }, [wsId]);

  const activeIterations = iterations.filter(it => it.status === 'PLANNING' || it.status === 'ACTIVE');
  const currentIterName = iterations.find(it => it.id === selectedIteration)?.name;

  const priorityLabel: Record<string, string> = { CRITICAL: '紧急', HIGH: '高', MEDIUM: '中', LOW: '低' };
  const priorityColor: Record<string, string> = { CRITICAL: 'var(--red-500)', HIGH: 'var(--amber-500)', MEDIUM: 'var(--blue-400)', LOW: 'var(--text-muted)' };

  const handlePlan = async (storyId: string, iterationId: string) => {
    if (!wsId || !iterationId) return;
    await useTaskStore.getState().planStory(wsId, storyId, iterationId);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>未规划需求 · 共 {backlog.length} 个</span>
        <button className="btn btn-primary btn-sm" onClick={onCreateStory}>+ 新建需求</button>
      </div>

      {currentIterName && (
        <div style={{ marginBottom: 12, padding: '6px 12px', background: 'var(--blue-50)', borderRadius: 'var(--radius-sm)', fontSize: '0.72rem', color: 'var(--blue-600)', display: 'flex', alignItems: 'center', gap: 6 }}>
          📌 当前迭代：<strong>{currentIterName}</strong> — 需求将从池中规划到此迭代
        </div>
      )}

      {backlogLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '0.78rem' }}>加载中...</div>
      ) : backlog.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
          <div>需求池为空</div>
          <div style={{ fontSize: '0.68rem', marginTop: 4 }}>点击「新建需求」添加第一个需求</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {backlog.map((story: Task) => (
            <div key={story.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)', cursor: 'pointer',
            }} onClick={() => onEditStory(story)}>
              {/* Priority indicator */}
              <span style={{
                width: 4, height: 36, borderRadius: 2,
                background: priorityColor[story.priority] || 'var(--text-muted)',
                flexShrink: 0,
              }} />
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {story.title}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: '0.66rem', color: 'var(--text-muted)', alignItems: 'center' }}>
                  <span style={{ color: priorityColor[story.priority], fontWeight: 500 }}>{priorityLabel[story.priority] || story.priority}</span>
                  <span>{story.children_count ?? 0} 个子任务</span>
                  {story.proposer_name && <span>👤 {story.proposer_name}</span>}
                  <span>{story.created_at?.slice(0, 10)}</span>
                </div>
              </div>
              {/* Plan to iteration */}
              <select
                style={{
                  fontSize: '0.7rem', padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', background: 'var(--bg-raised)',
                  cursor: 'pointer', flexShrink: 0,
                }}
                value={selectedIteration}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  if (e.target.value) handlePlan(story.id, e.target.value);
                }}
              >
                <option value="">规划到迭代 ▾</option>
                {activeIterations.map(it => (
                  <option key={it.id} value={it.id}>{it.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MEMBERS PANEL
   ═══════════════════════════════════════════ */
function MembersPanel() {
  const { id } = useParams<{ id: string }>();
  const { members, loading, fetchMembers } = useWorkspaceStore();
  const { user } = useAuthStore();

  useEffect(() => { if (id) fetchMembers(id); }, [id]);

  // Show add button liberally — backend enforces OWNER/MANAGER permission
  const canManage = !user || members.length === 0
    ? true  // if user not loaded yet or empty workspace, show button
    : members.some((m: WorkspaceMember) => m.user_id === user.id && (m.role === 'OWNER' || m.role === 'MANAGER'));

  // Add member state
  const [addOpen, setAddOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [addForm, setAddForm] = useState({ user_id: '', role: 'MEMBER' });
  const [addError, setAddError] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const selectedUser = users.find((u: any) => u.id === addForm.user_id);

  const fetchUsers = async (keyword = '') => {
    setUsersLoading(true);
    setAddError('');
    try {
      const params: any = { page_size: 100 };
      if (keyword) params.keyword = keyword;
      const res: any = await api.get('/users', { params });
      const allUsers = res.data || [];
      const memberIds = new Set(members.map((m: WorkspaceMember) => m.user_id));
      setUsers(allUsers.filter((u: any) => !memberIds.has(u.id) && u.status === 'ACTIVE'));
    } catch (e: any) {
      setUsers([]);
      setAddError(e?.response?.data?.message || '加载用户列表失败');
    }
    setUsersLoading(false);
  };

  const handleUserSearch = (value: string) => {
    setUserSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchUsers(value), 300);
  };

  const openAdd = () => {
    setAddForm({ user_id: '', role: 'MEMBER' });
    setAddError('');
    setUserSearch('');
    fetchUsers();
    setAddOpen(true);
  };

  const submitAdd = async () => {
    if (!id || !addForm.user_id) { setAddError('请选择用户'); return; }
    setAddSubmitting(true);
    setAddError('');
    try {
      await api.post(`/workspaces/${id}/members`, addForm);
      setAddOpen(false);
      fetchMembers(id);
    } catch (e: any) {
      setAddError(e?.response?.data?.message || '添加失败');
    } finally { setAddSubmitting(false); }
  };

  const handleRemove = async (member: WorkspaceMember) => {
    if (!id) return;
    if (!confirm(`确定移除成员「${member.user_name || member.user_id}」？`)) return;
    try {
      await api.delete(`/workspaces/${id}/members/${member.id}`);
      fetchMembers(id);
    } catch (e: any) {
      alert(e?.response?.data?.message || '移除失败');
    }
  };

  const roleLabels: Record<string, string> = { OWNER: '所有者', MANAGER: '管理员', MEMBER: '成员', VIEWER: '观察者', AI_AGENT: 'AI Agent' };
  const roleColor: Record<string, string> = { OWNER: 'var(--amber-600)', MANAGER: 'var(--blue-600)', MEMBER: 'var(--text-secondary)', VIEWER: 'var(--text-muted)', AI_AGENT: 'var(--purple-500)' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>共 {members.length} 人</span>
        {canManage && (
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ 添加成员</button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>加载中...</div>
      ) : (
        <div className="member-grid">
          {members.map((m: WorkspaceMember) => (
            <div key={m.id} className="member-card" style={{ position: 'relative' }}>
              <div className={`m-avatar ${m.role === 'AI_AGENT' ? 'agent' : 'human'}`}>
                {(m.user_name || m.ai_agent_id || '?')[0]}
              </div>
              <div className="m-info">
                <div className="m-name">{m.user_name || m.ai_agent_id || m.user_id}</div>
                <div className="m-role" style={{ color: roleColor[m.role] }}>{roleLabels[m.role] || m.role}</div>
                {m.role !== 'AI_AGENT' && <div className="m-load">负载 78%</div>}
              </div>
              {canManage && m.role !== 'OWNER' && (
                <button
                  className="btn btn-ghost btn-xs"
                  style={{ position: 'absolute', top: 8, right: 8, color: 'var(--red-500)', fontSize: '0.6rem' }}
                  onClick={() => handleRemove(m)}
                  title="移除成员"
                >✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Member Panel — always rendered, controlled by open prop */}
      <SlidePanel open={addOpen} onClose={() => setAddOpen(false)} title="添加成员">
        <div className="form-group" style={{ position: 'relative' }}>
          <label>选择用户</label>
          {/* Selected user display */}
          {selectedUser ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface)', fontSize: '0.82rem',
            }}>
              <span>
                <strong>{selectedUser.display_name}</strong>
                <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({selectedUser.username})</span>
                {selectedUser.department_name && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 6 }}>— {selectedUser.department_name}</span>
                )}
              </span>
              <button className="btn btn-ghost btn-xs" onClick={() => { setAddForm((f) => ({ ...f, user_id: '' })); setUserSearch(''); fetchUsers(); }}>
                更改
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="搜索用户姓名或用户名..."
                value={userSearch}
                onChange={(e) => handleUserSearch(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
                autoFocus
              />
              {/* Dropdown list */}
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                maxHeight: 240, overflowY: 'auto',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                marginTop: 2,
              }}>
                {usersLoading ? (
                  <div style={{ padding: '10px 12px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>搜索中...</div>
                ) : users.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    {userSearch ? `没有匹配「${userSearch}」的用户` : '暂无可添加的用户'}
                  </div>
                ) : (
                  users.map((u: any) => (
                    <div
                      key={u.id}
                      onClick={() => { setAddForm((f) => ({ ...f, user_id: u.id })); setUserSearch(''); }}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem',
                        borderBottom: '1px solid var(--border-light)',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontWeight: 500 }}>{u.display_name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        @{u.username}{u.department_name ? ` · ${u.department_name}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        <div className="form-group">
          <label>角色</label>
          <select value={addForm.role} onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))} style={{ width: '100%' }}>
            <option value="MEMBER">成员</option>
            <option value="MANAGER">管理员</option>
            <option value="VIEWER">观察者</option>
          </select>
        </div>
        {addError && (
          <div style={{ color: 'var(--red-500)', fontSize: '0.78rem', padding: '8px 12px', background: 'var(--red-50)', borderRadius: 'var(--radius-sm)', marginBottom: 8 }}>{addError}</div>
        )}
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={submitAdd} disabled={addSubmitting || !addForm.user_id}>
            {addSubmitting ? '添加中...' : '添加'}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}

/* ═══════════════════════════════════════════
   EPICS PANEL
   ═══════════════════════════════════════════ */
function EpicsPanel() {
  const { id: wsId } = useParams<{ id: string }>();
  const { epics, fetchEpics } = useTaskStore();
  const { tasks, fetchList } = useTaskStore();
  const [expandedEpic, setExpandedEpic] = useState<string | null>(null);
  const [epicTasks, setEpicTasks] = useState<Record<string, Task[]>>({});

  useEffect(() => { if (wsId) fetchEpics(wsId); }, [wsId]);

  const toggleExpand = async (epicId: string) => {
    if (expandedEpic === epicId) { setExpandedEpic(null); return; }
    setExpandedEpic(epicId);
    if (!epicTasks[epicId] && wsId) {
      // Fetch children of this epic
      const res: any = await api.get(`/workspaces/${wsId}/tasks`, { params: { epic_id: epicId } });
      setEpicTasks((prev) => ({ ...prev, [epicId]: res.data || [] }));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 600 }}>共 {epics.length} 个 Epic</span>
        <button className="btn btn-primary btn-sm" onClick={() => {
          // Trigger task creation with EPIC type
          const event = new CustomEvent('create-epic');
          window.dispatchEvent(event);
        }}>+ 新建 Epic</button>
      </div>

      {epics.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <div>暂无 Epic</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {epics.map((epic: any) => {
            const progress = epic.total_stories > 0 ? Math.round((epic.done_stories / epic.total_stories) * 100) : 0;
            const isExpanded = expandedEpic === epic.id;

            return (
              <div key={epic.id}>
                <div
                  className="need-card"
                  onClick={() => toggleExpand(epic.id)}
                  style={{ marginBottom: 0 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>🎯 {epic.title}</h4>
                    <span className="badge badge-blue" style={{ fontSize: '0.68rem' }}>Epic</span>
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    <span>{epic.total_stories || 0} 个 Story</span>
                    <span>{epic.done_stories || 0} 已完成</span>
                  </div>
                  {epic.total_stories > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ height: 6, background: 'var(--bg-raised)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, background: 'var(--blue-500)', width: `${progress}%`, transition: 'width 0.5s var(--ease)' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Expanded children */}
                {isExpanded && (
                  <div style={{ marginLeft: 16, marginTop: 4, marginBottom: 8 }}>
                    {(epicTasks[epic.id] || []).map((t: Task) => (
                      <div key={t.id} className="need-card" style={{ marginBottom: 0, fontSize: '0.82rem', padding: '10px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{t.title}</span>
                          <span className="badge" style={{ fontSize: '0.65rem', background: 'var(--bg-raised)', color: 'var(--text-muted)' }}>
                            {t.status === 'DONE' ? '✓ 已完成' : t.status === 'IN_PROGRESS' ? '进行中' : t.status === 'IN_REVIEW' ? '待 Review' : '待办'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {(!epicTasks[epic.id] || epicTasks[epic.id].length === 0) && (
                      <div style={{ padding: '12px 14px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>暂无子任务</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   ITERATIONS PANEL
   ═══════════════════════════════════════════ */
const ITER_STATUS: Record<string, { label: string; cls: string }> = {
  PLANNING: { label: '规划中', cls: 'badge' },
  ACTIVE: { label: '进行中', cls: 'badge-blue' },
  CLOSED: { label: '已关闭', cls: 'badge-green' },
};

function IterationsPanel() {
  const { id: wsId } = useParams<{ id: string }>();
  const { iterations, loading, fetchList, create, update, startIter, closeIter } = useIterationStore();
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Iteration | null>(null);
  const [form, setForm] = useState({ name: '', goal: '', start_date: '', end_date: '', capacity_points: 0 });

  useEffect(() => { if (wsId) fetchList(wsId); }, [wsId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', goal: '', start_date: '', end_date: '', capacity_points: 0 });
    setPanelOpen(true);
  };

  const openEdit = (it: Iteration) => {
    setEditing(it);
    setForm({ name: it.name, goal: it.goal || '', start_date: it.start_date?.slice(0, 10) || '', end_date: it.end_date?.slice(0, 10) || '', capacity_points: it.capacity_points || 0 });
    setPanelOpen(true);
  };

  const submit = async () => {
    if (!wsId || !form.name.trim()) return;
    if (editing) {
      await update(wsId, editing.id, form as any);
    } else {
      await create(wsId, form as any);
    }
    setPanelOpen(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 600 }}>共 {iterations.length} 个迭代</span>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ 新建迭代</button>
      </div>

      {loading ? (
        <div className="empty-state">加载中...</div>
      ) : iterations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔄</div>
          <div>暂无迭代</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {iterations.map((it: Iteration) => {
            const st = ITER_STATUS[it.status] || ITER_STATUS.PLANNING;
            const progress = it.capacity_points > 0 ? Math.round((it.committed_points / it.capacity_points) * 100) : 0;

            return (
              <div
                key={it.id}
                className="need-card"
                onClick={() => openEdit(it)}
                style={{ marginBottom: 0 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>{it.name}</h4>
                    <div className="meta" style={{ marginTop: 4 }}>
                      <span>{it.start_date?.slice(0, 10)} → {it.end_date?.slice(0, 10)}</span>
                      <span>{it.task_count || 0} 个任务</span>
                    </div>
                    {it.goal && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>{it.goal}</div>}
                  </div>
                  <span className={st.cls} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 8 }}>
                    {st.label}
                  </span>
                </div>

                {/* Progress bar */}
                {it.status !== 'CLOSED' && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 3 }}>
                      <span>进度</span>
                      <span>{it.committed_points}/{it.capacity_points} pts ({progress}%)</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-raised)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: progress > 80 ? 'var(--green-500)' : progress > 40 ? 'var(--blue-500)' : 'var(--amber-500)', width: `${Math.min(progress, 100)}%`, transition: 'width 0.5s var(--ease)' }} />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ marginTop: 8, display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  {it.status === 'PLANNING' && (
                    <button className="btn btn-xs btn-primary" onClick={() => wsId && startIter(wsId, it.id)}>启动迭代</button>
                  )}
                  {it.status === 'ACTIVE' && (
                    <button className="btn btn-xs btn-ghost" onClick={() => wsId && closeIter(wsId, it.id)}>关闭迭代</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Panel */}
      <SlidePanel open={panelOpen} onClose={() => setPanelOpen(false)} title={editing ? '编辑迭代' : '新建迭代'}>
        <div className="form-group">
          <label>迭代名称</label>
          <input type="text" placeholder="例如：Sprint 6" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>目标</label>
          <textarea rows={3} placeholder="迭代目标（可选）" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', fontFamily: 'inherit', background: 'var(--bg-surface)', color: 'var(--text-primary)', resize: 'vertical' }} value={form.goal} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>开始日期</label>
            <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>结束日期</label>
            <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label>容量（故事点）</label>
          <input type="number" value={form.capacity_points} onChange={(e) => setForm((f) => ({ ...f, capacity_points: Number(e.target.value) }))} />
        </div>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={() => setPanelOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={submit}>{editing ? '保存' : '创建迭代'}</button>
        </div>
      </SlidePanel>
    </div>
  );
}

/* ═══════════════════════════════════════════
   REPORTS PANEL
   ═══════════════════════════════════════════ */
function BurndownChart({ wsId }: { wsId: string }) {
  const { iterations, fetchList, burndown, fetchBurndown } = useIterationStore();
  const [iterId, setIterId] = useState<string>('');

  useEffect(() => { fetchList(wsId); }, [wsId]);

  useEffect(() => {
    if (iterId) fetchBurndown(wsId, iterId);
  }, [iterId, wsId]);

  const data: { date: string; remaining: number; ideal: number }[] = burndown || [];
  const w = 560, h = 200, pad = { top: 12, right: 16, bottom: 28, left: 40 };
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;

  const maxVal = Math.max(...data.map(d => Math.max(d.remaining, d.ideal)), 1);
  const yTick = (v: number) => pad.top + ph * (1 - v / maxVal);
  const xTick = (i: number) => pad.left + (data.length > 1 ? (i / (data.length - 1)) * pw : pw / 2);

  const linePath = (field: 'remaining' | 'ideal') =>
    data.length > 0
      ? data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xTick(i)},${yTick(d[field])}`).join(' ')
      : '';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4>迭代燃尽图</h4>
        <select
          style={{ padding: '4px 8px', fontSize: '0.74rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
          value={iterId}
          onChange={(e) => setIterId(e.target.value)}
        >
          <option value="">选择迭代...</option>
          {iterations.filter((it) => it.status === 'ACTIVE' || it.status === 'PLANNING').map((it) => (
            <option key={it.id} value={it.id}>{it.name} ({it.status === 'ACTIVE' ? '进行中' : '计划中'})</option>
          ))}
        </select>
      </div>
      {data.length === 0 ? (
        <div className="report-chart" style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{iterId ? '暂无燃尽数据' : '请选择一个迭代'}</span>
        </div>
      ) : (
        <svg width={w} height={h} style={{ display: 'block', margin: '0 auto' }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
            <g key={pct}>
              <line x1={pad.left} x2={w - pad.right} y1={yTick(maxVal * pct)} y2={yTick(maxVal * pct)} stroke="var(--border-light)" strokeWidth={0.5} />
              <text x={pad.left - 6} y={yTick(maxVal * pct) + 3} textAnchor="end" fontSize={8} fill="var(--text-muted)">{Math.round(maxVal * pct)}</text>
            </g>
          ))}
          {/* Ideal line */}
          <path d={linePath('ideal')} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4,3" />
          {/* Actual line */}
          <path d={linePath('remaining')} fill="none" stroke="var(--blue-500)" strokeWidth={2} />
          {/* Dots */}
          {data.map((d, i) => (
            <g key={i}>
              <circle cx={xTick(i)} cy={yTick(d.remaining)} r={3} fill="var(--blue-500)" />
              <text x={xTick(i)} y={h - 4} textAnchor="middle" fontSize={7} fill="var(--text-muted)">
                {d.date.slice(5)}
              </text>
            </g>
          ))}
          {/* Legend */}
          <rect x={w - 180} y={pad.top} width={8} height={8} fill="var(--blue-500)" rx={2} />
          <text x={w - 168} y={pad.top + 7} fontSize={8} fill="var(--text-secondary)">实际剩余</text>
          <rect x={w - 100} y={pad.top} width={8} height={8} fill="none" stroke="var(--text-muted)" strokeWidth={1} rx={2} />
          <text x={w - 88} y={pad.top + 7} fontSize={8} fill="var(--text-secondary)">理想线</text>
        </svg>
      )}
    </div>
  );
}

function ReportsPanel() {
  const { id: wsId } = useParams<{ id: string }>();
  const { kanban, fetchKanban } = useTaskStore();
  const { members, fetchMembers } = useWorkspaceStore();

  useEffect(() => {
    if (wsId) { fetchKanban(wsId); fetchMembers(wsId); }
  }, [wsId]);

  // Compute task distribution from kanban data
  const statusLabels = ['待办', '进行中', '待 Review', '已完成'];
  const statusKeys = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
  const statusColors = ['#94a3b8', '#60a5fa', '#f59e0b', '#34d399'];
  const maxCount = Math.max(...statusKeys.map((k) => (kanban[k] || []).length), 1);

  // Compute priority distribution from all tasks
  const allTasks = Object.values(kanban).flat();
  const priorityCounts: Record<string, number> = {};
  allTasks.forEach((t: any) => { priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1; });
  const maxPriority = Math.max(...Object.values(priorityCounts), 1);

  return (
    <div className="report-grid">
      <div className="report-card">
        <h4>任务分布</h4>
        <div className="report-chart">
          <div style={{ width: '100%', padding: '0 16px' }}>
            {statusKeys.map((k, i) => {
              const count = (kanban[k] || []).length;
              return (
                <div key={k} className="report-bar">
                  <span className="bar-label">{statusLabels[i]}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(count / maxCount) * 100}%`, background: statusColors[i] }} />
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 20, textAlign: 'right' }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="report-card">
        <h4>按优先级分布</h4>
        <div className="report-chart">
          <div style={{ width: '100%', padding: '0 16px' }}>
            {Object.entries(priorityCounts).length > 0 ? (
              Object.entries(priorityCounts).map(([p, c]) => (
                <div key={p} className="report-bar">
                  <span className="bar-label">{p === 'CRITICAL' ? '紧急' : p === 'HIGH' ? '高' : p === 'MEDIUM' ? '中' : '低'}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{
                      width: `${(c / maxPriority) * 100}%`,
                      background: p === 'CRITICAL' ? 'var(--red-500)' : p === 'HIGH' ? 'var(--amber-500)' : p === 'MEDIUM' ? 'var(--blue-500)' : 'var(--text-muted)',
                    }} />
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 20, textAlign: 'right' }}>{c}</span>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>暂无数据</div>
            )}
          </div>
        </div>
      </div>

      <div className="report-card">
        <h4>团队负载</h4>
        <div className="report-chart">
          <div style={{ width: '100%', padding: '0 16px' }}>
            {members.length > 0 ? (
              (() => {
                // Calculate real workload: active tasks per member / max active tasks
                const memberLoad = members
                  .filter((m: WorkspaceMember) => m.role !== 'AI_AGENT')
                  .map((m: WorkspaceMember) => {
                    const total = allTasks.filter((t: any) => t.assignee_id === (m.user_id || m.id) && t.status !== 'DONE').length;
                    const inProgress = allTasks.filter((t: any) => t.assignee_id === (m.user_id || m.id) && t.status === 'IN_PROGRESS').length;
                    return { member: m, total, inProgress };
                  });
                const maxLoad = Math.max(...memberLoad.map((l) => l.total), 1);
                return memberLoad.map(({ member: m, total, inProgress }) => (
                  <div key={m.id} className="report-bar">
                    <span className="bar-label">{m.user_name || m.user_id}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{
                        width: `${(total / maxLoad) * 100}%`,
                        background: total > 5 ? 'var(--red-400)' : total > 2 ? 'var(--amber-400)' : 'var(--blue-400)',
                      }} />
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 48, textAlign: 'right' }}>
                      {total} 进行中({inProgress})
                    </span>
                  </div>
                ));
              })()
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>暂无数据</div>
            )}
          </div>
        </div>
      </div>

      <div className="report-card" style={{ gridColumn: '1 / -1' }}>
        <BurndownChart wsId={wsId!} />
      </div>

      <div className="report-card">
        <h4>概览统计</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--radius)', padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--blue-600)' }}>{allTasks.length}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>总任务数</div>
          </div>
          <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--radius)', padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--green-600)' }}>{(kanban['DONE'] || []).length}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>已完成</div>
          </div>
          <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--radius)', padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--amber-600)' }}>{members.length}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>团队人数</div>
          </div>
          <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--radius)', padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--blue-600)' }}>
              {allTasks.length > 0 ? Math.round(((kanban['DONE'] || []).length / allTasks.length) * 100) : 0}%
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>完成率</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   WORKSPACE DETAIL PAGE
   ═══════════════════════════════════════════ */
export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { current, loading, fetchDetail } = useWorkspaceStore();
  const { create, update, remove, reviewDesign, reviewRequirement, advancePhase, returnPhase } = useTaskStore();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('tasks');
  const [activeView, setActiveView] = useState('kanban');
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<string>('');
  const [selectedIteration, setSelectedIteration] = useState<string>('');
  const [msEditOpen, setMsEditOpen] = useState(false);
  const [msEditForm, setMsEditForm] = useState<{ id: string; name: string; description: string; plan: string; owner_id: string; status: string; start_date: string; end_date: string }>({ id: '', name: '', description: '', plan: '', owner_id: '', status: 'UPCOMING', start_date: '', end_date: '' });
  const wsType = current?.type || 'PROJECT';
  const isFull = wsType === 'PROJECT';
  const allMilestones = useMilestoneStore((s) => s.milestones);
  const allIterations = useIterationStore((s) => s.iterations);
  const membersRaw = useWorkspaceStore((s) => s.members);
  const allMembers = membersRaw.filter((m) => m.role !== 'AI_AGENT');
  const allReviewers = allMembers.filter((m) => m.role !== 'VIEWER');

  const getDefaultPhase = (ttype: string) => {
    if (ttype === 'STORY') return 'BACKLOG';
    if (ttype === 'BUG') return 'DEVELOPMENT';
    return 'DEVELOPMENT';
  };
  const [taskForm, setTaskForm] = useState<{ title: string; description: string; task_type: string; priority: string; status: string; phase: string; iteration_id?: string; milestone_id: string; assignee_id?: string; reviewer_id?: string; proposer_id?: string; analyst_id?: string; qa_owner_id?: string; acceptance_owner_id?: string; verifier_id?: string; parent_id?: string; design_doc?: string; prd_doc?: string; self_test_report?: string; test_report?: string; rating?: number; evaluation?: string }>({ title: '', description: '', task_type: 'TASK', priority: 'MEDIUM', status: 'TODO', phase: 'DEVELOPMENT', milestone_id: '', design_doc: '' });
  const [stories, setStories] = useState<Task[]>([]);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [detailTab, setDetailTab] = useState<'info' | 'related' | 'attachments'>('info');
  const [relatedTasks, setRelatedTasks] = useState<Task[]>([]);
  const [parentStory, setParentStory] = useState<Task | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [docTab, setDocTab] = useState<'prd' | 'design' | 'test'>('prd');
  const [dragOver, setDragOver] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | ''>('');

  const fetchComments = async (taskId: string) => {
    const res: any = await api.get(`/tasks/${taskId}/comments`);
    setComments(res.data || []);
  };

  const fetchActivity = async (taskId: string) => {
    try {
      const res: any = await api.get(`/workspaces/${id}/tasks/${taskId}/activity`);
      setActivityLogs(res.data || []);
    } catch { setActivityLogs([]); }
  };

  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxSize = 1200;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('compress failed'));
        }, 'image/jpeg', 0.8);
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handlePasteImage = async (e: React.ClipboardEvent<HTMLTextAreaElement>, field: string) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) continue;
        if (file.size > 10 * 1024 * 1024) {
          alert('图片过大（>10MB），请手动压缩后上传');
          continue;
        }
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const placeholder = '⏳ 图片上传中...';
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);
        textarea.value = before + placeholder + after;
        textarea.selectionStart = textarea.selectionEnd = start + placeholder.length;
        const ev = new Event('input', { bubbles: true });
        textarea.dispatchEvent(ev);
        try {
          const compressed = await compressImage(file);
          const form = new FormData();
          form.append('file', compressed, file.name || 'image.png');
          const res: any = await api.post(`/workspaces/${id}/tasks/${editingTask!.id}/attachments`, form);
          const att = res.data;
          const url = `${window.location.origin}/api/workspaces/${id}/tasks/${editingTask!.id}/attachments/${att.id}/download`;
          const mdImg = `![${att.filename}](${url})`;
          const currentVal = textarea.value;
          textarea.value = currentVal.replace(placeholder, mdImg);
          textarea.dispatchEvent(ev);
          const newVal = textarea.value;
          update(id!, editingTask!.id, { [field]: newVal } as any);
        } catch {
          const currentVal = textarea.value;
          textarea.value = currentVal.replace(placeholder, '⚠️ 图片上传失败');
          textarea.dispatchEvent(ev);
        }
      }
    }
  };

  // Default to showing all tasks (empty string = no filter)
  const milestones = useMilestoneStore((s) => s.milestones);

  const openTaskPanel = async (status?: string, task?: Task, parentStoryId?: string, defaultPhase?: string, defaultType?: string) => {
    const scopeId = isFull ? selectedIteration : selectedMilestone;
    // Fetch available stories for parent selection
    if (id && scopeId) {
      await useTaskStore.getState().fetchList(id, { [isFull ? 'iteration_id' : 'milestone_id']: scopeId, task_type: 'STORY', page_size: 100 });
      const allTasks = useTaskStore.getState().tasks;
      setStories(allTasks);
    }
    if (task) {
      setEditingTask(task);
      setTaskForm({ title: task.title, description: task.description || '', task_type: task.task_type, priority: task.priority, status: task.status, phase: task.phase || 'PLAN', iteration_id: task.iteration_id || undefined, milestone_id: task.milestone_id || '', assignee_id: task.assignee_id || undefined, reviewer_id: task.reviewer_id || undefined, proposer_id: task.proposer_id || undefined, analyst_id: task.analyst_id || undefined, qa_owner_id: task.qa_owner_id || undefined, acceptance_owner_id: (task as any).acceptance_owner_id || undefined, verifier_id: task.verifier_id || undefined, parent_id: task.parent_id || undefined, design_doc: (task as any).design_doc || '', prd_doc: (task as any).prd_doc || '', self_test_report: (task as any).self_test_report || '', test_report: (task as any).test_report || '', rating: (task as any).rating || undefined, evaluation: (task as any).evaluation || '' });
      fetchComments(task.id);
      fetchActivity(task.id);
      fetchRelations(task);
      fetchAttachments(task.id);
      setDetailTab('info');
    } else {
      setEditingTask(null);
      setComments([]);
      setActivityLogs([]);
      setAttachments([]);
      const newType = defaultType || 'TASK';
      const isStory = newType === 'STORY';
      setTaskForm({
        title: '', description: '', task_type: newType,
        priority: 'MEDIUM',
        status: isStory ? 'DONE' : (status || 'TODO'),
        phase: getDefaultPhase(newType),
        iteration_id: isStory ? undefined : (isFull ? selectedIteration || undefined : undefined),
        milestone_id: isFull ? '' : selectedMilestone,
        assignee_id: undefined, reviewer_id: undefined,
        proposer_id: isStory && user ? user.id : undefined,
        analyst_id: undefined,
        qa_owner_id: isStory && user ? user.id : undefined,
        acceptance_owner_id: isStory && user ? user.id : undefined,
        verifier_id: undefined,
        parent_id: parentStoryId || undefined,
      });
    }
    setShowDelete(false);
    setTaskPanelOpen(true);
  };

  const fetchRelations = async (task: Task) => {
    if (!id) return;
    setRelatedTasks([]);
    setParentStory(null);
    // Story: fetch children (tasks + bugs)
    if (task.task_type === 'STORY') {
      try {
        const res: any = await api.get(`/workspaces/${id}/tasks`, { params: { parent_id: task.id, page_size: 100 } });
        setRelatedTasks(res.data || []);
      } catch { setRelatedTasks([]); }
    }
    // Task/Bug/SubTask: fetch parent story
    if ((task.task_type === 'TASK' || task.task_type === 'BUG' || task.task_type === 'SUB_TASK') && task.parent_id) {
      try {
        const parentRes: any = await api.get(`/workspaces/${id}/tasks/${task.parent_id}`);
        setParentStory(parentRes.data || null);
      } catch { setParentStory(null); }
    }
  };

  const fetchAttachments = async (taskId: string) => {
    if (!id) return;
    try {
      const res: any = await api.get(`/workspaces/${id}/tasks/${taskId}/attachments`);
      setAttachments(res.data || []);
    } catch { setAttachments([]); }
  };

  const handleUpload = async (taskId: string, file: File) => {
    if (!id) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/workspaces/${id}/tasks/${taskId}/attachments`, form);
      await fetchAttachments(taskId);
    } catch { alert('上传附件失败'); }
    setUploading(false);
  };

  const openMilestoneEdit = (ms: any) => {
    setMsEditForm({ id: ms.id, name: ms.name, description: ms.description || '', plan: ms.plan || '', owner_id: ms.owner_id || '', status: ms.status, start_date: ms.start_date?.slice(0, 10) || '', end_date: ms.end_date?.slice(0, 10) || '' });
    setMsEditOpen(true);
  };

  const submitMsEdit = async () => {
    if (!id || !msEditForm.name.trim()) return;
    await useMilestoneStore.getState().update(id, msEditForm.id, msEditForm);
    setMsEditOpen(false);
  };

  const deleteMs = async () => {
    if (!id) return;
    await useMilestoneStore.getState().remove(id, msEditForm.id);
    setMsEditOpen(false);
    if (selectedMilestone === msEditForm.id) { const ms = milestones.find((m) => m.id !== msEditForm.id); setSelectedMilestone(ms?.id || ''); }
  };

  const submitTask = async () => {
    if (!id || !taskForm.title.trim()) return;
    setTaskSubmitting(true);
    try {
      if (editingTask) {
        await update(id, editingTask.id, taskForm as any);
      } else {
        await create(id, taskForm as any);
      }
      setTaskPanelOpen(false);
    } finally {
      setTaskSubmitting(false);
    }
  };

  const deleteTask = async () => {
    if (!id || !editingTask) return;
    setTaskSubmitting(true);
    try {
      await remove(id, editingTask.id);
      setTaskPanelOpen(false);
    } finally {
      setTaskSubmitting(false);
    }
  };

  useEffect(() => { if (id) fetchDetail(id); }, [id]);

  if (loading || !current) {
    return <div style={{ textAlign: 'center', padding: 100, color: 'var(--text-muted)' }}>加载中...</div>;
  }

  const tabs = isFull
    ? [
        { key: 'backlog', label: '需求池' },
        { key: 'tasks', label: '任务看板' },
        { key: 'kb', label: '知识库' },
        { key: 'iterations', label: '迭代' },
        { key: 'members', label: '成员' },
        { key: 'reports', label: '报表' },
      ]
    : [
        { key: 'tasks', label: '任务看板' },
        { key: 'kb', label: '知识库' },
        { key: 'members', label: '成员' },
      ];

  return (
    <div style={{ maxWidth: 'none', padding: '16px 20px 40px' }}>
      {/* Pulse Header */}
      <div className="pulse-header">
        <div className="ph-left">
          <div className="back" onClick={() => navigate('/workspaces')}>← 返回工作空间</div>
          <div className="proj-name">{current.name}</div>
          <div className="proj-meta">
            {isFull ? '研发项目' : '专题项目'} · 创建于 {current.created_at?.slice(0, 10)}
            {' '}
            <span className="ospec-badge">{isFull ? '迭代驱动研发流程' : '里程碑驱动专题管理'}</span>
          </div>
        </div>
        <div className="ph-actions">
          <button className="btn btn-ghost btn-sm">投屏</button>
        </div>
      </div>

      {/* Focus Strip */}
      <div className="focus-strip">
        <div className="fs-item">
          <span className="fs-dot red" />
          <span className="fs-text">前端首页重构延期 3 天 · 阻塞下游 2 个任务</span>
          <button className="fs-btn primary">处理</button>
        </div>
        <div className="fs-item">
          <span className="fs-dot green" />
          <span className="fs-text">AI 设计师完成线框图 · 等待 Review</span>
          <button className="fs-btn primary">Review</button>
        </div>
        <div className="fs-item">
          <span className="fs-dot amber" />
          <span className="fs-text">李四负载 120% · 建议暂缓新任务</span>
          <button className="fs-btn">查看</button>
        </div>
      </div>

      {/* KPI Row — full and simple modes only */}
      {<KpiRow />}

      {/* 3-Column Layout */}
      <div className="pulse-layout">
        {isFull ? (
          <IterationSidebar
            selectedId={selectedIteration}
            onSelect={(id) => setSelectedIteration(id)}
          />
        ) : (
          <MilestoneSidebar
            selectedId={selectedMilestone}
            onSelect={(id) => setSelectedMilestone(id)}
            onEdit={openMilestoneEdit}
          />
        )}

        {/* Main Content */}
        <div className="pulse-main">
          {/* Workspace Tabs */}
          <div className="ws-tabs">
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`ws-tab${t.key === activeTab ? ' active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Panels */}
          <div>
            {activeTab === 'backlog' && (
              <div className="ws-panel active" id="ws-panel-backlog" style={{ padding: '16px 20px' }}>
                <BacklogPanel
                  onEditStory={(story) => openTaskPanel(undefined, story)}
                  onCreateStory={() => openTaskPanel('TODO', undefined, undefined, 'BACKLOG', 'STORY')}
                  selectedIteration={selectedIteration}
                />
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="ws-panel active" id="ws-panel-tasks">
                <div className="view-switcher">
                  {(isFull
                    ? [{ key: 'kanban', label: '看板' }, { key: 'list', label: '列表' }]
                    : [{ key: 'kanban', label: '看板' }, { key: 'list', label: '列表' }]
                  ).map((v: any) => (
                    <button
                      key={v.key}
                      className={`view-switch${v.key === activeView ? ' active' : ''}`}
                      onClick={() => setActiveView(v.key)}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                {activeView === 'kanban' && <KanbanView onCreateTask={(status, phase, parentId) => openTaskPanel(status, undefined, parentId, phase)} onEditTask={(task) => openTaskPanel(undefined, task)} scopeFilter={isFull ? selectedIteration : selectedMilestone} isFull={isFull} />}
                {activeView === 'list' && <ListView onEditTask={(task) => openTaskPanel(undefined, task)} scopeFilter={isFull ? selectedIteration : selectedMilestone} isFull={isFull} />}
              </div>
            )}

            {activeTab === 'kb' && (
              <div className="ws-panel active">
                <KnowledgePanel />
              </div>
            )}

            {activeTab === 'iterations' && (
              <div className="ws-panel active">
                <IterationsPanel />
              </div>
            )}

            {activeTab === 'members' && (
              <div className="ws-panel active">
                <MembersPanel />
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="ws-panel active">
                <ReportsPanel />
              </div>
            )}
          </div>
        </div>

        {/* Inline Chat */}
        <PulseChat />
      </div>

      {/* Task Create/Edit Panel */}
      <SlidePanel
        open={taskPanelOpen}
        onClose={() => setTaskPanelOpen(false)}
        title={editingTask ? (taskForm.task_type === 'STORY' ? '编辑需求' : '编辑任务') : (taskForm.task_type === 'STORY' ? '新建需求' : '新建任务')}
      >
        {/* Permission indicator — edit mode */}
        {editingTask && editingTask.permissions && (
          <div style={{ marginBottom: 12, padding: '6px 10px', background:
            editingTask.permissions.role === 'manager' ? 'var(--blue-50)' :
            editingTask.permissions.role === 'assignee' ? 'var(--green-50)' :
            editingTask.permissions.role === 'reviewer' ? 'var(--amber-50)' :
            'var(--bg-raised)',
            borderRadius: 'var(--radius-sm)', fontSize: '0.68rem', border: '1px solid',
            borderColor:
            editingTask.permissions.role === 'manager' ? 'var(--blue-200)' :
            editingTask.permissions.role === 'assignee' ? 'var(--green-200)' :
            editingTask.permissions.role === 'reviewer' ? 'var(--amber-200)' :
            'var(--border-light)',
          }}>
            {editingTask.permissions.role === 'manager' && '🔑 你是项目负责人，拥有全部编辑权限'}
            {editingTask.permissions.role === 'assignee' && '✅ 你是此任务负责人，可以编辑内容和推进状态'}
            {editingTask.permissions.role === 'reviewer' && '👀 你是此任务审核人，可以审核通过或打回'}
            {editingTask.permissions.role === 'member' && 'ℹ️ 你只能查看此任务'}
          </div>
        )}

        {/* Tabs: Info / Related */}
        {editingTask && (
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={() => setDetailTab('info')}
              style={{
                padding: '6px 16px', fontSize: '0.76rem', fontWeight: detailTab === 'info' ? 600 : 400,
                border: 'none', background: 'none', borderBottom: detailTab === 'info' ? '2px solid var(--blue-500)' : '2px solid transparent',
                color: detailTab === 'info' ? 'var(--blue-600)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >📋 基本信息</button>
            {editingTask.task_type === 'STORY' && (
              <button
                onClick={() => setDetailTab('related')}
                style={{
                  padding: '6px 16px', fontSize: '0.76rem', fontWeight: detailTab === 'related' ? 600 : 400,
                  border: 'none', background: 'none', borderBottom: detailTab === 'related' ? '2px solid var(--blue-500)' : '2px solid transparent',
                  color: detailTab === 'related' ? 'var(--blue-600)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >🔗 关联任务 ({relatedTasks.length})</button>
            )}
            {(editingTask.task_type === 'TASK' || editingTask.task_type === 'BUG' || editingTask.task_type === 'SUB_TASK') && editingTask.parent_id && (
              <button
                onClick={() => setDetailTab('related')}
                style={{
                  padding: '6px 16px', fontSize: '0.76rem', fontWeight: detailTab === 'related' ? 600 : 400,
                  border: 'none', background: 'none', borderBottom: detailTab === 'related' ? '2px solid var(--blue-500)' : '2px solid transparent',
                  color: detailTab === 'related' ? 'var(--blue-600)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >🔗 关联需求</button>
            )}
            <button
              onClick={() => setDetailTab('attachments')}
              style={{
                padding: '6px 16px', fontSize: '0.76rem', fontWeight: detailTab === 'attachments' ? 600 : 400,
                border: 'none', background: 'none', borderBottom: detailTab === 'attachments' ? '2px solid var(--blue-500)' : '2px solid transparent',
                color: detailTab === 'attachments' ? 'var(--blue-600)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >📎 附件 ({attachments.length})</button>
          </div>
        )}

        {/* Attachments Tab Content */}
        {editingTask && detailTab === 'attachments' && (() => {
          const uploadFiles = async (files: FileList | File[]) => {
            for (const file of Array.from(files)) {
              if (editingTask) await handleUpload(editingTask.id, file);
            }
          };

          return (
            <div style={{ marginBottom: 16 }}>
              {/* Drag-drop zone */}
              <div
                ref={dropZoneRef}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files.length > 0) await uploadFiles(e.dataTransfer.files);
                }}
                style={{
                  padding: '16px', textAlign: 'center',
                  border: `2px dashed ${dragOver ? 'var(--blue-400)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-md)', marginBottom: 12,
                  background: dragOver ? 'var(--blue-50)' : 'var(--bg-surface)',
                  transition: '0.15s',
                }}
              >
                {uploading ? '⏳ 上传中...' : '拖拽文件到此处上传，或点击选择'}
                <br />
                <label style={{
                  display: 'inline-block', marginTop: 8, padding: '4px 12px',
                  fontSize: '0.72rem', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', background: '#fff',
                }}>
                  选择文件
                  <input type="file" multiple style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) uploadFiles(e.target.files);
                      e.target.value = '';
                    }} />
                </label>
              </div>

              {/* File list */}
              {attachments.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.74rem', padding: 12 }}>暂无附件</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                  {attachments.map((att: any) => {
                    const isImage = att.mime_type?.startsWith('image/');
                    const downloadUrl = `/api/workspaces/${id}/tasks/${editingTask!.id}/attachments/${att.id}/download`;
                    const copyMdRef = () => {
                      const md = isImage ? `![${att.filename}](${window.location.origin}${downloadUrl})` : `[${att.filename}](${window.location.origin}${downloadUrl})`;
                      navigator.clipboard.writeText(md).catch(() => {});
                    };
                    return (
                      <div key={att.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                        background: 'var(--bg-raised)', borderRadius: 'var(--radius-sm)',
                        fontSize: '0.74rem',
                      }}>
                        {/* Thumbnail for images, icon otherwise */}
                        {isImage ? (
                          <img src={downloadUrl} alt={att.filename}
                            style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, flexShrink: 0, background: 'var(--bg-hover)' }} />
                        ) : (
                          <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{getFileIcon(att.mime_type)}</span>
                        )}
                        <a href={downloadUrl} target="_blank" rel="noopener noreferrer"
                          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--blue-600)', textDecoration: 'none' }}
                          title={att.filename}
                        >{att.filename}</a>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flexShrink: 0 }}>{att.file_size > 1024 ? `${(att.file_size / 1024).toFixed(1)}KB` : `${att.file_size}B`}</span>
                        <button type="button" className="btn btn-ghost btn-xs" title="复制 Markdown 引用"
                          style={{ fontSize: '0.6rem', padding: '1px 4px' }}
                          onClick={(e) => { e.stopPropagation(); copyMdRef(); }}
                        >📋</button>
                        <button type="button" className="btn btn-ghost btn-xs"
                          style={{ fontSize: '0.6rem', color: 'var(--red-500)', padding: '1px 6px' }}
                          onClick={async () => {
                            if (!id) return;
                            try {
                              await api.delete(`/workspaces/${id}/tasks/${editingTask!.id}/attachments/${att.id}`);
                              fetchAttachments(editingTask!.id);
                            } catch { alert('删除附件失败'); }
                          }}
                        >删除</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Related Tab Content */}
        {editingTask && detailTab === 'related' && (
          <div style={{ marginBottom: 16 }}>
            {/* Story → children */}
            {editingTask.task_type === 'STORY' && (
              <div>
                {relatedTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', padding: 20 }}>
                    暂无关联任务。Story 负责人可以在此拆分子任务。
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {relatedTasks.map((child: Task) => {
                      const stIcon: Record<string, string> = { EPIC: '🎯', STORY: '📋', TASK: '✅', BUG: '🐛', SUB_TASK: '📌', SPIKE: '🔬' };
                      const iconEmoji = stIcon[child.task_type] || '📄';
                      const stCls = child.task_type === 'BUG' ? 'bug' : 'task';
                      const stLabel = STATUS_LABELS[child.status] || child.status;
                      return (
                        <div
                          key={child.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                            background: 'var(--bg-raised)', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-light)', cursor: 'pointer', fontSize: '0.76rem',
                          }}
                          onClick={async () => {
                            const detail = await useTaskStore.getState().fetchDetail(id!, child.id);
                            const t = useTaskStore.getState().current;
                            if (t) {
                              setEditingTask(t);
                              setTaskForm({ title: t.title, description: t.description || '', task_type: t.task_type, priority: t.priority, status: t.status, phase: t.phase || 'PLAN', iteration_id: t.iteration_id || undefined, milestone_id: t.milestone_id || '', assignee_id: t.assignee_id || undefined, reviewer_id: t.reviewer_id || undefined, proposer_id: t.proposer_id || undefined, analyst_id: t.analyst_id || undefined, qa_owner_id: t.qa_owner_id || undefined, acceptance_owner_id: (t as any).acceptance_owner_id || undefined, verifier_id: t.verifier_id || undefined, parent_id: t.parent_id || undefined, design_doc: (t as any).design_doc || '', prd_doc: (t as any).prd_doc || '', self_test_report: (t as any).self_test_report || '', test_report: (t as any).test_report || '', rating: (t as any).rating || undefined, evaluation: (t as any).evaluation || '' });
                              fetchComments(t.id);
                              fetchActivity(t.id);
                              fetchRelations(t);
                            }
                          }}
                        >
                          <span style={{ fontSize: '0.9rem' }}>{iconEmoji}</span>
                          <span className={`card-type-badge ${stCls}`} style={{ marginBottom: 0 }}>{child.task_type}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{child.title}</span>
                          <span className="badge" style={{ fontSize: '0.6rem', background: 'var(--bg-surface)' }}>{stLabel}</span>
                          {child.assignee_name && <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{child.assignee_name}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Task/Bug/SubTask → parent Story */}
            {(editingTask.task_type === 'TASK' || editingTask.task_type === 'BUG' || editingTask.task_type === 'SUB_TASK') && (
              <div>
                {parentStory ? (
                  <div
                    style={{
                      padding: '12px 14px', background: 'var(--bg-raised)', borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-light)', cursor: 'pointer',
                    }}
                    onClick={async () => {
                      const detail = await useTaskStore.getState().fetchDetail(id!, parentStory.id);
                      const t = useTaskStore.getState().current;
                      if (t) {
                        setEditingTask(t);
                        setTaskForm({ title: t.title, description: t.description || '', task_type: t.task_type, priority: t.priority, status: t.status, phase: t.phase || 'PLAN', iteration_id: t.iteration_id || undefined, milestone_id: t.milestone_id || '', assignee_id: t.assignee_id || undefined, reviewer_id: t.reviewer_id || undefined, proposer_id: t.proposer_id || undefined, analyst_id: t.analyst_id || undefined, qa_owner_id: t.qa_owner_id || undefined, acceptance_owner_id: (t as any).acceptance_owner_id || undefined, verifier_id: t.verifier_id || undefined, parent_id: t.parent_id || undefined, design_doc: (t as any).design_doc || '', prd_doc: (t as any).prd_doc || '', self_test_report: (t as any).self_test_report || '', test_report: (t as any).test_report || '', rating: (t as any).rating || undefined, evaluation: (t as any).evaluation || '' });
                        fetchComments(t.id);
                        fetchActivity(t.id);
                        fetchRelations(t);
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: '1rem' }}>📋</span>
                      <span className="card-type-badge story">STORY</span>
                      <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{parentStory.title}</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                      <span>状态: {STATUS_LABELS[parentStory.status]}</span>
                      <span>阶段: {PHASE_LABELS[parentStory.phase]}</span>
                      {parentStory.assignee_name && <span>负责人: {parentStory.assignee_name}</span>}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', padding: 20 }}>
                    未关联到父需求
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(!editingTask || detailTab === 'info') && (
        <div>
        {/* Phase status banner + review action */}
        {editingTask && isFull && editingTask.task_type === 'STORY' && (
          <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-raised)', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>当前阶段</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--blue-600)' }}>{
                  ({BACKLOG:'需求池',PLAN:'需求规划',DESIGN:'方案设计',DEVELOPMENT:'开发实现',TESTING:'测试验证',RELEASE:'发布上线'})[editingTask.phase] || editingTask.phase
                }</span>
              </div>
              {/* Design review badge — shown during DESIGN phase */}
              {editingTask.phase === 'DESIGN' && editingTask.design_review_status && (
                editingTask.design_review_status === 'APPROVED'
                  ? <span style={{ fontSize:'0.7rem',padding:'2px 10px',borderRadius:10,background:'#dcfce7',color:'#16a34a',fontWeight:600 }}>✅ 方案已通过</span>
                  : editingTask.design_review_status === 'REJECTED'
                  ? <span style={{ fontSize:'0.7rem',padding:'2px 10px',borderRadius:10,background:'#fee2e2',color:'#dc2626',fontWeight:600 }}>❌ 方案已驳回</span>
                  : <span style={{ fontSize:'0.7rem',padding:'2px 10px',borderRadius:10,background:'#fef3c7',color:'#d97706',fontWeight:600 }}>⏳ 待评审</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['BACKLOG','PLAN','DESIGN','DEVELOPMENT','TESTING','RELEASE'] as const).map((ph) => {
                const labels: Record<string,string> = {BACKLOG:'需求池',PLAN:'需求',DESIGN:'设计',DEVELOPMENT:'开发',TESTING:'测试',RELEASE:'发布'};
                const phases = ['BACKLOG','PLAN','DESIGN','DEVELOPMENT','TESTING','RELEASE'] as readonly string[];
                const curIdx = phases.indexOf(editingTask.phase);
                const phIdx = phases.indexOf(ph);
                return (
                  <div key={ph} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ height: 4, borderRadius: 2, background: phIdx === curIdx ? 'var(--blue-500)' : phIdx < curIdx ? 'var(--green-300)' : 'var(--border-light)' }} />
                    <div style={{ fontSize: '0.5rem', color: phIdx === curIdx ? 'var(--blue-600)' : 'var(--text-muted)', marginTop: 2 }}>{labels[ph]}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── COMMON FIELDS ─── */}
        <div className="form-group">
          <label>{taskForm.task_type === 'STORY' ? '需求名称' : '任务名称'}</label>
          <input type="text" placeholder={taskForm.task_type === 'STORY' ? '输入需求名称' : '输入任务名称'}
            value={taskForm.title} onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>描述</label>
          <textarea rows={2} placeholder="补充说明..." style={{ width:'100%',padding:'7px 10px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:'0.82rem',fontFamily:'inherit',background:'var(--bg-surface)',color:'var(--text-primary)',resize:'vertical' }}
            value={taskForm.description} onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="form-row">
          <div className="form-group"><label>优先级</label>
            <select value={taskForm.priority} onChange={(e) => setTaskForm((f) => ({ ...f, priority: e.target.value }))}>
              <option value="CRITICAL">紧急</option><option value="HIGH">高</option><option value="MEDIUM">中</option><option value="LOW">低</option>
            </select>
          </div>
          {isFull && (
            <div className="form-group"><label>所属迭代</label>
              <select style={{ width:'100%' }} value={taskForm.iteration_id||''} onChange={(e) => setTaskForm((f:any) => ({...f, iteration_id: e.target.value||undefined }))}>
                <option value="">不关联迭代</option>
                {allIterations.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* ─── ROLE CARD — unified person assignment per phase/type ─── */}
        {(() => {
          const roles: { key: string; label: string; hint: string; value: string }[] = [];
          if (taskForm.task_type === 'BUG') {
            roles.push({ key: 'proposer_id', label: '发现人', hint: '', value: taskForm.proposer_id||'' });
            roles.push({ key: 'verifier_id', label: '验证人', hint: '', value: taskForm.verifier_id||'' });
          } else if (taskForm.task_type === 'TASK' || taskForm.task_type === 'SUB_TASK') {
            roles.push({ key: 'assignee_id', label: '负责人', hint: '', value: taskForm.assignee_id||'' });
          } else if (editingTask && isFull && editingTask.task_type === 'STORY') {
            if (editingTask.phase === 'BACKLOG') {
              roles.push({ key: 'proposer_id', label: '需求提出人', hint: '谁提的需求', value: taskForm.proposer_id||'' });
              roles.push({ key: 'analyst_id', label: '需求负责人', hint: 'PM指定', value: taskForm.analyst_id||'' });
            } else if (editingTask.phase === 'PLAN') {
              roles.push({ key: 'analyst_id', label: '需求负责人', hint: '编写PRD', value: taskForm.analyst_id||'' });
              roles.push({ key: 'reviewer_id', label: 'PM', hint: '审核PRD', value: taskForm.reviewer_id||'' });
            } else if (editingTask.phase === 'DESIGN') {
              roles.push({ key: 'analyst_id', label: '需求负责人', hint: '编写方案文档', value: taskForm.analyst_id||'' });
              roles.push({ key: 'reviewer_id', label: 'PM(评审人)', hint: '组织评审并决定通过/驳回', value: taskForm.reviewer_id||'' });
            } else if (editingTask.phase === 'DEVELOPMENT') {
              roles.push({ key: 'analyst_id', label: '需求负责人', hint: '拆分任务、推进开发', value: taskForm.analyst_id||'' });
              roles.push({ key: 'reviewer_id', label: 'PM', hint: '', value: taskForm.reviewer_id||'' });
            } else if (editingTask.phase === 'TESTING') {
              roles.push({ key: 'qa_owner_id', label: '测试负责人', hint: '默认=需求提出人，执行测试', value: taskForm.qa_owner_id||'' });
              roles.push({ key: 'reviewer_id', label: 'PM', hint: '', value: taskForm.reviewer_id||'' });
            } else if (editingTask.phase === 'RELEASE') {
              roles.push({ key: 'acceptance_owner_id', label: '验收负责人', hint: '默认=需求提出人', value: taskForm.acceptance_owner_id||'' });
              roles.push({ key: 'reviewer_id', label: 'PM', hint: '', value: taskForm.reviewer_id||'' });
            }
          } else if (taskForm.parent_id && !editingTask) {
            roles.push({ key: 'assignee_id', label: '指派给', hint: '执行该任务的开发者', value: taskForm.assignee_id||'' });
          }
          if (roles.length === 0) return null;
          return (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', fontWeight:600, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>👤 人员</div>
              <div style={{ display:'flex', gap: 10, flexWrap:'wrap' }}>
                {roles.map((r) => (
                  <div key={r.key} style={{ flex: roles.length <= 2 ? 1 : '1 1 calc(50% - 5px)', minWidth: 120 }}>
                    <label style={{ fontSize:'0.7rem', fontWeight:500, display:'block', marginBottom:3 }}>{r.label}{r.hint ? <span style={{ fontSize:'0.58rem',color:'var(--text-muted)',fontWeight:400 }}> · {r.hint}</span> : ''}</label>
                    <select style={{ width:'100%' }} value={r.value} onChange={(e) => setTaskForm((f) => ({...f, [r.key]: e.target.value||undefined }))}>
                      <option value="">{r.key === 'reviewer_id' ? '由负责人审核' : '未指定'}</option>
                      {(r.key === 'reviewer_id' ? allReviewers : allMembers).map((m: any) => <option key={m.user_id||m.id} value={m.user_id||m.id}>{m.user_name||m.user_id}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ─── Document Tabs — STORY only, always visible ─── */}
        {editingTask && isFull && editingTask.task_type === 'STORY' && (() => {
          const phase = editingTask.phase;
          const isBacklog = phase === 'BACKLOG';

          const saveField = async (field: string, value: string) => {
            if (!id) return;
            setSaveState('saving');
            await update(id, editingTask.id, { [field]: value } as any);
            setSaveState('saved');
            setTimeout(() => setSaveState(''), 2000);
          };

          const getEditMode = (relevantPhases: string[]) => {
            if (isBacklog) return 'locked';
            return relevantPhases.includes(phase) ? 'editable' : 'readonly';
          };

          const prdMode = getEditMode(['PLAN', 'DESIGN', 'DEVELOPMENT', 'TESTING']);
          const designMode = getEditMode(['DESIGN', 'DEVELOPMENT', 'TESTING', 'RELEASE']);
          const testMode = getEditMode(['DEVELOPMENT', 'TESTING', 'RELEASE']);
          const ratingMode = getEditMode(['RELEASE']);

          return (
            <div style={{ marginTop: 14, border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              {/* Doc tab bar */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-raised)' }}>
                {[
                  { key: 'prd' as const, label: '📋 需求', count: taskForm.prd_doc?.length || 0 },
                  { key: 'design' as const, label: '📝 设计', count: taskForm.design_doc?.length || 0 },
                  { key: 'test' as const, label: '🧪 测试', count: (taskForm.self_test_report?.length || 0) + (taskForm.test_report?.length || 0) },
                ].map(t => (
                  <button key={t.key} type="button" onClick={() => setDocTab(t.key)}
                    style={{
                      flex: 1, padding: '8px 8px', fontSize: '0.7rem', fontWeight: docTab === t.key ? 600 : 400,
                      border: 'none', borderBottom: docTab === t.key ? '2px solid var(--blue-500)' : '2px solid transparent',
                      background: docTab === t.key ? '#fff' : 'transparent',
                      color: docTab === t.key ? 'var(--blue-600)' : 'var(--text-muted)',
                      cursor: 'pointer', transition: '0.15s',
                    }}
                  >{t.label}{t.count > 0 ? ` (${t.count})` : ''}</button>
                ))}
              </div>

              {/* Doc tab content */}
              <div style={{ padding: '12px 14px', background: '#fff' }}>
                {/* Save indicator */}
                {saveState && (
                  <div style={{ fontSize: '0.6rem', color: saveState === 'saving' ? 'var(--amber-500)' : 'var(--green-500)', marginBottom: 6 }}>
                    {saveState === 'saving' ? '保存中...' : '✓ 已保存'}
                  </div>
                )}

                {/* PRD Tab */}
                {docTab === 'prd' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>需求文档 (PRD)</label>
                      {prdMode === 'readonly' && <span style={{ fontSize:'0.6rem',padding:'1px 6px',borderRadius:8,background:'var(--bg-hover)',color:'var(--text-muted)' }}>只读</span>}
                      {prdMode === 'locked' && <span style={{ fontSize:'0.6rem',padding:'1px 6px',borderRadius:8,background:'#fef3c7',color:'#92400e' }}>规划后才可编辑</span>}
                    </div>
                    <textarea placeholder="编写需求PRD文档..."
                      value={taskForm.prd_doc || ''}
                      onChange={(e) => setTaskForm((f: any) => ({ ...f, prd_doc: e.target.value }))}
                      onBlur={(e) => { if (prdMode === 'editable') saveField('prd_doc', e.target.value); }}
                      readOnly={prdMode !== 'editable'}
                      rows={7}
                      onPaste={(e) => handlePasteImage(e, 'prd_doc')}
                      style={{ width:'100%',padding:'10px 12px',border: '1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:'0.8rem',fontFamily:'inherit',background: prdMode !== 'editable' ? 'var(--bg-hover)' : 'var(--bg-surface)',color:'var(--text-primary)',resize:'vertical',lineHeight:1.6, opacity: prdMode !== 'editable' ? 0.7 : 1 }} />

                    {/* Requirement review — PLAN phase */}
                    {editingTask.requirement_review_status && (
                      <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '2px solid', borderColor:
                        editingTask.requirement_review_status === 'APPROVED' ? 'var(--green-300)' : 'var(--red-300)',
                        background: editingTask.requirement_review_status === 'APPROVED' ? '#f0fdf4' : '#fef2f2',
                      }}>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 4 }}>
                          {editingTask.requirement_review_status === 'APPROVED' ? '✅ 需求已通过' : '❌ 需求已驳回'}
                        </div>
                        {editingTask.requirement_reviewer_name && <div style={{ fontSize:'0.66rem', color:'var(--text-muted)', marginBottom:4 }}>评审人：{editingTask.requirement_reviewer_name}</div>}
                        {editingTask.requirement_review_note && <div style={{ fontSize:'0.66rem', color:'var(--text-muted)' }}>评审意见：{editingTask.requirement_review_note}</div>}
                      </div>
                    )}
                    {!editingTask.requirement_review_status && editingTask.phase === 'PLAN' && (
                      <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '2px solid var(--amber-300)', background: '#fffbeb' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 4 }}>⏳ 等待需求评审</div>
                        <textarea placeholder="评审意见（必填）" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2}
                          style={{ width:'100%',padding:'8px 10px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:'0.78rem',fontFamily:'inherit',resize:'vertical',marginBottom:8 }} />
                        <div style={{ display:'flex', gap: 8 }}>
                          <button type="button" className="btn btn-primary btn-sm" disabled={!reviewNote.trim()} onClick={async () => {
                            if (!id) return;
                            await reviewRequirement(id, editingTask.id, 'APPROVED', reviewNote);
                            setReviewNote('');
                            await useTaskStore.getState().fetchDetail(id, editingTask.id);
                            setEditingTask(useTaskStore.getState().current);
                            fetchActivity(editingTask.id);
                          }} style={{ flex:1 }}>✓ 评审通过</button>
                          <button type="button" className="btn btn-ghost btn-sm" disabled={!reviewNote.trim()} onClick={async () => {
                            if (!id) return;
                            await reviewRequirement(id, editingTask.id, 'REJECTED', reviewNote);
                            setReviewNote('');
                            await useTaskStore.getState().fetchDetail(id, editingTask.id);
                            setEditingTask(useTaskStore.getState().current);
                            fetchActivity(editingTask.id);
                          }} style={{ flex:1, color:'var(--red-500)', borderColor:'var(--red-300)' }}>✗ 驳回</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Design Tab */}
                {docTab === 'design' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>方案设计文档</label>
                      {designMode === 'readonly' && <span style={{ fontSize:'0.6rem',padding:'1px 6px',borderRadius:8,background:'var(--bg-hover)',color:'var(--text-muted)' }}>只读</span>}
                      {designMode === 'locked' && <span style={{ fontSize:'0.6rem',padding:'1px 6px',borderRadius:8,background:'#fef3c7',color:'#92400e' }}>规划后才可编辑</span>}
                    </div>
                    <textarea placeholder="编写技术方案设计...&#10;📌 建议：架构设计 / 接口定义 / 数据模型 / 技术选型 / 风险对策"
                      value={taskForm.design_doc || ''}
                      onChange={async (e) => {
                        const v = e.target.value;
                        setTaskForm((f: any) => ({ ...f, design_doc: v }));
                        if (id && editingTask) {
                          clearTimeout((window as any).__designSaveTimer);
                          (window as any).__designSaveTimer = setTimeout(async () => {
                            await update(id, editingTask.id, { design_doc: v } as any);
                          }, 1500);
                        }
                      }}
                      readOnly={designMode !== 'editable'}
                      rows={9}
                      onPaste={(e) => handlePasteImage(e, 'design_doc')}
                      style={{ width:'100%',padding:'10px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:'0.8rem',fontFamily:'monospace',background: designMode !== 'editable' ? 'var(--bg-hover)' : '#fafbfc',color:'var(--text-primary)',resize:'vertical',lineHeight:1.6, opacity: designMode !== 'editable' ? 0.7 : 1 }} />
                    <div style={{ fontSize:'0.58rem',color:'var(--text-muted)',marginTop:2 }}>✏️ {designMode === 'editable' ? '实时自动保存' : '只读模式'}</div>

                    {/* Design review sub-status */}
                    {editingTask.design_review_status && (
                      <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '2px solid', borderColor:
                        editingTask.design_review_status === 'APPROVED' ? 'var(--green-300)' :
                        editingTask.design_review_status === 'REJECTED' ? 'var(--red-300)' : 'var(--amber-300)',
                        background: editingTask.design_review_status === 'APPROVED' ? '#f0fdf4' :
                        editingTask.design_review_status === 'REJECTED' ? '#fef2f2' : '#fffbeb',
                      }}>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 4 }}>
                          {editingTask.design_review_status === 'APPROVED' ? '✅ 方案已通过' :
                           editingTask.design_review_status === 'REJECTED' ? '❌ 方案已驳回' : '⏳ 等待评审'}
                        </div>
                        {editingTask.design_reviewer_name && <div style={{ fontSize:'0.66rem', color:'var(--text-muted)', marginBottom:6 }}>评审人：{editingTask.design_reviewer_name}</div>}
                        {editingTask.design_review_note && <div style={{ fontSize:'0.66rem', color:'var(--text-muted)', marginBottom:6 }}>评审意见：{editingTask.design_review_note}</div>}
                        {editingTask.design_review_status !== 'APPROVED' && editingTask.design_review_status !== 'REJECTED' && (
                          <>
                            <textarea placeholder="评审意见（必填）" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2}
                              style={{ width:'100%',padding:'8px 10px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:'0.78rem',fontFamily:'inherit',resize:'vertical',marginBottom:8 }} />
                            <div style={{ display:'flex', gap: 8 }}>
                              <button type="button" className="btn btn-primary btn-sm" disabled={!reviewNote.trim()} onClick={async () => {
                                if (!id) return;
                                await reviewDesign(id, editingTask.id, 'APPROVED', reviewNote);
                                setReviewNote('');
                                await useTaskStore.getState().fetchDetail(id, editingTask.id);
                                setEditingTask(useTaskStore.getState().current);
                                fetchActivity(editingTask.id);
                              }} style={{ flex:1 }}>✓ 评审通过</button>
                              <button type="button" className="btn btn-ghost btn-sm" disabled={!reviewNote.trim()} onClick={async () => {
                                if (!id) return;
                                await reviewDesign(id, editingTask.id, 'REJECTED', reviewNote);
                                setReviewNote('');
                                await useTaskStore.getState().fetchDetail(id, editingTask.id);
                                setEditingTask(useTaskStore.getState().current);
                                fetchActivity(editingTask.id);
                              }} style={{ flex:1, color:'var(--red-500)', borderColor:'var(--red-300)' }}>✗ 驳回</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Test Tab */}
                {docTab === 'test' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Story自测报告</label>
                      {testMode === 'readonly' && <span style={{ fontSize:'0.6rem',padding:'1px 6px',borderRadius:8,background:'var(--bg-hover)',color:'var(--text-muted)' }}>只读</span>}
                    </div>
                    <textarea placeholder="记录自测结果、覆盖场景、已知问题..."
                      value={taskForm.self_test_report || ''}
                      onChange={(e) => setTaskForm((f: any) => ({ ...f, self_test_report: e.target.value }))}
                      onBlur={(e) => { if (testMode === 'editable') saveField('self_test_report', e.target.value); }}
                      readOnly={testMode !== 'editable'}
                      rows={4}
                      onPaste={(e) => handlePasteImage(e, 'self_test_report')}
                      style={{ width:'100%',padding:'10px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:'0.8rem',fontFamily:'inherit',background: testMode !== 'editable' ? 'var(--bg-hover)' : 'var(--bg-surface)',color:'var(--text-primary)',resize:'vertical',lineHeight:1.6, opacity: testMode !== 'editable' ? 0.7 : 1 }} />

                    <label style={{ fontSize: '0.78rem', fontWeight: 600, marginTop: 14, marginBottom: 6, display: 'block' }}>测试报告</label>
                    <textarea placeholder="测试用例执行结果、Bug统计、质量评估..."
                      value={taskForm.test_report || ''}
                      onChange={(e) => setTaskForm((f: any) => ({ ...f, test_report: e.target.value }))}
                      onBlur={(e) => { if (testMode === 'editable' || phase === 'RELEASE') saveField('test_report', e.target.value); }}
                      readOnly={testMode !== 'editable' && phase !== 'RELEASE'}
                      rows={5}
                      onPaste={(e) => handlePasteImage(e, 'test_report')}
                      style={{ width:'100%',padding:'10px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:'0.8rem',fontFamily:'inherit',background: (testMode !== 'editable' && phase !== 'RELEASE') ? 'var(--bg-hover)' : 'var(--bg-surface)',color:'var(--text-primary)',resize:'vertical',lineHeight:1.6, opacity: (testMode !== 'editable' && phase !== 'RELEASE') ? 0.7 : 1 }} />

                    {/* Rating — always visible in test tab */}
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, marginTop: 14, marginBottom: 6, display: 'block' }}>⭐ 需求评价</label>
                    <div style={{ display:'flex', gap:4, marginBottom:8 }}>
                      {[1,2,3,4,5].map((star) => (
                        <span key={star} onClick={() => {
                          if (ratingMode === 'editable') {
                            setTaskForm((f: any) => ({ ...f, rating: star }));
                            saveField('rating', String(star));
                          }
                        }}
                          style={{ fontSize:'1.4rem', cursor: ratingMode === 'editable' ? 'pointer' : 'default', opacity: (taskForm.rating || 0) >= star ? 1 : 0.3 }}>
                          ⭐
                        </span>
                      ))}
                    </div>
                    <textarea placeholder="评价说明..."
                      value={taskForm.evaluation || ''}
                      onChange={(e) => setTaskForm((f: any) => ({ ...f, evaluation: e.target.value }))}
                      onBlur={(e) => { if (ratingMode === 'editable') saveField('evaluation', e.target.value); }}
                      readOnly={ratingMode !== 'editable'}
                      rows={3}
                      style={{ width:'100%',padding:'10px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:'0.8rem',fontFamily:'inherit',background: ratingMode !== 'editable' ? 'var(--bg-hover)' : 'var(--bg-surface)',color:'var(--text-primary)',resize:'vertical',lineHeight:1.6, opacity: ratingMode !== 'editable' ? 0.7 : 1 }} />
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* BACKLOG planning hint */}
        {editingTask && isFull && editingTask.task_type === 'STORY' && editingTask.phase === 'BACKLOG' && (
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
            <div style={{ fontSize:'0.82rem', fontWeight:600, marginBottom:8 }}>📥 需求池 — 等待规划</div>
            <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginBottom:10 }}>
              PM需设置<strong>需求负责人</strong>并<strong>规划到迭代</strong>后，推进到需求规划阶段。
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label style={{ fontSize:'0.72rem' }}>规划到迭代</label>
              <select style={{ width:'100%' }} value={taskForm.iteration_id||''} onChange={(e) => {
                const iterId = e.target.value || undefined;
                setTaskForm((f:any) => ({...f, iteration_id: iterId}));
                if (id && iterId) update(id!, editingTask!.id, { iteration_id: iterId } as any);
              }}>
                <option value="">选择迭代...</option>
                {allIterations.filter(it => it.status === 'PLANNING' || it.status === 'ACTIVE').map((it) => (
                  <option key={it.id} value={it.id}>{it.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ═══ Workflow Action Bar — STORY only ═══ */}
        {editingTask && isFull && editingTask.task_type === 'STORY' && (() => {
          const phase = editingTask.phase;
          const advanceLabel = (() => {
            if (phase === 'BACKLOG') return { label: '🚀 推进到需求规划', desc: '设置需求负责人、规划迭代' };
            if (phase === 'PLAN') return { label: '📋 需求规划完成，进入设计', desc: '需求PRD' };
            if (phase === 'DESIGN') return { label: '📝 设计完成，进入开发', desc: '设计文档' };
            if (phase === 'DEVELOPMENT') return { label: '🧪 开发完成，提交测试', desc: 'Story自测报告' };
            if (phase === 'TESTING') return { label: '✅ 测试通过，发布上线', desc: '测试报告' };
            return null;
          })();
          const canReturn = phase === 'DESIGN' || phase === 'TESTING';
          const canAdvance = advanceLabel && editingTask.status === 'DONE';

          if (!canAdvance && !canReturn && phase !== 'DEVELOPMENT') return null;

          return (
            <div style={{
              margin: '12px 0', padding: '12px 14px',
              background: 'var(--blue-50)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--blue-100)',
            }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 500 }}>
                🔄 流程操作
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {canAdvance && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 1, fontSize: '0.78rem', padding: '8px 16px', fontWeight: 600 }}
                    onClick={async () => {
                      await advancePhase(id!, editingTask.id, advanceLabel.desc);
                      await useTaskStore.getState().fetchDetail(id!, editingTask.id);
                      setEditingTask(useTaskStore.getState().current);
                      setTaskPanelOpen(false);
                    }}
                  >
                    {advanceLabel.label}
                  </button>
                )}
                {!canAdvance && advanceLabel && (
                  <div style={{ flex: 1, fontSize: '0.72rem', color: 'var(--text-muted)', padding: '8px 12px', textAlign: 'center' }}>
                    ⚠ 需先完成任务才能推进阶段
                  </div>
                )}
                {canReturn && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--amber-600)', borderColor: 'var(--amber-300)', whiteSpace: 'nowrap' }}
                    onClick={async () => {
                      if (!id) return;
                      await returnPhase(id, editingTask.id);
                      await useTaskStore.getState().fetchDetail(id, editingTask.id);
                      setEditingTask(useTaskStore.getState().current);
                    }}
                  >
                    ↩ 退回
                  </button>
                )}
              </div>
              {phase === 'DEVELOPMENT' && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ marginTop: 8, width: '100%' }}
                  onClick={() => setDetailTab('related')}
                >
                  📋 拆分开发任务 ({editingTask.children_count || 0} 个子任务)
                </button>
              )}
            </div>
          );
        })()}

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setTaskPanelOpen(false)}>取消</button>
          <button
            className="btn btn-primary"
            disabled={taskSubmitting || !taskForm.title.trim()}
            onClick={submitTask}
          >
            {taskSubmitting ? '保存中...' : editingTask ? '保存' : taskForm.task_type === 'STORY' ? '创建需求' : '创建任务'}
          </button>
        </div>

        {/* ─── Phase Timeline — STORY only ─── */}
        {editingTask && isFull && editingTask.task_type === 'STORY' && (() => {
          const phaseLogs = activityLogs.filter((l: any) => l.field_name === '阶段');
          return (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
                📜 流程记录
              </div>
              {phaseLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', padding: '8px 0' }}>
                  暂无流程记录
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {phaseLogs.map((log: any, i: number) => {
                    const isAdvance = log.action === 'UPDATE' || !log.new_value?.includes('退回');
                    return (
                      <div key={i} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        padding: '8px 10px', background: 'var(--bg-raised)',
                        borderRadius: 8,
                        borderLeft: `3px solid ${isAdvance ? 'var(--blue-500)' : 'var(--amber-400)'}`,
                        fontSize: '0.7rem',
                      }}>
                        <div style={{ fontSize: '1rem', flexShrink: 0 }}>{isAdvance ? '🚀' : '↩'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                            {log.old_value || '?'} → {log.new_value || '?'}
                          </div>
                          <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {new Date(log.created_at).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })} · {log.user_name || log.user_id}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Delete section — edit mode only */}
        {editingTask && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            {!showDelete ? (
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--red-500)', borderColor: 'var(--red-200)', width: '100%' }}
                onClick={() => setShowDelete(true)}
              >
                删除任务
              </button>
            ) : (
              <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-100)', borderRadius: 'var(--radius)', padding: '12px 14px', fontSize: '0.78rem', color: 'var(--red-600)' }}>
                <div style={{ marginBottom: 8 }}>确定删除任务「{editingTask.title}」？此操作不可撤销。</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-xs" onClick={() => setShowDelete(false)}>取消</button>
                  <button
                    className="btn btn-xs"
                    style={{ background: 'var(--red-500)', color: '#fff', border: 'none' }}
                    onClick={deleteTask}
                  >
                    {taskSubmitting ? '删除中...' : '确认删除'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Comments section — edit mode only */}
        {editingTask && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 12 }}>评论 ({comments.length})</h4>

            {/* Comment list */}
            <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 12 }}>
              {comments.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.74rem', padding: 12 }}>暂无评论</div>
              ) : (
                comments.map((c: any) => (
                  <div key={c.id} style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--bg-raised)', borderRadius: 'var(--radius-sm)', fontSize: '0.74rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--blue-600)' }}>{c.author_name || '未知'}</span>
                      <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{c.created_at?.slice(0, 16).replace('T', ' ')}</span>
                    </div>
                    <div style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>{c.content}</div>
                    {/* Reply button */}
                    <div style={{ marginTop: 4 }}>
                      <span
                        style={{ fontSize: '0.64rem', color: 'var(--text-muted)', cursor: 'pointer' }}
                        onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                      >
                        {replyTo === c.id ? '取消回复' : '回复'}
                      </span>
                    </div>
                    {/* Reply input */}
                    {replyTo === c.id && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          placeholder="输入回复..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && replyText.trim()) {
                              await api.post(`/tasks/${editingTask.id}/comments`, { content: replyText, parent_comment_id: c.id });
                              setReplyText(''); setReplyTo(null); fetchComments(editingTask.id);
                            }
                          }}
                          style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.74rem', fontFamily: 'inherit' }}
                        />
                        <button className="btn btn-primary btn-xs" onClick={async () => {
                          if (!replyText.trim()) return;
                          await api.post(`/tasks/${editingTask.id}/comments`, { content: replyText, parent_comment_id: c.id });
                          setReplyText(''); setReplyTo(null); fetchComments(editingTask.id);
                        }}>回复</button>
                      </div>
                    )}
                    {/* Replies */}
                    {c.replies && c.replies.length > 0 && (
                      <div style={{ marginTop: 6, marginLeft: 12, paddingLeft: 10, borderLeft: '2px solid var(--border-light)' }}>
                        {c.replies.map((r: any) => (
                          <div key={r.id} style={{ marginBottom: 4, fontSize: '0.72rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--blue-600)' }}>{r.author_name}</span>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 6 }}>{r.created_at?.slice(0, 16).replace('T', ' ')}</span>
                            <div style={{ color: 'var(--text-primary)' }}>{r.content}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* New comment input */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="添加评论..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && commentText.trim()) {
                    setCommentSubmitting(true);
                    await api.post(`/tasks/${editingTask.id}/comments`, { content: commentText });
                    setCommentText(''); setCommentSubmitting(false); fetchComments(editingTask.id);
                  }
                }}
                style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', fontFamily: 'inherit', outline: 'none' }}
              />
              <button className="btn btn-primary btn-sm" disabled={commentSubmitting || !commentText.trim()} onClick={async () => {
                if (!commentText.trim()) return;
                setCommentSubmitting(true);
                await api.post(`/tasks/${editingTask.id}/comments`, { content: commentText });
                setCommentText(''); setCommentSubmitting(false); fetchComments(editingTask.id);
              }}>
                {commentSubmitting ? '...' : '发送'}
              </button>
            </div>
          </div>
        )}

        {/* Activity log — edit mode only */}
        {editingTask && activityLogs.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 10 }}>操作记录</h4>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {activityLogs.map((log: any) => (
                <div key={log.id} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: '0.7rem', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--blue-600)', minWidth: 50 }}>{log.user_name}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{log.action_label}</span>
                  {log.field_name && <span style={{ color: 'var(--text-primary)' }}>{log.field_name}</span>}
                  {log.new_value && <span style={{ color: 'var(--green-600)' }}>→ {log.new_value}</span>}
                  <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', fontSize: '0.64rem', whiteSpace: 'nowrap' }}>{log.created_at?.slice(0, 16).replace('T', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
        )}
      </SlidePanel>

      {/* Milestone Edit Panel */}
      <SlidePanel open={msEditOpen} onClose={() => setMsEditOpen(false)} title={msEditForm.id ? '编辑里程碑' : '编辑里程碑'}>
        <div className="form-group">
          <label>名称</label>
          <input type="text" value={msEditForm.name} onChange={(e) => setMsEditForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>描述</label>
          <input type="text" placeholder="简要描述里程碑目标" value={msEditForm.description} onChange={(e) => setMsEditForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>执行计划</label>
          <textarea rows={4} placeholder="详细的执行计划、步骤、注意事项..." style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', fontFamily: 'inherit', background: 'var(--bg-surface)', color: 'var(--text-primary)', resize: 'vertical' }} value={msEditForm.plan} onChange={(e) => setMsEditForm((f) => ({ ...f, plan: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>负责人</label>
          <select value={msEditForm.owner_id} onChange={(e) => setMsEditForm((f) => ({ ...f, owner_id: e.target.value }))}>
            <option value="">未指定</option>
            {membersRaw.map((m: WorkspaceMember) => (
              <option key={m.id} value={m.user_id || m.id}>{m.user_name || m.user_id}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>开始日期</label>
            <input type="date" value={msEditForm.start_date} onChange={(e) => setMsEditForm((f) => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>结束日期</label>
            <input type="date" value={msEditForm.end_date} onChange={(e) => setMsEditForm((f) => ({ ...f, end_date: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label>状态</label>
          <select value={msEditForm.status} onChange={(e) => setMsEditForm((f) => ({ ...f, status: e.target.value }))}>
            <option value="UPCOMING">即将开始</option>
            <option value="ACTIVE">进行中</option>
            <option value="DONE">已完成</option>
          </select>
        </div>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={() => setMsEditOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={submitMsEdit}>保存</button>
        </div>
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-500)', borderColor: 'var(--red-200)', width: '100%' }} onClick={deleteMs}>删除里程碑</button>
        </div>
      </SlidePanel>
    </div>
  );
}
