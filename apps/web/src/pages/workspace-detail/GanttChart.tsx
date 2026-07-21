import { useEffect, useMemo, useRef, useState } from 'react';
import { STATUS_LABELS, PRIORITY_LABELS, TASK_TYPE_LABELS } from '../../types';

/**
 * 投屏页甘特图：专业项目管理视角（类 MS Project / Jira）。
 * 左侧固定信息列（名称 / 负责人 / 任务完成数 / 状态），右侧时间轴 + 网格 + 今日竖线
 * + 里程碑/迭代进度条 + 依赖箭头（仅里程碑）+ 逾期高亮。
 * 点击行可展开该里程碑/迭代下的任务详情。
 */

export interface GanttRow {
  id: string;
  name: string;
  owner: string | null;
  start: string | null;
  end: string | null;
  /** 0-100 */
  pct: number;
  /** 阶段/状态标签（已本地化） */
  statusLabel: string;
  /** 主色 */
  color: string;
  /** 是否进行中（影响高亮） */
  active: boolean;
  /** 阶段 key（PLANNING/ACTIVE/REVIEW/DONE 或迭代 status） */
  phase: string;
  /** 依赖的前置里程碑 id（迭代恒为 null） */
  dependsOnId: string | null;
  /** 完成任务数 */
  taskDone: number;
  /** 总任务数 */
  taskTotal: number;
}

export interface GanttTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee_name: string | null;
  task_type: string;
  phase: string | null;
  due_date: string | null;
  started_at: string | null;
  latest_progress: { progress: number; note: string | null; created_at: string } | null;
  description: string | null;
  reviewer_name: string | null;
  proposer_name: string | null;
  estimation: number | null;
  estimation_unit: string | null;
}

interface Props {
  rows: GanttRow[];
  trackLabel: string; // "迭代" | "里程碑"
  /** key=里程碑/迭代 id, value=其下任务列表 */
  tasksByTrack: Record<string, GanttTask[]>;
  /** 点击任务（打开只读详情） */
  onTaskClick?: (task: GanttTask) => void;
}

const STATUS_COLORS: Record<string, string> = {
  TODO: '#94a3b8',
  IN_PROGRESS: '#3b82f6',
  IN_REVIEW: '#8b5cf6',
  DONE: '#10b981',
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f59e0b',
  MEDIUM: '#64748b',
  LOW: '#94a3b8',
};

const DAY_MS = 86400000;

function toMs(d: string | null): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
}

function fmtDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtRange(start: string | null, end: string | null): string {
  const s = toMs(start);
  const e = toMs(end);
  if (s == null && e == null) return '';
  if (s == null) return `截止 ${fmtDay(e!)}`;
  if (e == null) return `起 ${fmtDay(s)}`;
  return `${fmtDay(s)} → ${fmtDay(e)}`;
}

