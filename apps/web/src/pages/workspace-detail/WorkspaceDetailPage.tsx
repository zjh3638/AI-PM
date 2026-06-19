import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useTaskStore } from '../../stores/taskStore';
import { useAuthStore } from '../../stores/authStore';
import { PHASE_LABELS, STATUS_LABELS } from '../../types';
import type { WorkspaceMember, Task, Iteration } from '../../types';
import { useIterationStore } from '../../stores/iterationStore';
import { useMilestoneStore } from '../../stores/milestoneStore';
import SlidePanel from '../../components/common/SlidePanel';
import api from '../../api/client';

import MilestoneSidebar from './sidebar/MilestoneSidebar';
import IterationSidebar from './sidebar/IterationSidebar';
import FocusStrip from './components/FocusStrip';
import KpiRow from './components/KpiRow';
import PulseChat from './components/PulseChat';
import TaskProgressSection from './components/TaskProgressSection';
import KanbanView from './panels/KanbanView';
import ListView from './panels/ListView';
import KnowledgePanel from './panels/KnowledgePanel';
import BacklogPanel from './panels/BacklogPanel';
import IdeaPool from './panels/IdeaPool';
import MembersPanel from './panels/MembersPanel';
import EpicsPanel from './panels/EpicsPanel';
import IterationsPanel from './panels/IterationsPanel';
import ReportsPanel from './panels/ReportsPanel';
import RiskPanel from './RiskPanel';
import MilestoneEditSlidePanel, { type MilestoneEditForm } from './panels/MilestoneEditSlidePanel';
import WorkspaceEditSlidePanel, { type WorkspaceEditForm } from './panels/WorkspaceEditSlidePanel';
import { getFileIcon } from './helpers';


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
  const [msEditForm, setMsEditForm] = useState<{ id: string; name: string; description: string; plan: string; owner_id: string; phase: string; start_date: string; end_date: string; depends_on_id: string | null }>({ id: '', name: '', description: '', plan: '', owner_id: '', phase: 'PLANNING', start_date: '', end_date: '', depends_on_id: null });
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
  const [taskForm, setTaskForm] = useState<{ title: string; description: string; task_type: string; priority: string; status: string; phase: string; iteration_id?: string; milestone_id: string; assignee_id?: string; reviewer_id?: string; proposer_id?: string; analyst_id?: string; qa_owner_id?: string; acceptance_owner_id?: string; verifier_id?: string; parent_id?: string; design_doc?: string; prd_doc?: string; self_test_report?: string; test_report?: string; rating?: number; evaluation?: string; due_date?: string }>({ title: '', description: '', task_type: 'TASK', priority: 'MEDIUM', status: 'TODO', phase: 'DEVELOPMENT', milestone_id: '', design_doc: '', due_date: '' });
  const [stories, setStories] = useState<Task[]>([]);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [detailTab, setDetailTab] = useState<'info' | 'progress' | 'related' | 'attachments'>('info');
  const [relatedTasks, setRelatedTasks] = useState<Task[]>([]);
  const [parentStory, setParentStory] = useState<Task | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [docTab, setDocTab] = useState<'prd' | 'design' | 'test'>('prd');
  const [dragOver, setDragOver] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | ''>('');

  // Workspace edit
  const [wsEditOpen, setWsEditOpen] = useState(false);
  const [wsEditForm, setWsEditForm] = useState({ name: '', description: '', visibility: '', owner_id: '' });
  const [wsEditSubmitting, setWsEditSubmitting] = useState(false);
  const [wsShowDelete, setWsShowDelete] = useState(false);

  const openWsEdit = () => {
    if (!current) return;
    setWsEditForm({
      name: current.name,
      description: current.description || '',
      visibility: current.visibility,
      owner_id: current.owner_id || '',
    });
    setWsEditOpen(true);
  };

  const handleWsSave = async () => {
    if (!id || !wsEditForm.name.trim()) return;
    setWsEditSubmitting(true);
    try {
      await useWorkspaceStore.getState().update(id, {
        name: wsEditForm.name.trim(),
        description: wsEditForm.description || null,
        visibility: wsEditForm.visibility,
        owner_id: wsEditForm.owner_id || null,
      } as any);
      await fetchDetail(id);
      setWsEditOpen(false);
    } finally {
      setWsEditSubmitting(false);
    }
  };

  const handleWsDelete = async () => {
    if (!id) return;
    setWsEditSubmitting(true);
    try {
      await useWorkspaceStore.getState().remove(id);
      navigate('/workspaces');
    } finally {
      setWsEditSubmitting(false);
    }
  };

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
      setTaskForm({ title: task.title, description: task.description || '', task_type: task.task_type, priority: task.priority, status: task.status, phase: task.phase || 'PLAN', iteration_id: task.iteration_id || undefined, milestone_id: task.milestone_id || '', assignee_id: task.assignee_id || undefined, reviewer_id: task.reviewer_id || undefined, proposer_id: task.proposer_id || undefined, analyst_id: task.analyst_id || undefined, qa_owner_id: task.qa_owner_id || undefined, acceptance_owner_id: (task as any).acceptance_owner_id || undefined, verifier_id: task.verifier_id || undefined, parent_id: task.parent_id || undefined, design_doc: (task as any).design_doc || '', prd_doc: (task as any).prd_doc || '', self_test_report: (task as any).self_test_report || '', test_report: (task as any).test_report || '', rating: (task as any).rating || undefined, evaluation: (task as any).evaluation || '', due_date: task.due_date || '' });
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
        due_date: '',
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
    setMsEditForm({ id: ms.id, name: ms.name, description: ms.description || '', plan: ms.plan || '', owner_id: ms.owner_id || '', phase: ms.phase || 'PLANNING', start_date: ms.start_date?.slice(0, 10) || '', end_date: ms.end_date?.slice(0, 10) || '', depends_on_id: ms.depends_on_id || null });
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
        { key: 'risks', label: '风险管理' },
        { key: 'reports', label: '报表' },
      ]
    : [
        { key: 'tasks', label: '任务看板' },
        { key: 'kb', label: '知识库' },
        { key: 'members', label: '成员' },
        { key: 'risks', label: '风险管理' },
      ];

  return (
    <div style={{ maxWidth: 'none', padding: '16px 20px 40px' }} data-ws-type={current.type}>
      {/* Pulse Header */}
      <div className="pulse-header">
        <div className="ph-left">
          <div className="back" onClick={() => navigate('/workspaces')}>← 返回工作空间</div>
          <div className="proj-name">{current.name}</div>
          <div className="proj-meta">
            {isFull ? '研发项目' : '专题项目'} · 创建于 {current.created_at?.slice(0, 10)}
            {' · '}
            负责人: {current.owner_name || '未指定'}
            {' · '}
            {current.visibility === 'PRIVATE' ? '私有' : current.visibility === 'DEPARTMENT' ? '部门可见' : '公开'}
            {' '}
            <span className="ospec-badge">{current.template_name || (isFull ? '迭代驱动研发流程' : '里程碑驱动专题管理')}</span>
            {isFull && (
              <span
                className="ospec-badge"
                style={{ cursor: 'pointer', marginLeft: 4, background: current.strict_gate ? 'var(--amber-50)' : 'var(--green-50)', color: current.strict_gate ? 'var(--amber-700)' : 'var(--green-700)', border: current.strict_gate ? '1px solid var(--amber-200)' : '1px solid var(--green-200)' }}
                onClick={async () => {
                  if (!id) return;
                  await useWorkspaceStore.getState().update(id, { strict_gate: !current.strict_gate } as any);
                  fetchDetail(id);
                }}
                title={current.strict_gate ? '点击关闭严格门控' : '点击开启严格门控'}
              >
                ⚙ {current.strict_gate ? '严格门控' : '灵活推进'}
              </span>
            )}
          </div>
        </div>
        <div className="ph-actions">
          <button className="btn btn-ghost btn-sm" onClick={openWsEdit}>编辑信息</button>
          <button className="btn btn-ghost btn-sm">投屏</button>
        </div>
      </div>

      {/* Focus Strip — dynamic workspace signals */}
      <FocusStrip />

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
            {activeTab === 'ideas' && (
              <div className="ws-panel active" id="ws-panel-ideas" style={{ padding: '16px 20px' }}>
                <IdeaPool selectedMilestone={selectedMilestone} />
              </div>
            )}

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
                    : [{ key: 'kanban', label: '看板(状态)' }, { key: 'kanban-ms', label: '看板(里程碑)' }, { key: 'list', label: '列表' }]
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
                {activeView === 'kanban-ms' && <KanbanView onCreateTask={() => {}} onEditTask={(task) => openTaskPanel(undefined, task)} scopeFilter={selectedMilestone} isFull={false} milestoneMode={true} />}
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

            {activeTab === 'risks' && (
              <div className="ws-panel active">
                <RiskPanel />
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
              >🔗 上级任务</button>
            )}
            {editingTask && (
              <button
                onClick={() => setDetailTab('progress')}
                style={{
                  padding: '6px 16px', fontSize: '0.76rem', fontWeight: detailTab === 'progress' ? 600 : 400,
                  border: 'none', background: 'none', borderBottom: detailTab === 'progress' ? '2px solid var(--blue-500)' : '2px solid transparent',
                  color: detailTab === 'progress' ? 'var(--blue-600)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >📈 进展反馈</button>
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

        {/* Progress Tab Content */}
        {editingTask && detailTab === 'progress' && (
          <TaskProgressSection taskId={editingTask.id} workspaceId={id!} />
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
                              setTaskForm({ title: t.title, description: t.description || '', task_type: t.task_type, priority: t.priority, status: t.status, phase: t.phase || 'PLAN', iteration_id: t.iteration_id || undefined, milestone_id: t.milestone_id || '', assignee_id: t.assignee_id || undefined, reviewer_id: t.reviewer_id || undefined, proposer_id: t.proposer_id || undefined, analyst_id: t.analyst_id || undefined, qa_owner_id: t.qa_owner_id || undefined, acceptance_owner_id: (t as any).acceptance_owner_id || undefined, verifier_id: t.verifier_id || undefined, parent_id: t.parent_id || undefined, design_doc: (t as any).design_doc || '', prd_doc: (t as any).prd_doc || '', self_test_report: (t as any).self_test_report || '', test_report: (t as any).test_report || '', rating: (t as any).rating || undefined, evaluation: (t as any).evaluation || '', due_date: t.due_date || '' });
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
                        setTaskForm({ title: t.title, description: t.description || '', task_type: t.task_type, priority: t.priority, status: t.status, phase: t.phase || 'PLAN', iteration_id: t.iteration_id || undefined, milestone_id: t.milestone_id || '', assignee_id: t.assignee_id || undefined, reviewer_id: t.reviewer_id || undefined, proposer_id: t.proposer_id || undefined, analyst_id: t.analyst_id || undefined, qa_owner_id: t.qa_owner_id || undefined, acceptance_owner_id: (t as any).acceptance_owner_id || undefined, verifier_id: t.verifier_id || undefined, parent_id: t.parent_id || undefined, design_doc: (t as any).design_doc || '', prd_doc: (t as any).prd_doc || '', self_test_report: (t as any).self_test_report || '', test_report: (t as any).test_report || '', rating: (t as any).rating || undefined, evaluation: (t as any).evaluation || '', due_date: t.due_date || '' });
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
                      {isFull && <span>阶段: {PHASE_LABELS[parentStory.phase]}</span>}
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

        {/* ─── COMMON FIELDS (5 defaults: title / description / priority / due_date / assignee) ─── */}
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
          <div className="form-group"><label>计划完成</label>
            <input type="date" value={taskForm.due_date || ''} onChange={(e) => setTaskForm((f) => ({ ...f, due_date: e.target.value }))} />
          </div>
          <div className="form-group"><label>负责人</label>
            <select style={{ width:'100%' }} value={taskForm.assignee_id||''} onChange={(e) => setTaskForm((f:any) => ({...f, assignee_id: e.target.value||undefined }))}>
              <option value="">未指定</option>
              {allMembers.map((m: any) => <option key={m.user_id||m.id} value={m.user_id||m.id}>{m.user_name||m.user_id}</option>)}
            </select>
          </div>
        </div>

        {/* ─── Advanced toggle ─── */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--blue-600)', fontSize: '0.78rem', fontWeight: 500,
            padding: '6px 0', marginTop: 4,
          }}
        >
          <span style={{ transition: 'transform 0.15s', transform: showAdvanced ? 'rotate(90deg)' : '', display: 'inline-block' }}>▸</span>
          {showAdvanced ? '收起高级设置' : '更多设置'}
        </button>

        {showAdvanced && (
          <>
            {/* iteration / milestone — auto-set from sidebar but user can override */}
            <div className="form-row">
              {isFull && (
                <div className="form-group"><label>所属迭代</label>
                  <select style={{ width:'100%' }} value={taskForm.iteration_id||''} onChange={(e) => setTaskForm((f:any) => ({...f, iteration_id: e.target.value||undefined }))}>
                    <option value="">不关联迭代</option>
                    {allIterations.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                </div>
              )}
              {!isFull && (
                <div className="form-group"><label>关联里程碑</label>
                  <select style={{ width:'100%' }} value={taskForm.milestone_id||''} onChange={(e) => setTaskForm((f:any) => ({...f, milestone_id: e.target.value||undefined }))}>
                    <option value="">不关联</option>
                    {allMilestones.map((ms) => <option key={ms.id} value={ms.id}>{ms.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* ─── ROLE CARD — phase/type-specific person assignment ─── */}
            {(() => {
              const roles: { key: string; label: string; hint: string; value: string }[] = [];
              if (taskForm.task_type === 'BUG') {
                roles.push({ key: 'proposer_id', label: '发现人', hint: '', value: taskForm.proposer_id||'' });
                roles.push({ key: 'verifier_id', label: '验证人', hint: '', value: taskForm.verifier_id||'' });
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
              }
              if (roles.length === 0) return null;
              return (
                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', fontWeight:600, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>👤 阶段角色</div>
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
          </>
        )}

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
                style={{ color: 'var(--red-500)' }}
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

      <MilestoneEditSlidePanel
        open={msEditOpen}
        form={msEditForm}
        members={membersRaw}
        milestones={milestones}
        onClose={() => setMsEditOpen(false)}
        onFormChange={(updater) => setMsEditForm(updater)}
        onSubmit={submitMsEdit}
        onDelete={deleteMs}
      />


      <WorkspaceEditSlidePanel
        open={wsEditOpen}
        form={wsEditForm}
        workspaceName={current?.name || ''}
        members={allMembers}
        submitting={wsEditSubmitting}
        showDelete={wsShowDelete}
        onClose={() => setWsEditOpen(false)}
        onFormChange={(updater) => setWsEditForm(updater)}
        onSubmit={handleWsSave}
        onShowDelete={() => setWsShowDelete(!wsShowDelete)}
        onDelete={handleWsDelete}
      />
    </div>
  );
}
