import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuthStore } from '../../stores/authStore';
import api from '../../api/client';
import { streamChat } from '../../api/aiStream';
import { applyFrame } from './aiReducer';
import { useRouteContext } from './useRouteContext';
import type { ChatMsg, ToolCallTrace } from './aiTypes';

const AGENTS = ['项目经理', '开发工程师', '需求分析师', '设计师'];
const SUGGESTIONS = [
  '帮我看看有哪些逾期任务',
  '创建任务：登录模块开发，高优先级',
  '生成本周周报',
  '我的待办有哪些',
];
const TOOL_LABELS: Record<string, string> = {
  get_workspace_context: '获取项目信息',
  create_task: '创建任务',
  update_task: '更新任务',
  search_tasks: '搜索任务',
  get_my_tasks: '查询待办',
  generate_report: '生成报告',
  scan_risks: '扫描风险',
  decompose_requirement: '拆解需求',
  extract_action_items: '提取会议待办',
};

export default function AiDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuthStore();
  const routeCtx = useRouteContext();
  const [agent, setAgent] = useState(AGENTS[0]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsConfig, setNeedsConfig] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !user) return;
    const ws = routeCtx.workspace_id;
    let cancelled = false;
    (async () => {
      try {
        const [cfg, hist] = await Promise.all([
          api.get('/ai/me/llm-config'),
          api.get('/ai/chat-history', { params: ws ? { workspace_id: ws } : {} }),
        ]);
        if (cancelled) return;
        setNeedsConfig(!cfg.data.has_api_key);
        const d = hist.data;
        if (d?.conversation_id) {
          setConversationId(d.conversation_id);
          setMessages(historyToMsgs(d.messages));
        } else {
          setConversationId(undefined);
          setMessages([]);
        }
        setLoaded(true);
      } catch {
        if (cancelled) return;
        setNeedsConfig(true);
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open, user, routeCtx.workspace_id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  useEffect(() => {
    if (!open) { setInput(''); setLoaded(false); abortRef.current?.abort(); }
  }, [open]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', text: msg };
    const aiPlaceholder: ChatMsg = {
      id: `tmp-${Date.now()}`, role: 'assistant', status: 'streaming',
      text: '', toolCalls: [], agent,
    };
    setMessages(m => [...m, userMsg, aiPlaceholder]);
    setInput('');
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamChat(
        { message: msg, agent, conversation_id: conversationId,
          workspace_id: routeCtx.workspace_id, route_context: routeCtx },
        { onFrame: (f) => setMessages(prev => {
            const next = applyFrame(prev, f);
            if (f.event === 'done') setConversationId(f.data.conversation_id);
            return next;
          })
        },
        ctrl,
      );
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setMessages(prev => applyFrame(prev, { event: 'error', data: { message: e?.message || '请求失败' } }));
      }
    }
    setLoading(false);
    abortRef.current = null;
  }, [input, loading, agent, conversationId, routeCtx]);

  const stopGeneration = () => abortRef.current?.abort();
  const newConversation = () => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(undefined);
  };

  return (
    <>
      <div className={`overlay${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-head">
          <div><h3>AI 助手</h3></div>
          <div className="drawer-head-right">
            <button className="drawer-newchat" onClick={newConversation} title="新对话">＋</button>
            <select className="drawer-agent-select" value={agent} onChange={e => setAgent(e.target.value)}>
              {AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button className="drawer-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="drawer-body">
          {needsConfig && (
            <div className="drawer-config-warn">
              <strong>AI 助手未配置</strong><br />
              请前往 <strong>个人中心 → AI 配置</strong> 设置 API Key 和模型。
            </div>
          )}
          {messages.length === 0 && loaded && !needsConfig && (
            <div className="chat-welcome">
              <div className="cw-icon">🤖</div>
              <div className="cw-title">有什么可以帮你的？</div>
              <div className="cw-desc">我是你的 {agent} 助手。</div>
              <div className="chat-cmds">
                {SUGGESTIONS.map(s => (
                  <button key={s} className="chat-cmd" onClick={() => sendMessage(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          <div className="chat-msgs">
            {messages.map(m => <MessageView key={m.id} msg={m} userName={user?.display_name || '你'} />)}
            <div ref={bottomRef} />
          </div>
        </div>
        <div className="chat-input-area">
          <input type="text" placeholder={needsConfig ? '请先配置 AI Key...' : '输入指令，Enter 发送'}
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            disabled={loading || needsConfig} />
          {loading
            ? <button className="send-btn stop" onClick={stopGeneration}>■</button>
            : <button className="send-btn" onClick={() => sendMessage()} disabled={needsConfig}>↑</button>}
        </div>
      </div>
    </>
  );
}

function MessageView({ msg, userName }: { msg: ChatMsg; userName: string }) {
  if (msg.role === 'user') {
    return (
      <div className="chat-msg user">
        <div className="msg-label">{userName}</div>
        <div className="msg-text-plain">{msg.text}</div>
      </div>
    );
  }
  const isStreaming = msg.status === 'streaming';
  return (
    <div className={`chat-msg ai${msg.status === 'error' ? ' error' : ''}`}>
      <div className="msg-label">{msg.agent}{isStreaming && <span className="streaming-dot"> ●</span>}</div>
      {msg.toolCalls.length > 0 && (
        <div className="tool-traces">
          {msg.toolCalls.map(tc => <ToolTraceCard key={tc.idx} trace={tc} />)}
        </div>
      )}
      {msg.text && (
        <div className="msg-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
        </div>
      )}
      {msg.error && <div className="msg-error">⚠ {msg.error}</div>}
    </div>
  );
}

function ToolTraceCard({ trace }: { trace: ToolCallTrace }) {
  const [open, setOpen] = useState(trace.state === 'error');
  const icon = trace.state === 'running' ? '⏳' : trace.state === 'success' ? '✓' : '✗';
  const label = TOOL_LABELS[trace.tool] || trace.tool;
  return (
    <div className={`tool-trace ${trace.state}`}>
      <div className="tool-trace-head" onClick={() => setOpen(o => !o)}>
        <span className="tool-trace-icon">{icon}</span>
        <span className="tool-trace-label">{label}</span>
        <span className="tool-trace-toggle">{open ? '▼' : '▸'}</span>
      </div>
      {open && (
        <div className="tool-trace-body">
          <div><strong>参数:</strong> <code>{JSON.stringify(trace.args)}</code></div>
          {trace.resultSummary && <div><strong>结果:</strong> <code>{trace.resultSummary}</code></div>}
          {trace.errorMsg && <div className="tool-trace-error"><strong>错误:</strong> {trace.errorMsg}</div>}
        </div>
      )}
    </div>
  );
}

function historyToMsgs(rows: any[]): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const r of rows) {
    if (r.role === 'user') {
      out.push({ id: r.id, role: 'user', text: r.content });
    } else if (r.role === 'assistant') {
      out.push({
        id: r.id, role: 'assistant', status: 'done',
        text: r.content || '', agent: r.agent || '项目经理',
        toolCalls: (r.tool_calls || []).map((tc: any, i: number) => ({
          idx: tc.index ?? i, tool: tc.function?.name || tc.tool,
          args: parseJsonSafe(tc.function?.arguments), state: 'success' as const,
        })),
        actions: r.actions,
      });
    }
    // tool messages are folded into the preceding assistant's toolCalls when rendering
    // (visible via tool_calls already); we skip them as separate rows
  }
  return out;
}

function parseJsonSafe(s: string | undefined): Record<string, unknown> {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}
