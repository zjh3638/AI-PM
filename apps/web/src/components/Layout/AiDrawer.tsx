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
const SLASH_COMMANDS = [
  { trigger: '/风险', label: '扫描风险', msg: '帮我扫描当前项目的风险' },
  { trigger: '/周报', label: '生成周报', msg: '生成本周周报' },
  { trigger: '/拆解', label: '拆解需求', msg: '帮我把这个需求拆成子任务：' },
  { trigger: '/待办', label: '查看待办', msg: '查看我的待办任务' },
  { trigger: '/建任务', label: '创建任务', msg: '创建任务：' },
  { trigger: '/搜任务', label: '搜索任务', msg: '搜索任务：' },
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
  const inputRef = useRef<HTMLInputElement>(null);
  // slash-command palette
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const slashMatches = SLASH_COMMANDS.filter(
    c => c.trigger.startsWith(input) || c.label.includes(input.slice(1)),
  );

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

  const closeSlash = () => { setSlashOpen(false); setSlashIdx(0); };

  const sendMessage = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    closeSlash();
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

  const handleInputChange = (val: string) => {
    setInput(val);
    if (val.startsWith('/')) {
      setSlashOpen(true);
      setSlashIdx(0);
    } else {
      setSlashOpen(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (slashOpen && slashMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIdx(i => (i + 1) % slashMatches.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIdx(i => (i - 1 + slashMatches.length) % slashMatches.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        pickSlash(slashMatches[slashIdx]);
      } else if (e.key === 'Escape') {
        closeSlash();
      }
      return;
    }
    if (e.key === 'Enter') sendMessage();
  };

  const pickSlash = (cmd: typeof SLASH_COMMANDS[number]) => {
    setInput(cmd.msg);
    closeSlash();
    inputRef.current?.focus();
  };

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
          {slashOpen && slashMatches.length > 0 && (
            <div className="slash-palette">
              {slashMatches.map((c, i) => (
                <div key={c.trigger}
                  className={`slash-item${i === slashIdx ? ' active' : ''}`}
                  onMouseDown={e => { e.preventDefault(); pickSlash(c); }}
                  onMouseEnter={() => setSlashIdx(i)}>
                  <span className="slash-trigger">{c.trigger}</span>
                  <span className="slash-label">{c.label}</span>
                </div>
              ))}
            </div>
          )}
          <input type="text" ref={inputRef}
            placeholder={needsConfig ? '请先配置 AI Key...' : '输入指令，输入 / 查看快捷指令…'}
            value={input} onChange={e => handleInputChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
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
  const routeCtx = useRouteContext();
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
      {msg.actions && msg.actions.length > 0 && (
        <div className="action-cards">
          {msg.actions.map((a, i) => <ActionCard key={`${a.tool}-${i}`} action={a} routeCtx={routeCtx} />)}
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

function ActionCard({ action, routeCtx }: {
  action: { tool: string; args: Record<string, unknown>; result: Record<string, unknown> };
  routeCtx: { workspace_id?: string; workspace_name?: string };
}) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[action.tool] || action.tool;
  const result = action.result as Record<string, any>;
  const err = result?.error as string | undefined;

  // ── result-driven micro-summary ──────────────────────────────────
  let summary: React.ReactNode = null;
  let links: { label: string; href: string }[] = [];

  if (action.tool === 'create_task' && !err) {
    const tid = result?.id as string | undefined;
    const title = result?.title as string || '';
    summary = <>✅ 已创建任务：<strong>{title}</strong></>;
    if (tid && routeCtx.workspace_id) {
      links.push({ label: '打开任务',
        href: `/workspace/${routeCtx.workspace_id}/backlog?task=${tid}` });
    }
  } else if (action.tool === 'decompose_requirement' && !err) {
    const parentTitle = (result?.parent as any)?.title || '';
    const count = result?.created_count ?? result?.children?.length ?? 0;
    summary = <>✅ 父需求 <strong>{parentTitle}</strong> 下已创建 {count} 个子任务</>;
  } else if (action.tool === 'extract_action_items' && !err) {
    const count = result?.created_count ?? result?.items?.length ?? 0;
    summary = <>✅ 已创建 {count} 个待办任务</>;
  } else if (action.tool === 'scan_risks' && !err) {
    const s = result?.summary as Record<string, number> | undefined;
    if (s) {
      summary = <>{s.overdue || 0} 个逾期 · {s.due_soon || 0} 个即将到期 · {s.unassigned || 0} 个无人认领</>;
    }
  } else if (action.tool === 'update_task' && !err) {
    const fields = result?.updated_fields as string[] | undefined;
    summary = fields?.length ? <>✅ 已更新: {fields.join('、')}</> : <>✅ 任务已更新</>;
  }

  return (
    <div className={`action-card${err ? ' error' : ''}`}>
      <div className="ac-head" onClick={() => setOpen(o => !o)}>
        <span className="ac-icon">{err ? '✗' : '✓'}</span>
        <span className="ac-label">{label}</span>
        {summary && <span className="ac-summary">{summary}</span>}
        <span className="ac-toggle">{open ? '▼' : '▸'}</span>
      </div>
      {open && (
        <div className="ac-body">
          {err && <div className="ac-error">{err}</div>}
          {!err && result && (
            <pre className="ac-json">{JSON.stringify(result, null, 2)}</pre>
          )}
          {links.length > 0 && (
            <div className="ac-links">
              {links.map(l => (
                <a key={l.href} href={l.href}
                  onClick={e => { e.preventDefault(); window.open(l.href, '_self'); }}
                  className="ac-link-btn">{l.label}</a>
              ))}
            </div>
          )}
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
