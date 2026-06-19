import { useEffect, useCallback, useState } from 'react';
import api from '../../../api/client';

export default function TaskProgressSection({ taskId, workspaceId }: { taskId: string; workspaceId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get(`/tasks/${taskId}/progress`);
      setItems(res.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [taskId]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  const handleSubmit = async () => {
    if (progress < 0 || progress > 100) return;
    setSubmitting(true);
    try {
      await api.post(`/tasks/${taskId}/progress`, { progress, note: note.trim() || null });
      setProgress(0);
      setNote('');
      fetchProgress();
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  const latestProgress = items[0]?.progress ?? 0;
  const barColor = latestProgress >= 90 ? 'var(--green-500)' : latestProgress >= 50 ? 'var(--blue-500)' : latestProgress >= 20 ? 'var(--amber-500)' : 'var(--gray-400)';

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-md)',
        padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)' }}>进展反馈</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: barColor }}>{latestProgress}%</span>
        </div>

        <div style={{
          height: 6, borderRadius: 3, background: 'var(--bg-surface)',
          overflow: 'hidden', position: 'relative',
        }}>
          <div style={{
            height: '100%', width: `${latestProgress}%`,
            background: `linear-gradient(90deg, ${barColor}, ${barColor}88)`,
            borderRadius: 3,
            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: `0 0 8px ${barColor}44`,
          }} />
        </div>
      </div>

      {!loading && items.length > 0 && (
        <div style={{ marginTop: 10, maxHeight: 160, overflowY: 'auto' }}>
          {items.slice(0, 10).map((item: any, i: number) => (
            <div key={item.id} style={{
              display: 'flex', gap: 10, padding: '6px 0',
              borderBottom: i < items.length - 1 ? '1px solid var(--border-light)' : 'none',
              opacity: i === 0 ? 1 : 0.7,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: i === 0 ? `${barColor}22` : 'var(--bg-surface)',
                border: `2px solid ${i === 0 ? barColor : 'var(--border-light)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.65rem', fontWeight: 700, color: barColor,
                flexShrink: 0,
              }}>
                {item.progress}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {item.note && <div style={{ fontSize: '0.72rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>{item.note}</div>}
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {item.creator_name} · {item.created_at?.slice(0, 16).replace('T', ' ')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
        <div style={{ width: 64, flexShrink: 0 }}>
          <label style={{ fontSize: '0.6rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>进度%</label>
          <input
            type="number" min={0} max={100}
            value={progress || ''}
            onChange={(e) => setProgress(Number(e.target.value))}
            placeholder="0"
            style={{
              width: '100%', padding: '5px 6px', fontSize: '0.72rem',
              borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg-surface)', color: 'var(--text-primary)',
              textAlign: 'center', outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '0.6rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>进展描述</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="做了什么..."
            style={{
              width: '100%', padding: '5px 8px', fontSize: '0.72rem',
              borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg-surface)', color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>
        <button
          className="btn btn-primary btn-xs"
          onClick={handleSubmit}
          disabled={submitting || progress < 1 || progress > 100}
          style={{ flexShrink: 0, padding: '5px 12px', fontSize: '0.7rem', borderRadius: 6 }}
        >
          {submitting ? '...' : '反馈'}
        </button>
      </div>
    </div>
  );
}
