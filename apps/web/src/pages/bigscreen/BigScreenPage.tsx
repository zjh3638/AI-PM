import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';

type Tier = 'company' | 'dept' | 'project';
type Mode = 'standup' | 'weekly';

interface WsStat {
  id: string; name: string; type: string;
  track_name: string | null;
  total: number; done: number; pct: number;
  overdue: number; inReview: number;
  owner_name: string | null;
  health: 'on-track' | 'at-risk' | 'blocked';
}

function health(total: number, done: number, overdue: number): WsStat['health'] {
  if (overdue > 2) return 'blocked';
  if (overdue > 0 || (total > 0 && done / total < 0.3)) return 'at-risk';
  return 'on-track';
}

export default function BigScreenPage() {
  const navigate = useNavigate();
  const [tier, setTier] = useState<Tier>('company');
  const [mode, setMode] = useState<Mode>('standup');
  const [wsStats, setWsStats] = useState<WsStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulseItems, setPulseItems] = useState<{ dot: string; who: string; what: string }[]>([]);
  const [signals, setSignals] = useState<{ title: string; items: { level: string; text: string }[] }[]>([]);
  const [selectedWs, setSelectedWs] = useState<WsStat | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Fetch all workspaces
        const wsRes: any = await api.get('/workspaces', { params: { page_size: 50 } });
        const wss = wsRes.data || [];

        // Fetch kanban and milestones for each workspace
        const stats: WsStat[] = [];
        const allPulse: { dot: string; who: string; what: string; ts: string }[] = [];
        const riskItems: { level: string; text: string }[] = [];

        for (const ws of wss) {
          try {
            const isProject = ws.type === 'PROJECT';
            const [kbRes, trackRes] = await Promise.all([
              api.get(`/workspaces/${ws.id}/kanban`),
              api.get(`/workspaces/${ws.id}/${isProject ? 'iterations' : 'milestones'}`),
            ]);
            const tasks = Object.values(kbRes.data || {}).flat() as any[];
            const total = tasks.length;
            const done = tasks.filter((t: any) => t.status === 'DONE').length;
            const overdue = tasks.filter((t: any) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'DONE').length;
            const inReview = tasks.filter((t: any) => t.status === 'IN_REVIEW').length;
            const trackItems = trackRes.data || [];
            const activeTrack = trackItems.find((m: any) => m.status === 'ACTIVE') || trackItems[0];

            stats.push({
              id: ws.id, name: ws.name, type: ws.type,
              track_name: activeTrack?.name || null,
              total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0,
              overdue, inReview,
              owner_name: ws.owner_name || null,
              health: health(total, done, overdue),
            });

            // Build pulse from recent tasks
            const recentTasks = tasks
              .filter((t: any) => t.updated_at)
              .sort((a: any, b: any) => (b.updated_at || '').localeCompare(a.updated_at || ''))
              .slice(0, 3);
            for (const t of recentTasks) {
              const action = t.status === 'DONE' ? '完成了' : t.status === 'IN_REVIEW' ? '提交了 Review' : '更新了';
              allPulse.push({
                dot: t.status === 'DONE' ? '#34d399' : t.status === 'IN_REVIEW' ? '#fbbf24' : '#60a5fa',
                who: t.assignee_name || '未知',
                what: `[${ws.name}] ${action} 「${t.title}」`,
                ts: t.updated_at || '',
              });
            }

            // Risk signals
            if (overdue > 0) riskItems.push({ level: overdue > 2 ? 'red' : 'amber', text: `${ws.name} — ${overdue} 个任务已逾期` });
            if (inReview > 3) riskItems.push({ level: 'amber', text: `${ws.name} — ${inReview} 个任务待 Review` });
          } catch { /* skip */ }
        }

        // Sort pulse by time
        allPulse.sort((a, b) => b.ts.localeCompare(a.ts));
        setPulseItems(allPulse.slice(0, 8));

        // Signals
        riskItems.sort((a, b) => (a.level === 'red' ? -1 : 1));
        setSignals([
          { title: '风险信号', items: riskItems.length > 0 ? riskItems.slice(0, 6) : [{ level: 'green', text: '所有项目运行正常' }] },
          {
            title: 'AI Agent 状态',
            items: [
              { level: 'green', text: '需求分析师 — 就绪' },
              { level: 'green', text: '设计师 — 就绪' },
              { level: 'green', text: '开发工程师 — 就绪' },
              { level: 'green', text: '项目经理 — 就绪' },
            ],
          },
        ]);

        setWsStats(stats);
      } finally { setLoading(false); }
    })();
  }, []);

  // Compute aggregate KPIs
  const totalTasks = wsStats.reduce((s, w) => s + w.total, 0);
  const totalDone = wsStats.reduce((s, w) => s + w.done, 0);
  const totalOverdue = wsStats.reduce((s, w) => s + w.overdue, 0);
  const overallPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;
  const blockedWs = wsStats.filter((w) => w.health === 'blocked').length;
  const atRiskWs = wsStats.filter((w) => w.health === 'at-risk').length;
  const healthyWs = wsStats.filter((w) => w.health === 'on-track').length;

  const activeWss = tier === 'company' ? wsStats : tier === 'dept' ? wsStats.filter(w => w.type === 'PROJECT') : wsStats.filter(w => w.id === selectedWs?.id);

  return (
    <div className={`bs-page${dark ? ' bs-dark' : ''}`}>
      {/* Top Bar */}
      <div className="bs-topbar">
        <div className="bs-logo">
          <span style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--blue-600)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 800 }}>PM</span>
          AI PM
        </div>
        <div className="bs-meta">
          {new Date().toLocaleString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
          {' · '}
          {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="bs-actions">
          <button
            onClick={() => setMode('standup')}
            style={{ padding: '5px 14px', borderRadius: 16, border: '1px solid var(--bs-border)', fontSize: '0.72rem', cursor: 'pointer', background: mode === 'standup' ? 'var(--blue-600)' : 'transparent', color: mode === 'standup' ? '#fff' : 'var(--bs-text-muted)' }}
          >站会</button>
          <button
            onClick={() => setMode('weekly')}
            style={{ padding: '5px 14px', borderRadius: 16, border: '1px solid var(--bs-border)', fontSize: '0.72rem', cursor: 'pointer', background: mode === 'weekly' ? 'var(--blue-600)' : 'transparent', color: mode === 'weekly' ? '#fff' : 'var(--bs-text-muted)' }}
          >周会</button>
          <button className="bs-theme-toggle" onClick={() => setDark((v) => !v)}>{dark ? '☀ 浅色' : '🌙 深色'}</button>
          <button className="bs-theme-toggle" onClick={() => navigate('/dashboard')}>退出投屏</button>
        </div>
      </div>

      {/* Tier Selector */}
      <div className="bs-tiers">
        <button className={`bs-tier-item${tier === 'company' ? ' active' : ''}`} onClick={() => { setTier('company'); setSelectedWs(null); }}>公司重点项目</button>
        <button className={`bs-tier-item${tier === 'dept' ? ' active' : ''}`} onClick={() => { setTier('dept'); setSelectedWs(null); }}>研发项目</button>
        <select
          className="bs-tier-select"
          value={selectedWs?.id || ''}
          onChange={(e) => {
            const ws = wsStats.find(w => w.id === e.target.value);
            if (ws) { setTier('project'); setSelectedWs(ws); }
            else { setTier('company'); setSelectedWs(null); }
          }}
        >
          <option value="">选择项目...</option>
          {wsStats.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, opacity: 0.5 }}>加载中...</div>
      ) : (
        <>
          {/* KPI Grid */}
          <div className="bs-grid">
            <div className="bs-card">
              <div className="bs-card-label">项目健康度</div>
              <div className="bs-card-value good">{healthyWs}/{wsStats.length}</div>
              <div className="bs-card-sub">{blockedWs > 0 ? `${blockedWs} 阻塞` : ''}{atRiskWs > 0 ? ` · ${atRiskWs} 风险` : ''}{blockedWs === 0 && atRiskWs === 0 ? '全部正常' : ''}</div>
            </div>
            <div className="bs-card">
              <div className="bs-card-label">整体进度</div>
              <div className="bs-card-value info">{overallPct}%</div>
              <div className="bs-card-sub">{wsStats.length} 个项目 · {totalDone}/{totalTasks} 任务</div>
            </div>
            <div className="bs-card">
              <div className="bs-card-label">风险信号</div>
              <div className="bs-card-value warn">{totalOverdue}</div>
              <div className="bs-card-sub">{totalOverdue > 0 ? `${totalOverdue} 个逾期任务需要关注` : '无逾期任务'}</div>
            </div>
            <div className="bs-card">
              <div className="bs-card-label">AI Agent 活跃</div>
              <div className="bs-card-value info">4</div>
              <div className="bs-card-sub">4 就绪 · 待接入任务队列</div>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="bs-main-grid">
            {/* Left — Project Table or Pulse */}
            <div className="bs-section">
              <div className="bs-section-head">
                <span>
                  {tier === 'project'
                    ? (mode === 'standup' ? `站会脉搏 · ${selectedWs?.name || ''}` : `周会回顾 · ${selectedWs?.name || ''}`)
                    : (tier === 'company' ? '项目总览' : '研发项目总览')}
                </span>
                <span style={{ fontSize: '0.68rem', opacity: 0.4 }}>
                  {tier === 'company' ? `共 ${wsStats.length} 个项目` : tier === 'dept' ? `共 ${activeWss.length} 个项目` : `${selectedWs?.total || 0} 任务 · ${selectedWs?.done || 0} 完成`}
                </span>
              </div>

              {(tier === 'company' || tier === 'dept') && (
                <table className="bs-table">
                  <thead>
                    <tr>
                      <th>项目</th><th>里程碑/迭代</th><th>进度</th><th>健康度</th><th>负责人</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeWss.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', opacity: 0.4 }}>暂无项目数据</td></tr>
                    )}
                    {activeWss.map((w) => (
                      <tr key={w.id} style={{ cursor: 'pointer' }} onClick={() => { setTier('project'); setSelectedWs(w); }}>
                        <td><span className={`bs-status ${w.health}`} />{w.name}</td>
                        <td>{w.track_name || '-'}</td>
                        <td>{w.pct}%</td>
                        <td>
                          <span style={{ color: w.health === 'on-track' ? '#34d399' : w.health === 'at-risk' ? '#fbbf24' : '#ef4444' }}>
                            {w.health === 'on-track' ? '正常' : w.health === 'at-risk' ? '⚠ 风险' : '🔴 阻塞'}
                          </span>
                        </td>
                        <td>{w.owner_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tier === 'project' && selectedWs && (
                <div>
                  <div style={{ padding: '8px 18px', fontSize: '0.65rem', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {mode === 'standup' ? '项目详情' : '进度概览'}
                  </div>
                  <div style={{ padding: '8px 18px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ padding: 10, background: 'var(--bs-surface)', borderRadius: 6 }}>
                        <div style={{ fontSize: '0.62rem', opacity: 0.4, marginBottom: 4 }}>总任务</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{selectedWs.total}</div>
                      </div>
                      <div style={{ padding: 10, background: 'var(--bs-surface)', borderRadius: 6 }}>
                        <div style={{ fontSize: '0.62rem', opacity: 0.4, marginBottom: 4 }}>已完成</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#34d399' }}>{selectedWs.done}</div>
                      </div>
                      <div style={{ padding: 10, background: 'var(--bs-surface)', borderRadius: 6 }}>
                        <div style={{ fontSize: '0.62rem', opacity: 0.4, marginBottom: 4 }}>逾期</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: selectedWs.overdue > 0 ? '#ef4444' : '#34d399' }}>{selectedWs.overdue}</div>
                      </div>
                      <div style={{ padding: 10, background: 'var(--bs-surface)', borderRadius: 6 }}>
                        <div style={{ fontSize: '0.62rem', opacity: 0.4, marginBottom: 4 }}>待 Review</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: selectedWs.inReview > 0 ? '#fbbf24' : 'var(--bs-text)' }}>{selectedWs.inReview}</div>
                      </div>
                    </div>
                  </div>
                  {/* Pulse items for this project */}
                  {pulseItems.filter(p => p.what.includes(`[${selectedWs.name}]`)).slice(0, 6).map((item, i) => (
                    <div key={i} className="bs-pulse-row">
                      <span className="bs-pulse-dot" style={{ background: item.dot }} />
                      <span>{item.what}</span>
                      <span className="bs-pulse-who">{item.who}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right — Signals */}
            <div>
              {signals.map((section) => (
                <div key={section.title} className="bs-section" style={{ marginBottom: 16 }}>
                  <div className="bs-section-head">
                    <span>{section.title}</span>
                    <span style={{ fontSize: '0.68rem', opacity: 0.4 }}>{section.items.length} 项</span>
                  </div>
                  <div>
                    {section.items.map((item, i) => (
                      <div key={i} className="bs-pulse-row">
                        <span className="bs-pulse-dot" style={{ background: item.level === 'red' ? '#ef4444' : item.level === 'amber' ? '#fbbf24' : '#34d399' }} />
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Recent activity pulse */}
              {pulseItems.length > 0 && (tier !== 'project') && (
                <div className="bs-section" style={{ marginBottom: 16 }}>
                  <div className="bs-section-head">
                    <span>最新动态</span>
                    <span style={{ fontSize: '0.68rem', opacity: 0.4 }}>{pulseItems.length} 项</span>
                  </div>
                  <div>
                    {pulseItems.slice(0, 8).map((item, i) => (
                      <div key={i} className="bs-pulse-row">
                        <span className="bs-pulse-dot" style={{ background: item.dot }} />
                        <span>{item.what}</span>
                        <span className="bs-pulse-who">{item.who}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
