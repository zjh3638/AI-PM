import { useState, useRef, useEffect } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';

export default function NotesPanel({ meetingId }: { meetingId: string }) {
  const { meeting, addNote } = useMeetingStore();
  const [input, setInput] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const notes = meeting?.notes || [];

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [notes.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await addNote(meetingId, '会议记录', text);
  };

  return (
    <div className="notes">
      <div className="notes-header"><span>📝</span><span className="nh-title">会议记录</span><span className="nh-count">{notes.length}条</span></div>
      <div className="notes-body" ref={bodyRef}>
        {notes.length === 0 && <div className="notes-empty">开始记录会议内容...</div>}
        {notes.map((n: any, i: number) => (
          <div key={i} className={`note-item${n.type === 'decision' ? ' system' : ''}`}>
            <div className="ni-avatar">{n.who?.[0] || '记'}</div>
            <div className="ni-body">
              <div className="ni-who">{n.who}</div>
              <div className="ni-text">{n.text}</div>
              <div className="ni-time">{n.time ? new Date(n.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="notes-footer">
        <div className="quick-input">
          <input placeholder="快速记录..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSend(); }} />
          <button onClick={handleSend}>↑</button>
        </div>
      </div>
    </div>
  );
}
