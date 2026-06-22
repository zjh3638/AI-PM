import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import api from '../../api/client';

const AGENTS = ['需求分析师', '设计师', '开发工程师', '项目经理'];

const SUGGESTIONS = [
  '帮我看看有哪些逾期任务',
  '创建任务：登录模块开发，给张三，高优先',
  '生成本周周报',
  '我的待办有哪些',
];

type Message = { role: 'user' | 'ai'; text: string; agent?: string; actions?: any[] };

export default function AiDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuthStore();
  const location = useLocation();
  const [agent, setAgent] = useState(AGENTS[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsConfig, setNeedsConfig] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Extract workspace_id from URL
  const wsMatch = location.pathname.match(/\/workspaces\/([a-f0-9-]+)/);
  const workspaceId = wsMatch ? wsMatch[1] : undefined;

  // Check LLM config on open
  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      try {
        const res = await api.get('/ai/me/llm-config');
        setNeedsConfig(!res.data.has_api_key);
      } catch { setNeedsConfig(true); }
    })();
  }, [open, user]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    const userMsg: Message = { role: 'user', text: msg };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    // Build conversation history for context
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
      });

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
      setMessages((m) => [...m, { role: 'ai', text: `❌ ${errText}`, agent }]);
    }
    setLoading(false);
  };

  const sendSuggestion = (s: string) => {
    setInput(s);
    sendMessage(s);
  };

  return (
    <>
      <div className={`overlay${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-head">
          <h3>AI 对话</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              style={{
                fontSize: '0.7rem', padding: '3px 8px',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface)',
              }}
            >
              {AGENTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <button className="drawer-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="drawer-body">
          {needsConfig && messages.length === 0 && (
            <div style={{
              padding: 16, margin: '12px 0', borderRadius: 'var(--radius)',
              background: 'var(--amber-50)', border: '1px solid var(--amber-100)',
              fontSize: '0.78rem', color: 'var(--amber-600)', lineHeight: 1.6,
            }}>
              ⚠️ 你还没有配置 LLM API Key。<br />
              请前往 <strong>个人中心 → AI 配置</strong> 设置你的 Key 和模型。
            </div>
          )}

          {!needsConfig && messages.length === 0 && workspaceId && (
            <div style={{
              padding: '6px 12px', marginBottom: 8, fontSize: '0.68rem',
              color: 'var(--text-muted)', textAlign: 'center',
            }}>
              当前工作空间: {workspaceId.slice(0, 8)}...
            </div>
          )}

          {messages.length === 0 && !needsConfig && (
            <div className="chat-cmds">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chat-cmd" onClick={() => sendSuggestion(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="chat-msgs">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {m.role === 'ai' && m.agent && <div className="msg-label">{m.agent}</div>}
                {m.role === 'user' && <div className="msg-label">你</div>}
                <div dangerouslySetInnerHTML={{ __html: m.text.replace(/\n/g, '<br>') }} />
                {m.actions && m.actions.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                    {m.actions.map((a: any, j: number) => (
                      <span key={j} style={{
                        display: 'inline-block', marginRight: 6,
                        padding: '1px 6px', borderRadius: 4,
                        background: 'var(--bg-raised)',
                      }}>
                        ✓ {a.tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="chat-msg ai">
                <div className="msg-label">{agent}</div>
                <em>思考中...</em>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="chat-input-area">
          <input
            type="text"
            placeholder={workspaceId ? '描述你想做的事情...' : '输入指令或问题...'}
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
