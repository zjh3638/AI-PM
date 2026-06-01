import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

const AGENTS = ['需求分析师', '设计师', '开发工程师', '项目经理'];

const COMMANDS = [
  { cmd: 'create', label: '创建任务', slash: '/创建任务' },
  { cmd: 'status', label: '查询进度', slash: '/查询进度' },
  { cmd: 'find', label: '查找文档', slash: '/查找文档' },
  { cmd: 'report', label: '生成周报', slash: '/生成周报' },
  { cmd: 'risk', label: '风险分析', slash: '/风险分析' },
];

type Message = { role: 'user' | 'ai'; text: string; agent?: string };

const AI_RESPONSES: Record<string, string> = {
  create:
    '已创建任务「<strong>优化报表加载性能</strong>」<br><br>📋 详情：Story · 高优先级 · 指派给王五<br>📎 关联里程碑：M2 · 核心开发<br>🔗 位置：Q3 改版 → 待办列<br><br>任务已就绪。',
  status:
    '<strong>Q3 改版 · Sprint 5 进度总览</strong><br><br>📊 整体完成：<strong>24/36</strong>（67%）<br>📅 剩余 14 天<br><br>▸ M1 需求与设计：<span style="color:var(--green-600)">✓ 100%</span><br>▸ M2 核心开发：<span style="color:var(--blue-600)">◎ 60%</span><br>▸ M3 UI Review：<span style="color:var(--amber-600)">⚠ 40%</span><br>▸ M4 测试与修复：<span style="color:var(--text-muted)">○ 0%</span>',
  find:
    '在知识库中检索...<br><br>📄 <strong>找到 3 篇相关文档：</strong><br><br>1. 📄 <strong>数据安全规范 v2.3</strong>（PRD 目录）<br>2. 📊 <strong>数据导出功能需求分析</strong>（AI 草稿）<br>3. 📋 <strong>API 安全设计规范</strong>（技术方案）',
  report:
    '正在生成本周周报...<br><br><strong>本周周报草案：</strong><br><br>📋 <strong>本周完成：</strong><br>• 用户登录优化（王五）<br>• 消息推送模块（张三）<br>• 3 个后端 PR 已由 AI Agent 完成<br><br>⚠ <strong>风险与阻塞：</strong><br>• 前端首页重构延期 3 天<br><br>📅 <strong>下周计划：</strong><br>• UI Review 里程碑推进',
  risk:
    '🔍 已完成全项目风险扫描...<br><br><strong>风险报告（共 3 项）：</strong><br><br>🔴 <strong>高风险：前端首页重构延期</strong><br>影响 M3 UI Review 里程碑<br><br>🟡 <strong>中风险：李四负载 120%</strong><br>12 个活跃任务<br><br>🟡 <strong>中风险：运营中台状态停滞</strong><br>「用户模块重构」5 天无更新',
};

export default function AiDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuthStore();
  const [agent, setAgent] = useState(AGENTS[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');

  const sendCommand = (cmd: string) => {
    const userMsg: Message = { role: 'user', text: COMMANDS.find((c) => c.cmd === cmd)?.slash + ' ...' };
    setMessages((m) => [...m, userMsg]);

    const typingMsg: Message = { role: 'ai', text: '<em>处理中...</em>', agent };
    setMessages((m) => [...m, typingMsg]);

    setTimeout(() => {
      setMessages((m) => {
        const updated = [...m];
        updated[updated.length - 1] = { role: 'ai', text: AI_RESPONSES[cmd] || '收到。', agent };
        return updated;
      });
    }, 1200);
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    const msg: Message = { role: 'user', text: input };
    setMessages((m) => [...m, msg]);
    setInput('');

    const typingMsg: Message = { role: 'ai', text: '<em>处理中...</em>', agent };
    setMessages((m) => [...m, typingMsg]);

    setTimeout(() => {
      setMessages((m) => {
        const updated = [...m];
        updated[updated.length - 1] = {
          role: 'ai',
          text: '收到你的消息。我作为 <strong>' + agent + '</strong> 正在处理中，请稍候。',
          agent,
        };
        return updated;
      });
    }, 1200);
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
                fontSize: '0.7rem',
                padding: '3px 8px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface)',
              }}
            >
              {AGENTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <button className="drawer-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="drawer-body">
          {messages.length === 0 && (
            <div className="chat-cmds">
              {COMMANDS.map((c) => (
                <button key={c.cmd} className="chat-cmd" onClick={() => sendCommand(c.cmd)}>
                  <span className="cmd-slash">{c.slash}</span>
                </button>
              ))}
            </div>
          )}

          <div className="chat-msgs">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {m.role === 'ai' && m.agent && <div className="msg-label">{m.agent}</div>}
                {m.role === 'user' && <div className="msg-label">你</div>}
                <div dangerouslySetInnerHTML={{ __html: m.text }} />
              </div>
            ))}
          </div>
        </div>

        <div className="chat-input-area">
          <input
            type="text"
            placeholder="@知识库 输入指令或问题..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          />
          <button className="send-btn" onClick={sendMessage}>
            ↑
          </button>
        </div>
      </div>
    </>
  );
}
