import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark-dimmed.css';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useTaskStore } from '../../stores/taskStore';
import { useIterationStore } from '../../stores/iterationStore';
import { useMilestoneStore } from '../../stores/milestoneStore';
import { useReportStore } from '../../stores/reportStore';
import {
  STATUS_LABELS,
  MILESTONE_PHASE_LABELS,
  MILESTONE_PHASE_COLORS,
  PHASE_LABELS,
  PRIORITY_LABELS,
  TASK_TYPE_LABELS,
  REPORT_STATUS_LABELS,
  type ProjectReport,
} from '../../types';
import Modal from '../../components/common/Modal';
import api from '../../api/client';
import GanttChart, { type GanttRow, type GanttTask } from './GanttChart';

/**
 * 投屏核心视图：根据 workspaceId 加载并渲染当前项目的投屏内容。
 * 由 WorkspaceCastPage 与 ProjectGroupCastPage 共用。
 *
 * - 顶栏左侧：由外层通过 `titleSlot` 注入（单项目投屏为项目名，群投屏为可切换的下拉）
 * - 顶栏右侧：由外层通过 `actionsSlot` 注入（时钟 + 退出按钮）
 * - 自动全屏由外层控制（避免在切换项目时重复触发）
 */
export function CastView({
  workspaceId,
  titleSlot,
  actionsSlot,
}: {
  workspaceId: string;
  titleSlot: ReactNode;
  actionsSlot: ReactNode;
}) {
  const { current, fetchDetail, members, fetchMembers } = useWorkspaceStore();
  const { kanban, fetchKanban } = useTaskStore();
  const { iterations, fetchList: fetchIters } = useIterationStore();
  const { milestones, fetchList: fetchMs } = useMilestoneStore();
  const { reports, fetchList: fetchReports } = useReportStore();

  const [detailTask, setDetailTask] = useState<GanttTask | null>(null);
  const [detailComments, setDetailComments] = useState<any[]>([]);
  const [detailActivity, setDetailActivity] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const isFull = current?.type === 'PROJECT';

  const openTaskDetail = async (t: GanttTask) => {
    setDetailTask(t);
    setDetailComments([]);
    setDetailActivity([]);
    setDetailLoading(true);
    try {
      const [c, a] = await Promise.all([
        api.get(`/tasks/${t.id}/comments`).then((r: any) => r.data || []).catch(() => []),
        workspaceId
          ? api.get(`/workspaces/${workspaceId}/tasks/${t.id}/activity`).then((r: any) => r.data || []).catch(() => [])
          : Promise.resolve([]),
      ]);
      setDetailComments(c);
      setDetailActivity(a);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!workspaceId) return;
    fetchDetail(workspaceId);
    fetchMembers(workspaceId);
    fetchKanban(workspaceId);
    fetchReports(`/workspaces/${workspaceId}/reports`, 'WEEKLY');
    if (current?.type === 'PROJECT') fetchIters(workspaceId);
    else if (current?.type === 'TOPIC') fetchMs(workspaceId);
  }, [workspaceId, current?.type]);

  const allTasks = Object.values(kanban).flat() as any[];
  const totalTasks = allTasks.length;
  const doneTasks = (kanban['DONE'] || []).length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const today = new Date();
  const overdue = allTasks.filter((t) => t.due_date && new Date(t.due_date) < today && t.status !== 'DONE').length;

  const trackLabel = isFull ? '迭代' : '里程碑';
  const trackItems: any[] = isFull ? iterations : milestones;

  const milestoneHealthScore = isFull ? 0 : milestones.reduce((score, m) => {
    if (m.phase === 'DONE') return score + 1;
    const od = m.end_date && new Date(m.end_date) < today;
    if (od) return score - 1;
    if (m.phase === 'ACTIVE' || m.phase === 'REVIEW') return score + 0.5;
    return score;
  }, 0);
  const maxScore = milestones.length;
  const normalizedHealth = (!isFull && maxScore > 0) ? Math.round((milestoneHealthScore / maxScore) * 100) : 0;
  const healthLevel = isFull
    ? (pct >= 70 ? '良好' : pct >= 40 ? '正常' : '注意')
    : (normalizedHealth >= 70 ? '良好' : normalizedHealth >= 40 ? '正常' : '注意');

  const humanMembers = members.filter((m) => m.role !== 'AI_AGENT').length;
  const aiMembers = members.filter((m) => m.role === 'AI_AGENT').length;

  const ganttRows: GanttRow[] = (isFull ? iterations : milestones).map((m: any) => {
    if (isFull) {
      const total = m.task_count ?? 0;
      const status = m.status;
      return {
        id: m.id,
        name: m.name,
        owner: m.owner_name || null,
        start: m.start_date,
        end: m.end_date,
        pct: total > 0 ? Math.round(((m.done_count ?? 0) / total) * 100) : (status === 'CLOSED' ? 100 : 0),
        statusLabel: status === 'ACTIVE' ? '执行中' : status === 'CLOSED' ? '已关闭' : '计划中',
        color: status === 'ACTIVE' ? '#f59e0b' : status === 'CLOSED' ? '#64748b' : '#3b82f6',
        active: status === 'ACTIVE',
        phase: status,
        dependsOnId: null,
        taskDone: m.done_count ?? 0,
        taskTotal: total,
      };
    }
    const total = m.task_count ?? 0;
    const phase = m.phase;
    return {
      id: m.id,
      name: m.name,
      owner: m.owner_name || null,
      start: m.start_date,
      end: m.end_date,
      pct: total > 0 ? Math.round(((m.done_count ?? 0) / total) * 100) : (phase === 'DONE' ? 100 : 0),
      statusLabel: MILESTONE_PHASE_LABELS[phase] || phase,
      color: m.color || (MILESTONE_PHASE_COLORS as any)[phase] || '#3b82f6',
      active: phase === 'ACTIVE' || phase === 'REVIEW',
      phase,
      dependsOnId: m.depends_on_id || null,
      taskDone: m.done_count ?? 0,
      taskTotal: total,
    };
  });

  const trackKey: 'milestone_id' | 'iteration_id' = isFull ? 'iteration_id' : 'milestone_id';
  const tasksByTrack = useMemo(() => {
    const map: Record<string, GanttTask[]> = {};
    for (const t of allTasks as any[]) {
      const tid = t[trackKey];
      if (!tid) continue;
      (map[tid] ||= []).push({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assignee_name: t.assignee_name || null,
        task_type: t.task_type,
        phase: t.phase || null,
        due_date: t.due_date || null,
        started_at: t.started_at || null,
        latest_progress: t.latest_progress || null,
        description: t.description || null,
        reviewer_name: t.reviewer_name || null,
        proposer_name: t.proposer_name || null,
        estimation: t.estimation ?? null,
        estimation_unit: t.estimation_unit || null,
      });
    }
    return map;
  }, [allTasks, trackKey]);

  return (
    <div className="bs-page cast-page">
      <div className="bs-topbar">
        <div className="bs-logo">{titleSlot}</div>
        <div className="bs-meta">
          {isFull ? '研发项目' : '专题项目'} · 负责人 {current?.owner_name || '未指定'} · 成员 {humanMembers} 人{aiMembers > 0 ? ` + ${aiMembers} AI` : ''}
        </div>
        <div className="bs-actions">{actionsSlot}</div>
      </div>

      <div className="cast-body">
        <div className="bs-section cast-gantt-section">
          <div className="bs-section-head">
            <span>{trackLabel}进展甘特图</span>
            <span className="bs-section-sub">
              共 {trackItems.length} 个{trackLabel} · 整体进度 {pct}% · 逾期 {overdue} · 健康度 {healthLevel}
            </span>
          </div>
          <GanttChart
            rows={ganttRows}
            trackLabel={trackLabel}
            tasksByTrack={tasksByTrack}
            onTaskClick={openTaskDetail}
          />
        </div>

        <div className="cast-right-col">
          <ComplexTasksCard tasks={allTasks} />
          <WeeklyReportCard report={reports[0] || null} />
        </div>
      </div>

      <Modal open={!!detailTask} onClose={() => setDetailTask(null)} title="任务详情" width={720}>
        {detailTask && (
          <TaskReadonlyDetail
            task={detailTask}
            comments={detailComments}
            activity={detailActivity}
            loading={detailLoading}
          />
        )}
      </Modal>
    </div>
  );
}

