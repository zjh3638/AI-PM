import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import api from '../../api/client';

const AGENTS = ['项目经理', '开发工程师', '需求分析师', '设计师'];

const SUGGESTIONS = [
  '帮我看看有哪些逾期任务',
  '创建任务：登录模块开发，高优先级',
  '生成本周周报',
  '我的待办有哪些',
];

type Message = { role: 'user' | 'ai'; text: string; agent?: string; actions?: any[] };

export default function AiDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuthStore();
  const location = useLocation();
  const { current } = useWorkspaceStore();
  const [agent, setAgent] = useState(AGENTS[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsConfig, setNeedsConfig] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const wsMatch = location.pathname.match(/\/workspaces\/([a-f0-9-]+)/);
  const workspaceId = wsMatch ? wsMatch[1] : undefined;
  const wsName = workspaceId ? (current?.name || '') : '';

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      try {
        const [cfgRes, histRes] = await Promise.all([
          api.get('/ai/me/llm-config'),
          api.get('/ai/chat-history'),
        ]);
        setNeedsConfig(!cfgRes.data.has_api_key);

        if (histRes.data && Array.isArray(histRes.data)) {
          const msgs: Message[] = histRes.data.map((m: any) => ({
            role: m.role === 'assistant' ? 'ai' : 'user',
            text: m.content,
            agent: m.agent,
            actions: m.actions,
          }));
          setMessages(msgs);
        }
        setLoaded(true);
      } catch {
        setNeedsConfig(true);
        setLoaded(true);
      }
    })();
  }, [open, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Reset loaded flag on close
  useEffect(() => {
    if (!open) {
      setInput('');
      setLoaded(false);
    }
  }, [open]);

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    const userMsg: Message = { role: 'user', text: msg };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    const history = messages.map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text,
    })).slice(-10);

    try {
      const res = await api.post('/ai/chat', {
        message: msg,
        agent,
        workspace_id: workspaceId,
        conversation_history: history,
      }, { timeout: 60000 });

      const data = res.data;
      const aiMsg: Message = {
        role: 'ai',
        text: data.reply || '(无回复)',
        agent,
        actions: data.actions,
      };
      setMessages((m) => [...m, aiMsg]);
    } catch (e: any) {
      const errText = e?.response?.data?.detail || e?.message || '请求失败';
      setMessages((m) => [...m, { role: 'ai', text: `请求失败：${errText}`, agent }]);
    }
    setLoading(false);
  };

  const sendSuggestion = (s: string) => {
    sendMessage(s);
  };

  const toolLabel: Record<string, string> = {
    get_workspace_context: '获取项目信息',
    create_task: '创建任务',
    update_task: '更新任务',
    search_tasks: '搜索任务',
    get_my_tasks: '查询待办',
    generate_report: '生成报告',
  };

  return (
    <>
      <div className={`overlay${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`drawer${open ? ' open' : ''}`}>
        {/* Header */}
        <div className="drawer-head">
          <div>
            <h3>AI 助手</h3>
          </div>
          <div className="drawer-head-right">
            <select
              className="drawer-agent-select"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
            >
              {AGENTS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <button className="drawer-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="drawer-body">
          {/* Config warning */}
          {needsConfig && (
            <div className="drawer-config-warn">
              <strong>AI 助手未配置</strong><br />
              请前往 <strong>个人中心 → AI 配置</strong> 设置你的 API Key 和模型。
            </div>
          )}

          {/* Workspace context */}
          {!needsConfig && workspaceId && wsName && (
            <div className="drawer-ctx-bar">
              📁 当前项目：{wsName}
            </div>
          )}

          {/* Welcome */}
          {messages.length === 0 && loaded && !needsConfig && (
            <div className="chat-welcome">
              <div className="cw-icon">🤖</div>
              <div className="cw-title">有什么可以帮你的？</div>
              <div className="cw-desc">
                我是你的 {agent} 助手，可以帮你管理任务、生成报告、分析项目进度。
              </div>
              <div className="chat-cmds">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chat-cmd" onClick={() => sendSuggestion(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="chat-msgs">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                <div className="msg-label">
                  {m.role === 'ai' ? m.agent : (user?.display_name || '你')}
                </div>
                <div dangerouslySetInnerHTML={{ __html: m.text.replace(/\n/g, '<br>') }} />
                {m.actions && m.actions.length > 0 && (
                  <div className="msg-actions">
                    {m.actions.map((a: any, j: number) => (
                      <span key={j} className="msg-action-chip">
                        ✓ {toolLabel[a.tool] || a.tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="chat-thinking">
                <span className="dot-pulse">{agent} 思考中</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <input
            type="text"
            placeholder={needsConfig ? '请先配置 AI Key...' : workspaceId ? '描述你想做的事情...' : '输入指令或问题，Enter 发送'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            disabled={loading || needsConfig}
          />
          <button className="send-btn" onClick={() => sendMessage()} disabled={loading || needsConfig}>
            ↑
          </button>
        </div>
      </div>
    </>
  );
}
