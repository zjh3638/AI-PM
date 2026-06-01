import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function formatDate(): string {
  return new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

const AGENTS = [
  { name: '需求分析师', busy: true, task: '分析中：数据导出需求' },
  { name: '设计师', busy: false, task: '空闲' },
  { name: '开发工程师', busy: false, task: '3 PR 待 Review' },
  { name: '项目经理', busy: true, task: '生成周报中' },
];

const SIGNALS = [
  { level: 'red' as const, title: '阻塞风险', desc: 'Q3 改版延期影响设计评审里程碑（2 天后）' },
  { level: 'amber' as const, title: '负载预警', desc: '李四本周 12 个任务，负载 120%' },
  { level: 'amber' as const, title: '状态停滞', desc: '运营中台"用户模块重构"5 天无更新' },
  { level: 'amber' as const, title: 'AI 产出待 Review', desc: '3 个 PR 已等待 2 小时' },
];

const PROJECTS = [
  { name: 'Q3 大版本改版', pct: '67%', status: 'warn', label: '1 延期' },
  { name: '运营中台优化', pct: '42%', status: 'good', label: '正常' },
  { name: '数据平台建设', pct: '91%', status: 'good', label: '正常' },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [briefingOpen, setBriefingOpen] = useState(true);

  return (
    <div>
      {/* Header */}
      <div className="focus-header">
        <div className="greeting">{getGreeting()}，张明</div>
        <div className="date">{formatDate()}</div>
      </div>

      {/* AI Briefing */}
      <div className={`briefing-box${briefingOpen ? '' : ' collapsed'}`}>
        <div className="briefing-head" onClick={() => setBriefingOpen(!briefingOpen)}>
          <span className="head-left">
            <span className="ai-badge">AI</span>
            今日简报
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {briefingOpen ? '收起 ▾' : '展开 ▸'}
          </span>
        </div>
        <div className="briefing-body">
          过去 24 小时，你关注的 3 个项目有 <strong>5 个变化</strong>。Q3 改版前端任务已延期 3
          天，建议今天确认是否调整排期；运营中台优化进入设计阶段，设计师 Agent
          已完成首页线框图；数据平台里程碑"数据清洗完成"准时达成。
        </div>
      </div>

      {/* Focus Grid */}
      <div className="focus-grid">
        {/* Left — Decisions + Agent Status */}
        <div>
          <div className="section-label">需要你关注</div>

          <div className="need-card" onClick={() => navigate('/workspaces')}>
            <span className="priority urgent">紧急</span>
            <h4>Q3 改版 — 前端首页重构任务已延期 3 天</h4>
            <div className="meta">
              <span>项目：Q3 改版</span>
              <span>阻塞 2 个下游任务</span>
            </div>
          </div>

          <div className="need-card">
            <span className="priority high">高优</span>
            <h4>运营中台 — 新需求"数据导出功能"等待评审</h4>
            <div className="meta">
              <span>提交人：王芳</span>
              <span>2 小时前</span>
            </div>
          </div>

          <div className="need-card" onClick={() => navigate('/workspaces')}>
            <span className="priority high">高优</span>
            <h4>AI 开发工程师完成 3 个 PR，等待 Review</h4>
            <div className="meta">
              <span>数据平台后端接口</span>
              <span>2 小时前</span>
            </div>
          </div>

          {/* Agent Status */}
          <div className="section-label" style={{ marginTop: 18 }}>AI 助手状态</div>
          <div className="agent-mini">
            {AGENTS.map((a) => (
              <div key={a.name} className="agent-row">
                <span className={`agent-dot ${a.busy ? 'busy' : 'idle'}`} />
                <span className="agent-name">{a.name}</span>
                <span className="agent-tsk">{a.task}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Signals + Project Health */}
        <div>
          <div className="section-label">实时信号</div>
          <div className="signal-card">
            {SIGNALS.map((s, i) => (
              <div key={i} className="signal-row">
                <span className={`lvl ${s.level}`} />
                <span>
                  <strong>{s.title}</strong>
                  <br />
                  {s.desc}
                </span>
              </div>
            ))}
          </div>

          <div className="section-label" style={{ marginTop: 14 }}>我的项目</div>
          <div className="health-list">
            {PROJECTS.map((p) => (
              <div
                key={p.name}
                className="health-row"
                onClick={() => navigate('/workspaces')}
              >
                <span className="hname">{p.name}</span>
                <span className="hstat">
                  <span
                    className={`badge${p.status === 'warn' ? ' badge-amber' : ' badge-green'}`}
                  >
                    {p.pct}
                  </span>
                  {p.status === 'warn' ? '⚠' : '✓'} {p.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
