import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Tier = 'company' | 'dept' | 'project';
type Mode = 'standup' | 'weekly';

const PROJECTS = [
  { name: 'Q3 大版本改版', milestone: 'M2 核心开发', progress: '67%', health: 'at-risk', owner: '张明' },
  { name: '运营中台优化', milestone: 'M1 需求与设计', progress: '42%', health: 'on-track', owner: '李四' },
  { name: '数据平台建设', milestone: 'M3 测试与验证', progress: '91%', health: 'on-track', owner: '王五' },
  { name: '年度团建活动', milestone: 'Sprint 1', progress: '30%', health: 'on-track', owner: '王芳' },
  { name: '基础设施升级', milestone: '数据迁移', progress: '55%', health: 'blocked', owner: '张三' },
  { name: 'AI 平台迁移', milestone: '模型评估', progress: '78%', health: 'on-track', owner: '赵六' },
];

const PULSE_ITEMS = [
  { dot: '#34d399', who: '王五', what: '用户登录优化 — 已完成' },
  { dot: '#60a5fa', who: '张三', what: '消息推送模块 — 代码 Review' },
  { dot: '#fbbf24', who: '李四', what: '前端首页重构 — 延期，协调中' },
  { dot: '#60a5fa', who: 'AI Agent', what: '3 个后端 PR — 自动 Review 中' },
  { dot: '#34d399', who: '王芳', what: 'PRD v2 终稿 — 已确认' },
  { dot: '#fbbf24', who: '李四', what: '阻塞: UI Review 依赖前端完成' },
];

const SIGNAL_SECTIONS = [
  {
    title: '风险信号',
    items: [
      { level: 'red', text: 'Q3 改版前端重构延期 3 天' },
      { level: 'amber', text: '李四负载 120%，已持续 3 天' },
    ],
  },
  {
    title: 'AI Agent 状态',
    items: [
      { level: 'green', text: '需求分析师 — 分析数据导出需求' },
      { level: 'green', text: '设计师 — 空闲' },
      { level: 'amber', text: '开发工程师 — 3 PR 待 Review' },
      { level: 'green', text: '项目经理 — 生成周报中' },
    ],
  },
];

