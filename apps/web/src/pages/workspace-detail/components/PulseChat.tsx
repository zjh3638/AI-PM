import { useState } from 'react';

export default function PulseChat() {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [input, setInput] = useState('');

  const send = () => {
    if (!input.trim()) return;
    setMessages((m) => [...m, { role: 'user', text: input }]);
    setInput('');
    setTimeout(() => {
      setMessages((m) => [...m, { role: 'ai', text: '收到。作为 AI 助手，我会根据项目规范处理你的请求。' }]);
    }, 800);
  };

  const commands = ['/创建任务', '/查询进度', '/查找文档', '/生成周报', '/风险分析'];

  return (
    <div className={`pulse-chat${expanded ? ' expanded' : ''}`}>
      <button className="chat-toggle-tab" onClick={() => setExpanded(!expanded)}>
        AI 对话
      </button>
      <div className="chat-inner">
        <div className="chat-head">
          <h3>AI 对话</h3>
          <button className="chat-close-btn" onClick={() => setExpanded(false)}>✕</button>
        </div>
        <div className="chat-body">
          {messages.length === 0 && (
            <div className="chat-cmds">
              {commands.map((c) => (
                <button key={c} className="chat-cmd" onClick={() => { setMessages([{ role: 'user', text: c }]); setTimeout(() => setMessages((m) => [...m, { role: 'ai', text: '正在处理...' }]), 800); }}>
                  <span className="cmd-slash">{c}</span>
                </button>
              ))}
            </div>
          )}
          <div className="chat-msgs">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {m.text}
              </div>
            ))}
          </div>
        </div>
        <div className="chat-input-area">
          <input
            type="text"
            placeholder="@知识库 输入指令..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="send-btn" onClick={send}>↑</button>
        </div>
      </div>
    </div>
  );
}
