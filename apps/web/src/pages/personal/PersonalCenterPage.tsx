import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import api from '../../api/client';

const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const PRIORITY_LABEL: Record<string, string> = { CRITICAL: '紧急', HIGH: '高', MEDIUM: '中', LOW: '低' };
const PRIORITY_CLASS: Record<string, string> = { CRITICAL: 'badge-red', HIGH: 'badge-amber', MEDIUM: 'badge-blue', LOW: '' };

function groupByDate(items: any[], dateKey: string): { label: string; items: any[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Record<string, any[]> = { '今天': [], '昨天': [], '更早': [] };
  for (const item of items) {
    const d = new Date(item[dateKey]);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() >= today.getTime()) groups['今天'].push(item);
    else if (d.getTime() >= yesterday.getTime()) groups['昨天'].push(item);
    else groups['更早'].push(item);
  }
  return Object.entries(groups)
    .filter(([, v]) => v.length > 0)
    .map(([label, items]) => ({ label, items }));
}

export default function PersonalCenterPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('todos');
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // LLM config
  const [llmCfg, setLlmCfg] = useState({ llm_model: '', api_key_masked: null as string | null, has_api_key: false, gateway_url: '' });
  const [llmKey, setLlmKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmMsg, setLlmMsg] = useState('');

  useEffect(() => { fetchLLMConfig(); }, []);
  const fetchLLMConfig = async () => {
    try {
      const res = await api.get('/ai/me/llm-config');
      setLlmCfg(res.data);
      setLlmModel(res.data.llm_model || '');
    } catch { /* skip */ }
  };
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/dashboard/my-tasks'),
      api.get('/dashboard/review-queue'),
      api.get('/workspaces').then(async (wsRes: any) => {
        const wss = wsRes.data || [];
        const allActivity: any[] = [];
        for (const ws of wss.slice(0, 3)) {
          try {
            const res = await api.get(`/workspaces/${ws.id}/tasks?page_size=5&sort_by=updated_at&sort_dir=desc`);
            const tasks = res.data || [];
            for (const t of tasks) {
              if (t.updated_at) allActivity.push({ ...t, _wsName: ws.name });
            }
          } catch { /* skip */ }
        }
        return allActivity.sort((a: any, b: any) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 10);
      }),
    ])
      .then(([t, r, msg]) => {
        setMyTasks(t.data || []);
        setReviewQueue(r.data || []);
        setMessages(msg || []);
      })
      .finally(() => setLoading(false));
  }, []);

  // Sort and group todos by priority
  const sortedTodos = useMemo(() => {
    return [...myTasks].sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 99;
      const pb = PRIORITY_ORDER[b.priority] ?? 99;
      if (pa !== pb) return pa - pb;
      // Same priority: overdue first
      const aOverdue = a.due_date && new Date(a.due_date) < new Date();
      const bOverdue = b.due_date && new Date(b.due_date) < new Date();
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return 0;
    });
  }, [myTasks]);

  // Group todos by priority
  const todoGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const t of sortedTodos) {
      const key = t.priority || 'LOW';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    return Object.entries(groups).sort(([a], [b]) => (PRIORITY_ORDER[a] ?? 99) - (PRIORITY_ORDER[b] ?? 99));
  }, [sortedTodos]);

  // Activity grouped by date
  const activityGroups = useMemo(() => groupByDate(messages, 'updated_at'), [messages]);

  const handleMarkDone = async (e: React.MouseEvent, task: any) => {
    e.stopPropagation();
    try {
      await api.patch(`/workspaces/${task.workspace_id}/tasks/${task.id}`, { status: 'DONE' });
      setMyTasks(prev => prev.filter(x => x.id !== task.id));
    } catch { /* skip */ }
  };

  const handleReview = async (e: React.MouseEvent, t: any, approve: boolean) => {
    e.stopPropagation();
    try {
      await api.patch(`/workspaces/${t.workspace_id}/tasks/${t.id}`, { status: approve ? 'DONE' : 'IN_PROGRESS' });
      setReviewQueue(prev => prev.filter(x => x.id !== t.id));
    } catch { /* skip */ }
  };

  const tabs = [
    { key: 'todos', label: '我的待办', count: myTasks.length },
    { key: 'reviews', label: '待 Review', count: reviewQueue.length },
    { key: 'messages', label: '动态', count: messages.length },
    { key: 'llm', label: 'AI 配置', count: llmCfg.has_api_key ? 0 : 0, dot: !llmCfg.has_api_key },
  ];

  return (
    <div>
      {/* Personal Header */}
      <div className="personal-header">
        <div className="personal-avatar">
          {(user?.display_name || user?.username || '用')[0]}
        </div>
        <div className="personal-info">
          <h2>{user?.display_name || user?.username || '用户'}</h2>
          <div className="pi-meta">
            {user?.email || '未设置邮箱'} · {user?.department_name || '未分配部门'} · {user?.system_role === 'SUPER_ADMIN' ? '超级管理员' : user?.system_role === 'ADMIN' ? '管理员' : '成员'}
          </div>
        </div>
        <div className="personal-actions">
          <button className="btn btn-ghost btn-sm">编辑资料</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="personal-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`personal-tab${activeTab === t.key ? ' active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
            {t.dot && <span className="pt-dot" />}
            {t.count > 0 && <span className="pt-badge">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      {loading ? (
        <div className="empty-state">加载中...</div>
      ) : (
        <>
          {/* Todos Panel — grouped by priority */}
          <div className={`personal-panel${activeTab === 'todos' ? ' active' : ''}`}>
            {sortedTodos.length === 0 ? (
              <div className="empty-state">暂无待办事项 🎉</div>
            ) : (
              todoGroups.map(([priority, tasks]) => (
                <div key={priority} className="todo-group">
                  <div className="todo-group-header">
                    <span className={`badge ${PRIORITY_CLASS[priority] || ''}`}>
                      {PRIORITY_LABEL[priority] || priority} 优先级
                    </span>
                    <span className="todo-group-count">{tasks.length} 项</span>
                  </div>
                  {tasks.map((t: any) => {
                    const isOverdue = t.due_date && new Date(t.due_date) < new Date();
                    return (
                      <div key={t.id} className={`todo-item${isOverdue ? ' overdue' : ''}`} onClick={() => navigate(`/workspaces/${t.workspace_id}`)}>
                        <div className="todo-checkbox" onClick={(e) => handleMarkDone(e, t)} title="标记完成" />
                        <div className="todo-body">
                          <span className="todo-text">{t.title}</span>
                          <span className="todo-meta">
                            {t.status === 'TODO' ? <span className="badge badge-todo">待办</span> : <span className="badge badge-progress">进行中</span>}
                            {t.phase && <span className="todo-meta-info">{t.phase === 'PLAN' ? '需求' : t.phase === 'DESIGN' ? '设计' : t.phase === 'DEVELOPMENT' ? '开发' : t.phase === 'TESTING' ? '测试' : t.phase === 'RELEASE' ? '发布' : ''}</span>}
                            {t.due_date && <span className="todo-meta-date" style={{ color: isOverdue ? 'var(--red-500)' : 'var(--text-muted)' }}>📅 {t.due_date}</span>}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Review Panel */}
          <div className={`personal-panel${activeTab === 'reviews' ? ' active' : ''}`}>
            {reviewQueue.length === 0 ? (
              <div className="empty-state">暂无待 Review 项</div>
            ) : (
              reviewQueue.map((t: any) => (
                <div key={t.id} className="review-item" onClick={() => navigate(`/workspaces/${t.workspace_id}`)}>
                  <div className="review-icon">📋</div>
                  <div className="review-info">
                    <div className="ri-title">{t.title}</div>
                    <div className="ri-meta">
                      {t.phase && <span className="badge badge-blue ri-phase-badge">{t.phase === 'PLAN' ? '需求' : t.phase === 'DESIGN' ? '设计' : t.phase === 'DEVELOPMENT' ? '开发' : t.phase === 'TESTING' ? '测试' : '发布'}</span>}
                      {(t.milestone_name || t.iteration_name) && <span className="ri-milestone-info">{t.milestone_name || t.iteration_name}</span>}
                      {t.assignee_name || '未分配'}
                    </div>
                  </div>
                  <div className="review-actions">
                    <button className="btn btn-primary btn-xs" onClick={(e) => handleReview(e, t, true)}>确认</button>
                    <button className="btn btn-ghost btn-xs" onClick={(e) => handleReview(e, t, false)}>打回</button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Messages Panel — grouped by date */}
          <div className={`personal-panel${activeTab === 'messages' ? ' active' : ''}`}>
            {messages.length === 0 ? (
              <div className="empty-state">暂无动态</div>
            ) : (
              activityGroups.map(({ label, items }) => (
                <div key={label} className="msg-group">
                  <div className="msg-group-header">{label}</div>
                  {items.map((t: any) => {
                    const actionText = t.status === 'DONE' ? '完成了' : t.status === 'IN_REVIEW' ? '提交了 Review' : t.status === 'IN_PROGRESS' ? '开始处理' : '创建了';
                    return (
                      <div key={t.id} className="msg-item" onClick={() => navigate(`/workspaces/${t.workspace_id}`)}>
                        <span className="msg-dot" style={{ background: t.status === 'DONE' ? 'var(--green-400)' : t.status === 'IN_REVIEW' ? 'var(--amber-400)' : 'var(--blue-400)' }} />
                        <div className="msg-content">
                          <div className="mc-text">[{t._wsName}] {t.assignee_name || '未知'} {actionText} 「{t.title}」</div>
                          <div className="mc-time">{t.updated_at?.slice(0, 10)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* LLM Config Panel */}
          <div className={`personal-panel${activeTab === 'llm' ? ' active' : ''}`}>
            <div className="llm-config-page">
              {/* Status card */}
              <div className={`llm-status-card${llmCfg.has_api_key ? ' configured' : ''}`}>
                <div className="llm-status-icon">
                  {llmCfg.has_api_key ? '✅' : '⚠️'}
                </div>
                <div className="llm-status-text">
                  <div className="llm-status-title">
                    {llmCfg.has_api_key ? 'AI 助手已就绪' : 'AI 助手未配置'}
                  </div>
                  <div className="llm-status-desc">
                    {llmCfg.has_api_key
                      ? `模型: ${llmCfg.llm_model || '未选择'} · Key: ${llmCfg.api_key_masked}`
                      : '配置你的 LLM API Key 后即可使用 AI 对话功能（Ctrl+K 唤起）'}
                  </div>
                </div>
              </div>

              {/* Gateway info */}
              <div className="llm-gateway-card">
                <div className="llm-gateway-label">网关地址</div>
                <code className="llm-gateway-url">{llmCfg.gateway_url}</code>
                <div className="llm-gateway-hint">由系统管理员统一配置，所有用户共用此网关</div>
              </div>

              {/* Config form */}
              <form onSubmit={(e) => { e.preventDefault(); setLlmSaving(true); setLlmMsg('');
                const payload: Record<string, string> = {};
                if (llmKey) payload.api_key = llmKey;
                payload.model = llmModel || '';
                api.patch('/ai/me/llm-config', payload).then(() => { setLlmKey(''); setLlmMsg('配置已保存'); fetchLLMConfig(); }).catch(() => setLlmMsg('保存失败，请重试')).finally(() => setLlmSaving(false));
              }} className="llm-form">
                <div className="llm-form-group">
                  <label className="llm-form-label">API Key</label>
                  <div className="llm-key-input-wrap">
                    <input
                      type="password"
                      value={llmKey}
                      onChange={(e) => setLlmKey(e.target.value)}
                      placeholder={llmCfg.has_api_key ? '留空则保持当前 Key' : '粘贴你的 API Key'}
                      className="llm-key-input"
                    />
                  </div>
                  {llmCfg.has_api_key && (
                    <div className="llm-form-hint">
                      已保存 · 输入新 Key 将覆盖旧 Key
                    </div>
                  )}
                </div>

                <div className="llm-form-group">
                  <label className="llm-form-label">选择模型</label>
                  <div className="llm-model-grid">
                    {[
                      { id: 'deepseek-chat', name: 'DeepSeek Chat', desc: '通用对话' },
                      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', desc: '深度推理' },
                      { id: 'qwen-max', name: 'Qwen Max', desc: '阿里通义千问' },
                      { id: 'qwen3.5-plus', name: 'Qwen 3.5 Plus', desc: '新一代千问' },
                      { id: 'gpt-4o', name: 'GPT-4o', desc: 'OpenAI 多模态' },
                      { id: 'claude-3.5-sonnet', name: 'Claude 3.5', desc: 'Anthropic' },
                    ].map((m) => (
                      <div
                        key={m.id}
                        className={`llm-model-card${llmModel === m.id ? ' selected' : ''}`}
                        onClick={() => setLlmModel(m.id)}
                      >
                        <div className="llm-model-name">{m.name}</div>
                        <div className="llm-model-desc">{m.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="llm-form-actions">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={llmSaving}>
                    {llmSaving ? '保存中...' : '保存配置'}
                  </button>
                  {llmMsg && (
                    <span className={`llm-form-msg${llmMsg.includes('失败') ? ' error' : ''}`}>
                      {llmMsg}
                    </span>
                  )}
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