/** 投屏：重点任务（含子工作清单的复杂任务）进展 —— 一任务一行，内联展示各子工作项状态 */
function ComplexTasksCard({ tasks }: { tasks: any[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const complex = tasks
    .filter((t) => (t.work_items_total ?? 0) > 0)
    .sort((a, b) => (b.work_items_total ?? 0) - (a.work_items_total ?? 0));

  if (complex.length === 0) return null;

  return (
    <div className="bs-section cast-complex-section">
      <div className="bs-section-head">
        <span>重点任务进展</span>
        <span className="bs-section-sub">{complex.length} 个复杂任务 · 子工作项一目了然</span>
      </div>
      <div className="cast-complex-list">
        {complex.map((t) => {
          const items = [...(t.work_items || [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
          const total = t.work_items_total ?? items.length;
          const done = t.work_items_done ?? items.filter((i: any) => i.completed).length;
          const allDone = total > 0 && done === total;
          return (
            <div key={t.id} className="cast-complex-item">
              <div className="cast-complex-head">
                <span className="cast-complex-name">{t.created_from_template_id ? '📋 ' : ''}{t.title}</span>
                <span className="cast-complex-owner">{t.assignee_name || '未指派'}</span>
                <span className="cast-complex-frac" style={allDone ? { color: '#34d399' } : undefined}>{done}/{total}{allDone ? ' ✓' : ''}</span>
              </div>
              <div className="cast-complex-track">
                {items.map((it: any) => {
                  const overdue = !it.completed && it.due_date && it.due_date < today;
                  const cls = it.completed ? 'done' : overdue ? 'overdue' : it.assignee_id ? 'doing' : '';
                  return (
                    <div key={it.id} className={`cast-wi-seg ${cls}`} title={`${it.title}${it.assignee_name ? ' · ' + it.assignee_name : ''}`}>
                      <div className="cast-wi-bar" />
                      <div className="cast-wi-label">{it.title}{it.assignee_name ? <span className="who"> · {it.assignee_name}</span> : ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeeklyReportCard({ report }: { report: ProjectReport | null }) {
  const fmtDay = (s: string | null) => {
    if (!s) return '';
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const fmtTime = (s: string | null) => {
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const period = report && (report.period_start || report.period_end)
    ? `${fmtDay(report.period_start)} ~ ${fmtDay(report.period_end)}`
    : '';
  const published = report?.status === 'PUBLISHED';

  return (
    <div className="bs-section cast-report-section">
      <div className="bs-section-head">
        <span>项目周报</span>
        <span className="bs-section-sub">{report ? period || '最新一期' : '暂无'}</span>
      </div>
      {!report ? (
        <div className="cast-empty">暂无周报</div>
      ) : (
        <>
          <div className="cast-report-meta">
            <div className="cast-report-title" title={report.title}>{report.title}</div>
            <div className="cast-report-sub">
              {period && <span className="cast-report-period">📅 {period}</span>}
              <span
                className="cast-report-status"
                style={{
                  background: published ? 'rgba(52,211,153,0.15)' : 'rgba(148,163,184,0.15)',
                  color: published ? '#34d399' : '#94a3b8',
                }}
              >
                {REPORT_STATUS_LABELS[report.status] || report.status}
              </span>
              {report.created_by_name && <span className="cast-report-author">{report.created_by_name}</span>}
              {report.published_at
                ? <span className="cast-report-time">发布于 {fmtTime(report.published_at)}</span>
                : <span className="cast-report-time">创建于 {fmtTime(report.created_at)}</span>}
            </div>
          </div>
          <div className="cast-report-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {report.content || '_（周报内容为空）_'}
            </ReactMarkdown>
          </div>
        </>
      )}
    </div>
  );
}

function TaskReadonlyDetail({
  task,
  comments,
  activity,
  loading,
}: {
  task: GanttTask;
  comments: any[];
  activity: any[];
  loading: boolean;
}) {
  const stColor: Record<string, string> = {
    TODO: '#94a3b8', IN_PROGRESS: '#3b82f6', IN_REVIEW: '#8b5cf6', DONE: '#10b981',
  };
  const prColor: Record<string, string> = {
    CRITICAL: '#ef4444', HIGH: '#f59e0b', MEDIUM: '#64748b', LOW: '#94a3b8',
  };
  const sc = stColor[task.status] || '#94a3b8';
  const pc = prColor[task.priority] || '#94a3b8';
  const due = task.due_date ? new Date(task.due_date) : null;
  const overdue = due && due.getTime() < Date.now() && task.status !== 'DONE';
  const fmtTime = (s?: string) => (s ? s.slice(0, 16).replace('T', ' ') : '');

  return (
    <div className="task-ro">
      <div className="task-ro-type-line">
        <span className="task-ro-type">{TASK_TYPE_LABELS[task.task_type] || task.task_type}</span>
        <span className="task-ro-status" style={{ background: `${sc}1f`, color: sc }}>{STATUS_LABELS[task.status] || task.status}</span>
        <span className="task-ro-priority" style={{ color: pc }}>{PRIORITY_LABELS[task.priority] || task.priority}</span>
      </div>
      <h3 className="task-ro-title">{task.title}</h3>

      <div className="task-ro-grid">
        <div className="task-ro-field"><span className="task-ro-label">负责人</span><span className="task-ro-value">{task.assignee_name || '未指派'}</span></div>
        <div className="task-ro-field"><span className="task-ro-label">审核人</span><span className="task-ro-value">{task.reviewer_name || '—'}</span></div>
        <div className="task-ro-field"><span className="task-ro-label">提出人</span><span className="task-ro-value">{task.proposer_name || '—'}</span></div>
        {task.phase && (
          <div className="task-ro-field"><span className="task-ro-label">阶段</span><span className="task-ro-value">{PHASE_LABELS[task.phase] || task.phase}</span></div>
        )}
        {due && (
          <div className="task-ro-field">
            <span className="task-ro-label">截止</span>
            <span className="task-ro-value" style={overdue ? { color: '#ef4444', fontWeight: 600 } : undefined}>
              {due.getMonth() + 1}/{due.getDate()}{overdue ? ' · 逾期' : ''}
            </span>
          </div>
        )}
        {task.estimation != null && (
          <div className="task-ro-field"><span className="task-ro-label">估时</span><span className="task-ro-value">{task.estimation} {task.estimation_unit || ''}</span></div>
        )}
      </div>

      {task.description && (
        <div className="task-ro-desc-block">
          <div className="task-ro-label">描述</div>
          <div className="task-ro-desc">{task.description}</div>
        </div>
      )}

      <div className="task-ro-progress">
        <div className="task-ro-progress-head">进展与动态</div>
        {loading ? (
          <div className="task-ro-empty">加载中…</div>
        ) : (
          <>
            <div className="task-ro-section-title">评论 ({comments.length})</div>
            {comments.length === 0 ? (
              <div className="task-ro-empty">暂无评论</div>
            ) : (
              <div className="task-ro-comments">
                {comments.map((c: any) => (
                  <div key={c.id} className="task-ro-comment">
                    <div className="task-ro-comment-head">
                      <span className="task-ro-comment-author">{c.author_name || '未知'}</span>
                      <span className="task-ro-comment-time">{fmtTime(c.created_at)}</span>
                    </div>
                    <div className="task-ro-comment-body">{c.content}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="task-ro-section-title">操作记录 ({activity.length})</div>
            {activity.length === 0 ? (
              <div className="task-ro-empty">暂无操作记录</div>
            ) : (
              <div className="task-ro-activity">
                {activity.map((log: any) => (
                  <div key={log.id} className="task-ro-activity-row">
                    <span className="task-ro-activity-user">{log.user_name}</span>
                    <span className="task-ro-activity-action">{log.action_label}</span>
                    {log.field_name && <span className="task-ro-activity-field">{log.field_name}</span>}
                    {log.new_value && <span className="task-ro-activity-new">→ {log.new_value}</span>}
                    <span className="task-ro-activity-time">{fmtTime(log.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 自动全屏 hook：进入投屏页后请求进入浏览器全屏；退出时清理监听。 */
export function useAutoFullscreen() {
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => { /* 静默降级 */ });
    }
    const onFsChange = () => { /* 监听但不做额外处理，退出全屏时保持在页面上 */ };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);
}

/** 实时时钟 hook：每秒刷新，返回格式化字符串 */
export function useClockStr(): string {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
