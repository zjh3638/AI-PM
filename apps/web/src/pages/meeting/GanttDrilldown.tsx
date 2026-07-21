import { TimelineProject } from '../../api/meeting';
import { pct, Win } from './timelineUtils';

/** Gantt drilldown for the selected project: milestone rows + their tasks. */
export default function GanttDrilldown({ project, win }: { project: TimelineProject; win: Win }) {
  // group tasks by milestone
  const byMs = new Map<string | null, typeof project.tasks>();
  for (const t of project.tasks) {
    const k = t.milestone_id ?? null;
    if (!byMs.has(k)) byMs.set(k, []);
    byMs.get(k)!.push(t);
  }

  const barClass = (status: string, critical: boolean) => {
    let c = 'bs-gbar';
    if (status === 'DONE') c += ' done';
    else if (critical) c += ' late';
    if (critical) c += ' critical';
    return c;
  };

  const taskSpan = (t: { start_date: string | null; due_date: string | null }, msEnd: string | null, msStart: string | null) => {
    const s = t.start_date || msStart;
    const e = t.due_date || msEnd;
    const left = pct(s, win);
    const right = pct(e, win);
    return { left, width: Math.max(3, right - left) };
  };

  return (
    <div className="bs-gantt">
      {project.milestones.map((m) => {
        const tasks = byMs.get(m.id) || [];
        const left = pct(m.start_date, win);
        const right = pct(m.end_date, win);
        const dotStyle = m.status === 'upcoming' ? { background: '#475569' } : undefined;
        return (
          <div key={m.id}>
            <div className="bs-gantt-row">
              <div className="g-label" style={{ fontWeight: 700 }}>
                <span className={`bs-status ${m.status === 'upcoming' ? '' : m.status}`} style={dotStyle} />
                {m.name}
              </div>
              <div className="g-track">
                <div
                  className={`bs-gbar ${m.status === 'done' ? 'done' : m.status === 'late' ? 'late' : ''}`}
                  style={{ left: `${left}%`, width: `${Math.max(3, right - left)}%` }}
                >
                  <div className="fill" style={{ width: `${m.pct}%` }} />
                  <span className="who">{m.done_tasks}/{m.total_tasks}</span>
                </div>
              </div>
            </div>
            {tasks.map((t) => {
              const sp = taskSpan(t, m.end_date, m.start_date);
              return (
                <div className="bs-gantt-row" key={t.id}>
                  <div className="g-label" style={{ paddingLeft: 28 }}>{t.title}</div>
                  <div className="g-track">
                    <div className={barClass(t.status, t.critical)} style={{ left: `${sp.left}%`, width: `${sp.width}%` }}>
                      <div className="fill" style={{ width: `${t.pct}%` }} />
                      <span className="who">{t.assignee_name || '-'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {project.milestones.length === 0 && (
        <div className="empty-row" style={{ padding: 24 }}>该项目暂无里程碑</div>
      )}
    </div>
  );
}
