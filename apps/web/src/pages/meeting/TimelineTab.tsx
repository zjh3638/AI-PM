import { useMemo, useState } from 'react';
import { TimelineData, TimelineProject } from '../../api/meeting';
import {
  Gran, Win, buildWindow, buildAxis, pct, frac, nodeDate,
  STATUS_CLASS, STATUS_LABEL, fmtDate,
} from './timelineUtils';
import GanttDrilldown from './GanttDrilldown';
import KeyPersonLane from './KeyPersonLane';
import RiskListPanel from './RiskListPanel';

const HEALTH_DOT: Record<string, string> = { 'on-track': 'on-track', 'at-risk': 'at-risk', blocked: 'blocked' };

export default function TimelineTab({ data, onOpenProject }: { data: TimelineData; onOpenProject?: (wsId: string) => void }) {
  const [gran, setGran] = useState<Gran>('week');
  const [activeWs, setActiveWs] = useState<string>(data.projects[0]?.workspace_id || '');

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const win = useMemo(() => buildWindow(data.window_start, data.window_end, gran, today), [data, gran, today]);
  const axis = useMemo(() => buildAxis(win, gran, today), [win, gran, today]);

  const activeProject = data.projects.find(p => p.workspace_id === activeWs) || data.projects[0];
  const todayFrac = frac(today, win);

  return (
    <div className="tl-wrap">
      {/* granularity switch */}
      <div className="tl-toolbar">
        <span className="bs-gran-switch">
          {(['week', 'month', 'quarter'] as Gran[]).map(g => (
            <button key={g} className={`bs-gran-btn${gran === g ? ' active' : ''}`} onClick={() => setGran(g)}>
              {g === 'week' ? '周' : g === 'month' ? '月' : '季'}
            </button>
          ))}
        </span>
        <span className="tl-hint">共 {data.projects.length} 个项目 · 点击项目行下钻甘特图</span>
      </div>

      {/* milestone swimlanes */}
      <div className="bs-timeline">
        <div className="bs-tl-head">
          <div className="bs-tl-labelcol">项目 / 里程碑</div>
          <div className="bs-tl-track" style={{ position: 'relative' }}>
            {axis.map((t, i) => (
              <div key={i} className={`bs-tl-week${t.current ? ' is-current' : ''}`}
                style={{ position: 'absolute', left: `${t.pos}%`, transform: 'translateX(-1px)', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 6, flex: 'none', minWidth: 0 }}>
                {t.top}<br />{t.bot}
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <div className="bs-today" style={{ left: `calc(190px + (100% - 190px) * ${todayFrac.toFixed(4)})` }} />
          {data.projects.map(p => (
            <Lane key={p.workspace_id} project={p} win={win} active={p.workspace_id === activeProject?.workspace_id}
              onSelect={() => setActiveWs(p.workspace_id)} />
          ))}
        </div>

        <div className="bs-tl-legend">
          <span><i style={{ background: '#34d399' }} />已达成</span>
          <span><i style={{ background: '#60a5fa' }} />进行中</span>
          <span><i style={{ background: '#fbbf24' }} />逼近有风险</span>
          <span><i style={{ background: '#ef4444' }} />已延期/阻塞</span>
          <span><i style={{ background: '#475569' }} />未开始</span>
          <span style={{ opacity: 0.9 }}>
            <i style={{ width: 16, height: 6, borderRadius: 3, background: 'repeating-linear-gradient(45deg,rgba(239,68,68,0.5),rgba(239,68,68,0.5) 3px,transparent 3px,transparent 6px)' }} />
            计划vs实际滑期
          </span>
        </div>
      </div>

      {/* gantt drilldown */}
      {activeProject && (
        <div className="bs-section" style={{ marginTop: 16 }}>
          <div className="bs-section-head">
            <span>📊 任务甘特 · {activeProject.name}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '0.68rem', opacity: 0.4 }}>加粗为里程碑 · 黄框为关键路径</span>
              {onOpenProject && (
                <button className="tl-open-board" onClick={() => onOpenProject(activeProject.workspace_id)}>
                  查看项目看板 →
                </button>
              )}
            </span>
          </div>
          <GanttDrilldown project={activeProject} win={win} />
        </div>
      )}

      {/* key persons + risks */}
      <div className="tl-bottom-grid">
        <div className="bs-section">
          <div className="bs-section-head"><span>👥 关键人推进</span><span style={{ fontSize: '0.68rem', opacity: 0.4 }}>进度 · 负载 · 状态</span></div>
          <KeyPersonLane persons={data.key_persons} />
        </div>
        <div className="bs-section">
          <div className="bs-section-head"><span>⚠ 项目风险</span><span style={{ fontSize: '0.68rem', opacity: 0.4 }}>按严重度排序</span></div>
          <RiskListPanel risks={data.risks} />
        </div>
      </div>
    </div>
  );
}

function Lane({ project, win, active, onSelect }: { project: TimelineProject; win: Win; active: boolean; onSelect: () => void }) {
  const msById = new Map(project.milestones.map(m => [m.id, m]));
  return (
    <div className={`bs-tl-lane${active ? ' active' : ''}`} onClick={onSelect}>
      <div className="bs-tl-labelcol lane">
        <div className="pn"><span className={`bs-status ${HEALTH_DOT[project.health]}`} />{project.name}</div>
        <div className="pm">负责人 {project.owner_name || '-'} · {Math.round(project.pct)}%</div>
      </div>
      <div className="bs-tl-lanetrack">
        {/* dependency connectors */}
        {project.milestones.map(m => {
          if (!m.depends_on_id) return null;
          const prev = msById.get(m.depends_on_id);
          if (!prev) return null;
          const from = pct(nodeDate(prev), win);
          const to = pct(nodeDate(m), win);
          return <div key={`dep-${m.id}`} className={`bs-tl-dep${m.status === 'late' ? ' late' : ''}`}
            style={{ left: `${from}%`, width: `${Math.max(0, to - from)}%` }} />;
        })}
        {/* slip shadows */}
        {project.milestones.map(m => {
          if (m.slip_days <= 0 || !m.end_date) return null;
          const from = pct(m.end_date, win);
          const to = pct(nodeDate(m), win);
          return <div key={`slip-${m.id}`} className="bs-slip" style={{ left: `${from}%`, width: `${Math.max(0, to - from)}%` }} />;
        })}
        {/* milestone nodes */}
        {project.milestones.map((m, i) => {
          const left = pct(nodeDate(m), win);
          const cls = STATUS_CLASS[m.status];
          const dotStyle = m.status === 'upcoming' ? { background: '#475569' } : undefined;
          // alternate label vertical position to avoid overlap of long names
          const lblClass = i % 2 === 0 ? 'lbl' : 'lbl lbl-alt';
          return (
            <div key={m.id} className={`bs-ms ${cls}`} style={{ left: `${left}%` }}>
              <span className="dot" style={dotStyle} />
              <span className={lblClass} title={m.name}>{m.name}</span>
              <div className="bs-ms-tip">
                <div className="tt">{m.name}</div>
                <div className="tr"><b>状态</b><span>{STATUS_LABEL[m.status]}</span></div>
                <div className="tr"><b>计划</b><span>{fmtDate(m.end_date)}</span></div>
                {m.actual_date && <div className="tr"><b>实际</b><span>{fmtDate(m.actual_date)}</span></div>}
                {m.slip_days > 0 && <div className="tr"><b>滑期</b><span className="slip-val">+{m.slip_days} 天</span></div>}
                <div className="tr"><b>进度</b><span>{m.done_tasks}/{m.total_tasks}</span></div>
                <div className="tr"><b>负责人</b><span>{m.owner_name || '-'}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