export default function BigScreenPage() {
  const navigate = useNavigate();
  const [tier, setTier] = useState<Tier>('company');
  const [mode, setMode] = useState<Mode>('standup');

  return (
    <div className="bs-page">
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
            style={{
              padding: '5px 14px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)',
              fontSize: '0.72rem', cursor: 'pointer',
              background: mode === 'standup' ? 'var(--blue-600)' : 'transparent',
              color: mode === 'standup' ? '#fff' : 'rgba(255,255,255,0.5)',
            }}
          >
            站会
          </button>
          <button
            onClick={() => setMode('weekly')}
            style={{
              padding: '5px 14px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)',
              fontSize: '0.72rem', cursor: 'pointer',
              background: mode === 'weekly' ? 'var(--blue-600)' : 'transparent',
              color: mode === 'weekly' ? '#fff' : 'rgba(255,255,255,0.5)',
            }}
          >
            周会
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/dashboard')}
            style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
          >
            退出投屏
          </button>
        </div>
      </div>

      {/* Tier Selector */}
      <div className="bs-tiers">
        <button
          className={`bs-tier-item${tier === 'company' ? ' active' : ''}`}
          onClick={() => setTier('company')}
        >
          公司重点项目
        </button>
        <button
          className={`bs-tier-item${tier === 'dept' ? ' active' : ''}`}
          onClick={() => setTier('dept')}
        >
          部门重点项目
        </button>
        <select
          className="bs-tier-select"
          value={tier === 'project' ? 'q3' : ''}
          onChange={(e) => setTier(e.target.value ? 'project' : 'company')}
        >
          <option value="">选择项目...</option>
          <option value="q3">Q3 大版本改版</option>
          <option value="data">数据平台 2.0</option>
          <option value="ops">运营中台</option>
        </select>
      </div>

      {/* KPI Grid */}
      <div className="bs-grid">
        <div className="bs-card">
          <div className="bs-card-label">项目健康度</div>
          <div className="bs-card-value good">4/6</div>
          <div className="bs-card-sub">{mode === 'weekly' ? '↑ 较上周 +3% · 趋势向好' : '2 项需要注意'}</div>
        </div>
        <div className="bs-card">
          <div className="bs-card-label">整体进度</div>
          <div className="bs-card-value info">67%</div>
          <div className="bs-card-sub">{tier === 'company' ? '6 个项目 · 本周 +5%' : 'Sprint 5 · 剩余 14 天'}</div>
        </div>
        <div className="bs-card">
          <div className="bs-card-label">风险信号</div>
          <div className="bs-card-value warn">3</div>
          <div className="bs-card-sub">1 高风险 · 2 中风险 · 需关注</div>
        </div>
        <div className="bs-card">
          <div className="bs-card-label">AI Agent 活跃</div>
          <div className="bs-card-value info">4</div>
          <div className="bs-card-sub">3 执行中 · 1 空闲 · 本周产出 12 项</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="bs-main-grid">
        {/* Left — Project Table or Pulse */}
        <div className="bs-section">
          <div className="bs-section-head">
            <span>{tier === 'project' ? (mode === 'standup' ? '站会脉搏 · Q3 大版本改版' : '周会回顾 · Q3 大版本改版') : (tier === 'company' ? '项目总览' : '部门项目总览')}</span>
            <span style={{ fontSize: '0.68rem', opacity: 0.4 }}>
              {tier === 'company' ? '共 6 个项目' : tier === 'dept' ? '产品研发部 · 3 个项目' : 'Sprint 5 · 剩余 14 天'}
            </span>
          </div>

          {(tier === 'company' || tier === 'dept') && (
            <table className="bs-table">
              <thead>
                <tr>
                  <th>项目</th><th>里程碑</th><th>进度</th><th>健康度</th><th>负责人</th>
                </tr>
              </thead>
              <tbody>
                {(tier === 'company' ? PROJECTS : PROJECTS.slice(0, 3)).map((p) => (
                  <tr key={p.name}>
                    <td><span className={`bs-status ${p.health}`} />{p.name}</td>
                    <td>{p.milestone}</td>
                    <td>{p.progress}</td>
                    <td>
                      <span style={{ color: p.health === 'on-track' ? '#34d399' : p.health === 'at-risk' ? '#fbbf24' : '#ef4444' }}>
                        {p.health === 'on-track' ? '正常' : p.health === 'at-risk' ? '⚠ 风险' : '🔴 阻塞'}
                      </span>
                    </td>
                    <td>{p.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tier === 'project' && (
            <div>
              <div style={{ padding: '8px 18px', fontSize: '0.65rem', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {mode === 'standup' ? '昨日完成 / 今日计划 / 阻塞项' : '本周完成 / 下周计划 / 风险项'}
              </div>
              {PULSE_ITEMS.map((item, i) => (
                <div key={i} className="bs-pulse-row">
                  <span className="bs-pulse-dot" style={{ background: item.dot }} />
                  <span>{item.what}</span>
                  <span className="bs-pulse-who">{item.who}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — Signals & AI Status */}
        <div>
          {SIGNAL_SECTIONS.map((section) => (
            <div key={section.title} className="bs-section" style={{ marginBottom: 16 }}>
              <div className="bs-section-head">
                <span>{section.title}</span>
                <span style={{ fontSize: '0.68rem', opacity: 0.4 }}>{section.items.length} 项</span>
              </div>
              <div>
                {section.items.map((item, i) => (
                  <div key={i} className="bs-pulse-row">
                    <span
                      className="bs-pulse-dot"
                      style={{
                        background: item.level === 'red' ? '#ef4444' : item.level === 'amber' ? '#fbbf24' : '#34d399',
                      }}
                    />
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
