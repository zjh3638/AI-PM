import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import { useAuthStore } from '../../../stores/authStore';
import api from '../../../api/client';
import { streamChat } from '../../../api/aiStream';
import { applyFrame } from '../../../components/Layout/aiReducer';
import { useRouteContext } from '../../../components/Layout/useRouteContext';
import type { ChatMsg, ToolCallTrace } from '../../../components/Layout/aiTypes';

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
  create_milestone: '创建里程碑',
  update_milestone: '更新里程碑',
  create_iteration: '创建迭代',
  update_iteration: '更新迭代',
  batch_update_tasks: '批量更新任务',
};

export default function AiChatPanel() {
  const { user } = useAuthStore();
  const routeCtx = useRouteContext();
  const [collapsed, setCollapsed] = useState(false);
  const [agent, setAgent] = useState(AGENTS[0]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsConfig, setNeedsConfig] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [convTitle, setConvTitle] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // slash-command palette
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  // multi-conversation switcher
  const [convList, setConvList] = useState<{conversation_id:string;conversation_title:string}[]>([]);
  const [convOpen, setConvOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  // 粘贴的图片（base64 data URL，已降采样），最多 3 张
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const slashMatches = SLASH_COMMANDS.filter(
    c => c.trigger.startsWith(input) || c.label.includes(input.slice(1)),
  );

  const ws = routeCtx.workspace_id;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const params = ws ? { workspace_id: ws } : {};
        const [cfg, hist, convs] = await Promise.all([
          api.get('/ai/me/llm-config'),
          api.get('/ai/chat-history', { params }),
          api.get('/ai/chat-conversations', { params }),
        ]);
        if (cancelled) return;
        setNeedsConfig(!cfg.data.has_api_key);
        setConvList(convs.data?.conversations || []);
        const d = hist.data;
        if (d?.conversation_id) {
          setConversationId(d.conversation_id);
          setConvTitle(d.conversation_title || undefined);
          setMessages(historyToMsgs(d.messages));
        } else {
          setConversationId(undefined);
          setConvTitle(undefined);
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
  }, [user, ws]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  // close conv dropdown on outside click
  useEffect(() => {
    if (!convOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.conv-switcher')) setConvOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [convOpen]);

  const closeSlash = () => { setSlashOpen(false); setSlashIdx(0); };

  // 自动增高 textarea
  const adjustTextareaHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 150; // 最大高度 150px
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // 记录最近一次发送的参数，供断线重连使用
  const lastSendRef = useRef<{ msg: string; editAfterId?: string } | null>(null);
  const [lost, setLost] = useState(false);

  const sendMessage = useCallback(async (
    text?: string,
    opts?: { editAfterId?: string; images?: string[] },
  ) => {
    const msg = text ?? input.trim();
    // 允许仅图片（无文字）发送
    const imgs = opts?.images ?? pendingImages;
    if ((!msg && imgs.length === 0) || loading) return;
    closeSlash();
    setLost(false);
    lastSendRef.current = { msg, editAfterId: opts?.editAfterId };

    const userText = msg || (imgs.length ? `[图片 ×${imgs.length}]` : '');
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', text: userText };
    const aiPlaceholder: ChatMsg = {
      id: `tmp-${Date.now()}`, role: 'assistant', status: 'streaming',
      text: '', toolCalls: [], agent,
    };
    setMessages(m => [...m, userMsg, aiPlaceholder]);
    setInput('');
    setPendingImages([]);
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamChat(
        { message: msg, agent, conversation_id: conversationId,
          workspace_id: routeCtx.workspace_id, route_context: routeCtx,
          ...(opts?.editAfterId ? { edit: { after_id: opts.editAfterId } } : {}),
          ...(imgs.length ? { images: imgs } : {}) },
        {
          onFrame: (f) => setMessages(prev => {
            let next = applyFrame(prev, f);
            if (f.event === 'done') {
              setConversationId(f.data.conversation_id);
              // 用真实 DB id 回填本轮用户消息，使后续编辑/重试锚点有效
              const uid = f.data.user_message_id;
              if (uid) {
                // 倒数第二条即本轮用户消息（最后一条为 assistant）
                next = next.map((m, i) =>
                  i === next.length - 2 && m.role === 'user' ? { ...m, id: uid } : m);
              }
            }
            return next;
          }),
          onLost: () => setLost(true),
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
  }, [input, loading, agent, conversationId, routeCtx, pendingImages]);

  // 断线重连：重新拉取历史，再基于最近一次发送参数重发
  const reconnect = useCallback(async () => {
    if (!lastSendRef.current) { setLost(false); return; }
    const { msg, editAfterId } = lastSendRef.current;
    setLost(false);
    // 丢弃本地未完成的流式占位消息，避免重复渲染
    setMessages(prev => prev.filter(m => !(m.role === 'assistant' && m.status === 'streaming')));
    await sendMessage(msg, editAfterId ? { editAfterId } : undefined);
  }, [sendMessage]);

  // 编辑用户消息：把该条及其后的消息删除并以新文本重发
  const editMessage = useCallback((msgId: string, newText: string) => {
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx === -1) return;
    setMessages(prev => prev.slice(0, idx));
    sendMessage(newText, { editAfterId: msgId });
  }, [messages, sendMessage]);

  // 重试：找到该 AI 消息之前的用户消息，删除从该用户消息起的内容并重发
  const retryMessage = useCallback((aiMsgId: string) => {
    const idx = messages.findIndex(m => m.id === aiMsgId);
    if (idx <= 0) return;
    let uIdx = idx - 1;
    while (uIdx >= 0 && messages[uIdx].role !== 'user') uIdx--;
    if (uIdx < 0) return;
    const userMsg = messages[uIdx];
    setMessages(prev => prev.slice(0, uIdx));
    sendMessage(userMsg.text || '', { editAfterId: userMsg.id });
  }, [messages, sendMessage]);

  const handleInputChange = (val: string) => {
    setInput(val);
    if (val.startsWith('/')) {
      setSlashOpen(true);
      setSlashIdx(0);
    } else {
      setSlashOpen(false);
    }
  };

  // 把图片文件降采样至 ≤1024px 并转成 base64 data URL（JPEG，质量 0.85）
  const downscaleImage = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const scale = MAX / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas 不可用')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItems = items.filter(it => it.type.startsWith('image/'));
    if (imgItems.length === 0) return;
    e.preventDefault();
    for (const it of imgItems) {
      if (pendingImages.length >= 3) break;
      const file = it.getAsFile();
      if (!file) continue;
      try {
        const dataUrl = await downscaleImage(file);
        setPendingImages(prev => prev.length < 3 ? [...prev, dataUrl] : prev);
      } catch { /* 跳过无法处理的图片 */ }
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    // Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const pickSlash = (cmd: typeof SLASH_COMMANDS[number]) => {
    setInput(cmd.msg);
    closeSlash();
    inputRef.current?.focus();
  };

  const stopGeneration = () => abortRef.current?.abort();

  const switchConversation = async (convId: string) => {
    if (convId === conversationId) { setConvOpen(false); return; }
    abortRef.current?.abort();
    setConvOpen(false);
    setLoading(true);
    setLost(false);
    lastSendRef.current = null;
    setMessages([]);
    try {
      const params = { conversation_id: convId,
        ...(routeCtx.workspace_id ? { workspace_id: routeCtx.workspace_id } : {}) };
      const hist = await api.get('/ai/chat-history', { params });
      const d = hist.data;
      setConversationId(d.conversation_id);
      setConvTitle(d.conversation_title || undefined);
      setMessages(d.messages ? historyToMsgs(d.messages) : []);
    } catch {
      // fallback: stay on current id
    }
    setLoading(false);
  };

  const newConversation = () => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(undefined);
    setConvTitle(undefined);
    setLost(false);
    lastSendRef.current = null;
  };

  const refreshConvList = useCallback(async () => {
    try {
      const params = ws ? { workspace_id: ws } : {};
      const convs = await api.get('/ai/chat-conversations', { params });
      setConvList(convs.data?.conversations || []);
    } catch { /* ignore */ }
  }, [ws]);

  const renameConversation = async (convId: string, title: string) => {
    const t = title.trim();
    if (!t) return;
    try {
      await api.patch(`/ai/conversations/${convId}`, { title: t });
      if (convId === conversationId) setConvTitle(t);
      await refreshConvList();
    } catch { /* ignore */ }
    setRenamingId(null);
  };

  const deleteConversation = async (convId: string) => {
    if (!window.confirm('确定删除这个对话？此操作不可恢复。')) return;
    try {
      await api.delete(`/ai/conversations/${convId}`);
      if (convId === conversationId) newConversation();
      await refreshConvList();
    } catch { /* ignore */ }
  };

  if (collapsed) {
    return (
      <div className="ai-panel collapsed">
        <button className="ai-panel-expand" onClick={() => setCollapsed(false)} title="展开 AI 助手">
          <span className="ai-panel-expand-icon">🤖</span>
          <span className="ai-panel-expand-text">AI 助手</span>
        </button>
      </div>
    );
  }

  return (
    <div className="ai-panel">
      <div className="ai-panel-head">
        <div className="ai-panel-head-left">
          <h3>AI 助手</h3>
          {convTitle && conversationId && (
            <div className="conv-switcher">
              <button className="conv-switch-btn" onClick={() => setConvOpen(o => !o)} title="切换对话">
                <span className="conv-title-text">{convTitle}</span>
                <span className="conv-arrow">{convOpen ? '▴' : '▾'}</span>
              </button>
              {convOpen && (
                <div className="conv-dropdown">
                  {convList.map(c => (
                    renamingId === c.conversation_id ? (
                      <div key={c.conversation_id} className="conv-item renaming"
                        onClick={e => e.stopPropagation()}>
                        <input className="conv-rename-input" value={renameDraft} autoFocus
                          onChange={e => setRenameDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') renameConversation(c.conversation_id, renameDraft);
                            else if (e.key === 'Escape') setRenamingId(null);
                          }}
                          onBlur={() => setRenamingId(null)} />
                      </div>
                    ) : (
                      <div key={c.conversation_id}
                        className={`conv-item${c.conversation_id === conversationId ? ' active' : ''}`}
                        onClick={() => switchConversation(c.conversation_id)}>
                        <span className="conv-item-title">{c.conversation_title}</span>
                        {c.conversation_id === conversationId && <span className="conv-check">✓</span>}
                        <span className="conv-item-actions" onClick={e => e.stopPropagation()}>
                          <button className="conv-act" title="重命名"
                            onClick={() => { setRenameDraft(c.conversation_title); setRenamingId(c.conversation_id); }}>✎</button>
                          <button className="conv-act" title="删除"
                            onClick={() => deleteConversation(c.conversation_id)}>🗑</button>
                        </span>
                      </div>
                    )
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="ai-panel-head-right">
          <button className="drawer-newchat" onClick={newConversation} title="新对话">＋</button>
          <select className="drawer-agent-select" value={agent} onChange={e => setAgent(e.target.value)}>
            {AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="ai-panel-collapse" onClick={() => setCollapsed(true)} title="折叠">⟩</button>
        </div>
      </div>
      <div className="ai-panel-body">
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
            <div className="cw-desc">
              我是你的 <strong>{agent}</strong> 助手，可以帮你处理项目管理中的各种任务。
            </div>
            <div className="chat-cmds">
              {SUGGESTIONS.map(s => (
                <button key={s} className="chat-cmd" onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="cw-hint">
              💡 提示：输入 <code>/</code> 查看快捷指令
            </div>
          </div>
        )}
        <div className="chat-msgs">
          {messages.map((m, i) => (
            <MessageView key={m.id} msg={m} userName={user?.display_name || '你'}
              canEdit={m.role === 'user' && !loading && i === messages.length - 2 && m.id.indexOf('u-') !== 0}
              canRetry={m.role === 'assistant' && m.status !== 'streaming' && !loading && i === messages.length - 1}
              onEdit={(text) => editMessage(m.id, text)}
              onRetry={() => retryMessage(m.id)} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
      {lost && (
        <div className="chat-reconnect">
          <span>连接中断</span>
          <button className="chat-reconnect-btn" onClick={reconnect}>重新连接</button>
        </div>
      )}
      {pendingImages.length > 0 && (
        <div className="pending-images">
          {pendingImages.map((src, i) => (
            <div key={i} className="pending-img">
              <img src={src} alt={`粘贴图片 ${i + 1}`} />
              <button className="pending-img-remove"
                onClick={() => setPendingImages(prev => prev.filter((_, idx) => idx !== i))}>×</button>
            </div>
          ))}
        </div>
      )}
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
        <textarea ref={inputRef}
          placeholder={needsConfig ? '请先配置 AI Key...' : '输入指令，可粘贴图片，输入 / 查看快捷指令…(Shift+Enter 换行)'}
          value={input} onChange={e => handleInputChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onPaste={handlePaste}
          disabled={loading || needsConfig}
          rows={1} />
        {loading
          ? <button className="send-btn stop" onClick={stopGeneration}>■</button>
          : <button className="send-btn" onClick={() => sendMessage()} disabled={needsConfig}>↑</button>}
      </div>
    </div>
  );
}

function MessageView({ msg, userName, canEdit, canRetry, onEdit, onRetry }: {
  msg: ChatMsg; userName: string;
  canEdit?: boolean; canRetry?: boolean;
  onEdit?: (text: string) => void; onRetry?: () => void;
}) {
  const routeCtx = useRouteContext();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (msg.role === 'user') {
    if (editing) {
      return (
        <div className="chat-msg user editing">
          <div className="msg-label">{userName}</div>
          <textarea className="msg-edit-input" value={draft} autoFocus
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim()) { onEdit?.(draft.trim()); setEditing(false); }
              } else if (e.key === 'Escape') { setEditing(false); }
            }} />
          <div className="msg-edit-actions">
            <button className="msg-chip" onClick={() => { if (draft.trim()) { onEdit?.(draft.trim()); setEditing(false); } }}>发送</button>
            <button className="msg-chip ghost" onClick={() => setEditing(false)}>取消</button>
          </div>
        </div>
      );
    }
    return (
      <div className="chat-msg user">
        <div className="msg-label">{userName}</div>
        <div className="msg-text-plain">{msg.text}</div>
        {canEdit && (
          <div className="msg-chips">
            <button className="msg-chip" onClick={() => { setDraft(msg.text); setEditing(true); }}>编辑</button>
          </div>
        )}
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
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
            components={{ pre: CodeBlock }}>
            {msg.text}
          </ReactMarkdown>
          {!isStreaming && (
            <div className="msg-chips">
              <CopyChip text={msg.text} label="复制回复" />
            </div>
          )}
        </div>
      )}
      {msg.actions && msg.actions.length > 0 && (
        <div className="action-cards">
          {msg.actions.map((a, i) => <ActionCard key={`${a.tool}-${i}`} action={a} routeCtx={routeCtx} />)}
        </div>
      )}
      {msg.error && <div className="msg-error">⚠ {msg.error}</div>}
      {canRetry && (
        <div className="msg-chips">
          <button className="msg-chip" onClick={() => onRetry?.()}>重新生成</button>
        </div>
      )}
    </div>
  );
}

function CopyChip({ text, label = '复制' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard 不可用时忽略 */ }
  };
  return (
    <button className="msg-chip" onClick={copy}>{copied ? '已复制 ✓' : label}</button>
  );
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const code = ref.current?.textContent || '';
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <div className="code-block-wrapper">
      <button className="code-copy-btn" onClick={copy}>{copied ? '已复制' : '复制'}</button>
      <pre ref={ref}>{children}</pre>
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
  } else if (action.tool === 'create_milestone' && !err) {
    summary = <>✅ 已创建里程碑：<strong>{result?.name as string || ''}</strong></>;
  } else if (action.tool === 'create_iteration' && !err) {
    summary = <>✅ 已创建迭代：<strong>{result?.name as string || ''}</strong></>;
  } else if ((action.tool === 'update_milestone' || action.tool === 'update_iteration') && !err) {
    const fields = result?.updated_fields as string[] | undefined;
    summary = fields?.length ? <>✅ 已更新: {fields.join('、')}</> : <>✅ 已更新</>;
  } else if (action.tool === 'batch_update_tasks' && !err) {
    const n = result?.updated_count ?? 0;
    const fields = result?.updated_fields as string[] | undefined;
    summary = <>✅ 已批量更新 {n} 个任务{fields?.length ? <>（{fields.join('、')}）</> : null}</>;
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
  }
  return out;
}

function parseJsonSafe(s: string | undefined): Record<string, unknown> {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}