/** 进展反馈时间：显示 月/日 时:分 */
function fmtTimeShort(s: string): string {
  const t = toMs(s);
  if (t == null) return '';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 行高常量（与 CSS 一致，供依赖箭头计算 y 坐标）
const ROW_HEIGHT = 52;

/** 为一行生成「进展 + 风险」摘要文字，显示在时间条上方 */
function buildRowSummary(
  r: GanttRow,
  tasks: GanttTask[],
  now: number,
): { text: string; risk: boolean } | null {
  const parts: string[] = [];
  let risk = false;

  // 进展
  if (r.taskTotal > 0) {
    parts.push(`${r.taskDone}/${r.taskTotal} 完成 · ${r.pct}%`);
  } else {
    parts.push(r.pct >= 100 ? '已就绪' : '无任务');
  }

  // 风险：逾期任务数
  const overdueTasks = tasks.filter(
    (t) => t.due_date && new Date(t.due_date).getTime() < now && t.status !== 'DONE',
  ).length;
  if (overdueTasks > 0) {
    parts.push(`${overdueTasks} 项逾期`);
    risk = true;
  }

  // 风险：里程碑本身逾期未完成
  const msOverdue = r.phase !== 'DONE' && r.phase !== 'CLOSED'
    && r.end != null && new Date(r.end).getTime() < now;
  if (msOverdue) {
    parts.push('里程碑逾期');
    risk = true;
  }

  // 风险：进行中但即将到期（3 天内）
  if (!msOverdue && r.phase !== 'DONE' && r.phase !== 'CLOSED' && r.end != null) {
    const daysLeft = Math.ceil((new Date(r.end).getTime() - now) / DAY_MS);
    if (daysLeft >= 0 && daysLeft <= 3 && r.pct < 100) {
      parts.push(`剩余 ${daysLeft} 天`);
      risk = true;
    }
  }

  return { text: parts.join(' · '), risk };
}

export default function GanttChart({ rows, trackLabel, tasksByTrack, onTaskClick }: Props) {
  const today = Date.now();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const rowEls = useRef<(HTMLDivElement | null)[]>([]);
  const [trackWidth, setTrackWidth] = useState(0);
  const [rowTops, setRowTops] = useState<number[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 监听时间区容器宽度变化，用于把百分比坐标换算成 px 画依赖箭头
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => setTrackWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows.length]);

  // 测量每行相对 gantt-rows 的实际顶部位置（展开行会撑高，需动态读取以保证箭头不错位）
  useEffect(() => {
    const container = rowsRef.current;
    if (!container) return;
    const measure = () => {
      const tops = rowEls.current.map((el) => {
        if (!el) return 0;
        return el.offsetTop - container.offsetTop;
      });
      setRowTops(tops);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    // 展开切换后也要重测
    const t = setTimeout(measure, 0);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [rows.length, expandedId, trackWidth]);

  const { rangeStart, rangeEnd, ticks, totalDays } = useMemo(() => {
    if (rows.length === 0) {
      return { rangeStart: today - 7 * DAY_MS, rangeEnd: today + 14 * DAY_MS, ticks: [] as number[], totalDays: 21 };
    }
    let min = today;
    let max = today;
    for (const r of rows) {
      const s = toMs(r.start);
      const e = toMs(r.end);
      if (s != null) min = Math.min(min, s);
      if (e != null) max = Math.max(max, e);
    }
    min = min - 2 * DAY_MS;
    max = max + 2 * DAY_MS;
    if (max <= min) max = min + 14 * DAY_MS;

    const span = max - min;
    const days = Math.max(1, Math.ceil(span / DAY_MS));

    const tickMs: number[] = [];
    if (days <= 21) {
      for (let i = 0; i <= days; i++) tickMs.push(min + i * DAY_MS);
    } else if (days <= 90) {
      const start = new Date(min);
      start.setHours(0, 0, 0, 0);
      const dow = start.getDay() || 7;
      start.setDate(start.getDate() - (dow - 1));
      let cur = start.getTime();
      while (cur <= max) {
        if (cur >= min) tickMs.push(cur);
        cur += 7 * DAY_MS;
      }
      if (tickMs[tickMs.length - 1] < max) tickMs.push(max);
    } else {
      const start = new Date(min);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const cur = new Date(start);
      while (cur.getTime() <= max) {
        if (cur.getTime() >= min) tickMs.push(cur.getTime());
        cur.setMonth(cur.getMonth() + 1);
      }
      if (tickMs[tickMs.length - 1] < max) tickMs.push(max);
    }

    return { rangeStart: min, rangeEnd: max, ticks: tickMs, totalDays: days };
  }, [rows, today]);

  const pctOf = (ms: number) => ((ms - rangeStart) / (rangeEnd - rangeStart)) * 100;
  const todayPct = pctOf(today);

  const tickStep = totalDays <= 21 ? 'day' : totalDays <= 90 ? 'week' : 'month';
  const fmtTick = (ms: number) => {
    const d = new Date(ms);
    if (tickStep === 'month') return `${d.getMonth() + 1}月`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  if (rows.length === 0) {
    return <div className="cast-empty">暂无{trackLabel}数据</div>;
  }

  // 计算每行的条左右端百分比，供依赖箭头定位
  const barPos = rows.map((r) => {
    const s = toMs(r.start) ?? today;
    const e = toMs(r.end) ?? today + 7 * DAY_MS;
    return { left: Math.max(0, pctOf(s)), right: Math.min(100, pctOf(e)) };
  });

  // 依赖箭头：从前置条右端 → 当前行左端
  const hasDeps = rows.some((r) => r.dependsOnId);
  const depPaths: { d: string; key: string }[] = [];
  if (hasDeps && trackWidth > 0 && rowTops.length === rows.length) {
    const xAt = (pct: number) => (pct / 100) * trackWidth;
    rows.forEach((r, i) => {
      if (!r.dependsOnId) return;
      const fromIdx = rows.findIndex((x) => x.id === r.dependsOnId);
      if (fromIdx < 0) return;
      const from = barPos[fromIdx];
      const to = barPos[i];
      const x1 = xAt(from.right);
      const y1 = rowTops[fromIdx] + ROW_HEIGHT / 2;
      const x2 = xAt(to.left);
      const y2 = rowTops[i] + ROW_HEIGHT / 2;
      // 折线：右端出 → 向右 8px → 垂直到目标行 → 左端入
      const dx = Math.min(8, Math.max(4, (x2 - x1) / 4));
      const midX = x1 + dx;
      const d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
      depPaths.push({ d, key: `${r.id}->${r.dependsOnId}` });
    });
  }

  return (
    <div className="gantt-wrap">
      <div className="gantt-scroll">
        <div className="gantt-inner">
          {/* 表头：左信息列 + 时间轴 */}
          <div className="gantt-header">
            <div className="gantt-info-col gantt-header-info">
              <span className="gantt-header-title">{trackLabel}</span>
              <span className="gantt-header-sub">进度</span>
            </div>
            <div className="gantt-axis" ref={trackRef}>
              {/* 垂直网格线（贯穿表头与行，由 background 实现） */}
              {ticks.map((t, i) => (
                <div
                  key={i}
                  className="gantt-tick"
                  style={{ left: `${pctOf(t)}%` }}
                >
                  <span className="gantt-tick-label">{fmtTick(t)}</span>
                </div>
              ))}
              {todayPct >= 0 && todayPct <= 100 && (
                <div className="gantt-today-label" style={{ left: `${todayPct}%` }}>今天</div>
              )}
            </div>
          </div>

          {/* 行 + 依赖箭头层 */}
          <div className="gantt-rows" ref={rowsRef}>
            {/* 网格线背景层（与刻度对齐） */}
            <div className="gantt-grid">
              {ticks.map((t, i) => (
                <div key={i} className="gantt-grid-line" style={{ left: `${pctOf(t)}%` }} />
              ))}
              {todayPct >= 0 && todayPct <= 100 && (
                <div className="gantt-today-line" style={{ left: `${todayPct}%` }} />
              )}
            </div>

            {rows.map((r, i) => {
              const s = toMs(r.start) ?? today;
              const e = toMs(r.end) ?? today + 7 * DAY_MS;
              const left = Math.max(0, pctOf(s));
              const width = Math.max(2.5, pctOf(e) - pctOf(s));
              const color = r.color || '#3b82f6';
              const dateStr = fmtRange(r.start, r.end);
              const showInBar = width > 10;
              const isDone = r.phase === 'DONE' || r.phase === 'CLOSED';
              const overdue = !isDone && toMs(r.end) != null && (toMs(r.end) as number) < today;
              const expanded = expandedId === r.id;
              const tasks = tasksByTrack[r.id] || [];
              return (
                <div key={r.id} className="gantt-row-block">
                  <div
                    ref={(el) => { rowEls.current[i] = el; }}
                    className={`gantt-row${i % 2 === 1 ? ' alt' : ''}${r.active ? ' active' : ''}${overdue ? ' overdue' : ''}${expanded ? ' expanded' : ''}`}
                    onClick={() => setExpandedId(expanded ? null : r.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setExpandedId(expanded ? null : r.id); } }}
                  >
                    <div className="gantt-info-col gantt-row-info">
                      <div className="gantt-row-name-line">
                        <span className={`gantt-row-caret${expanded ? ' open' : ''}`}>▸</span>
                        <span className="gantt-row-name" title={r.name}>{r.name}</span>
                        <span className="gantt-status-pill" style={{ background: `${color}1f`, color }}>{r.statusLabel}</span>
                      </div>
                      <div className="gantt-row-sub">
                        <span className="gantt-owner" title={r.owner || ''}>{r.owner || '未指派'}</span>
                        <span className="gantt-date">{dateStr}</span>
                        <span className="gantt-task-count">
                          {r.taskDone}/{r.taskTotal} 任务
                        </span>
                        {overdue && <span className="gantt-overdue-tag">逾期</span>}
                      </div>
                    </div>
                    <div className="gantt-track">
                      {/* 条上方：进展/风险摘要 */}
                      {(() => {
                        const summary = buildRowSummary(r, tasks, today);
                        if (!summary) return null;
                        return (
                          <div
                            className={`gantt-row-summary${summary.risk ? ' risk' : ''}`}
                            style={{ left: `${left}%`, maxWidth: `${Math.max(width, 30)}%` }}
                            title={summary.text}
                          >
                            {summary.text}
                          </div>
                        );
                      })()}
                      <div
                        className={`gantt-bar${overdue ? ' overdue' : ''}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <div className="gantt-bar-track" />
                        <div className="gantt-bar-fill" style={{ width: `${r.pct}%`, background: color }} />
                        {showInBar && (
                          <span className={`gantt-bar-label${r.pct >= 50 ? ' on-fill' : ''}`}>
                            {r.pct}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div className="gantt-tasks-panel">
                      <div className="gantt-tasks-head">
                        <span>{r.name} · 任务明细</span>
                        <span className="gantt-tasks-count">{tasks.length} 项</span>
                      </div>
                      {tasks.length === 0 ? (
                        <div className="gantt-tasks-empty">该{trackLabel}下暂无任务</div>
                      ) : (
                        <div className="gantt-tasks-list">
                          {tasks.map((t) => {
                            const stColor = STATUS_COLORS[t.status] || '#94a3b8';
                            const prColor = PRIORITY_COLORS[t.priority] || '#94a3b8';
                            const dateStr = fmtRange(t.started_at, t.due_date);
                            const lp = t.latest_progress;
                            // 进度：优先取进展反馈，否则按状态推断兜底
                            const pct = lp?.progress
                              ?? (t.status === 'DONE' ? 100
                                : t.status === 'IN_REVIEW' ? 75
                                  : t.status === 'IN_PROGRESS' ? 50
                                    : t.status === 'TODO' ? 0 : null);
                            const noteTime = lp?.created_at ? fmtTimeShort(lp.created_at) : '';
                            return (
                              <div
                                key={t.id}
                                className="gantt-task-item"
                                onClick={() => onTaskClick?.(t)}
                                role={onTaskClick ? 'button' : undefined}
                                tabIndex={onTaskClick ? 0 : undefined}
                              >
                                <div className="gantt-task-main">
                                  <span className="gantt-task-type" title={TASK_TYPE_LABELS[t.task_type] || t.task_type}>
                                    {TASK_TYPE_LABELS[t.task_type] || t.task_type}
                                  </span>
                                  <span className="gantt-task-title" title={t.title}>{t.title}</span>
                                  <span className="gantt-task-status" style={{ background: `${stColor}1f`, color: stColor }}>
                                    {STATUS_LABELS[t.status] || t.status}
                                  </span>
                                  <span className="gantt-task-priority" style={{ color: prColor }}>
                                    {PRIORITY_LABELS[t.priority] || t.priority}
                                  </span>
                                  <span className="gantt-task-assignee">{t.assignee_name || '未指派'}</span>
                                </div>
                                <div className="gantt-task-meta">
                                  {dateStr && (
                                    <span className="gantt-task-date" title="计划起止">⏱ {dateStr}</span>
                                  )}
                                  <span className="gantt-task-progress" title="当前进度">
                                    <span className="gantt-task-progress-bar">
                                      <span className="gantt-task-progress-fill" style={{ width: `${pct ?? 0}%`, background: stColor }} />
                                    </span>
                                    <span className="gantt-task-progress-pct">{pct != null ? `${pct}%` : '—'}</span>
                                  </span>
                                  {lp?.note && (
                                    <span className="gantt-task-note" title={lp.note}>
                                      <span className="gantt-task-note-tag">进展</span>
                                      <span className="gantt-task-note-text">{lp.note}</span>
                                      {noteTime && <span className="gantt-task-note-time">{noteTime}</span>}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* 依赖箭头层（覆盖在条之上，不拦截事件） */}
            {hasDeps && trackWidth > 0 && rowTops.length === rows.length && (
              <svg
                className="gantt-deps"
                width={trackWidth}
                height="100%"
                style={{ top: 0 }}
                aria-hidden
              >
                <defs>
                  <marker id="gantt-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" className="gantt-dep-arrowhead" />
                  </marker>
                </defs>
                {depPaths.map((p) => (
                  <path key={p.key} d={p.d} className="gantt-dep-line" markerEnd="url(#gantt-arrow)" fill="none" />
                ))}
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* 图例 */}
      <div className="gantt-legend">
        <span className="gantt-legend-item"><span className="gantt-legend-dot" style={{ background: '#f59e0b' }} />执行中</span>
        <span className="gantt-legend-item"><span className="gantt-legend-dot" style={{ background: '#3b82f6' }} />计划中</span>
        <span className="gantt-legend-item"><span className="gantt-legend-dot" style={{ background: '#8b5cf6' }} />审核中</span>
        <span className="gantt-legend-item"><span className="gantt-legend-dot" style={{ background: '#10b981' }} />已完成</span>
        <span className="gantt-legend-item"><span className="gantt-today-tick" />今天</span>
        <span className="gantt-legend-item"><span className="gantt-overdue-tick" />逾期</span>
        <span className="gantt-legend-item"><span className="gantt-dep-tick" />依赖</span>
      </div>
    </div>
  );
}
