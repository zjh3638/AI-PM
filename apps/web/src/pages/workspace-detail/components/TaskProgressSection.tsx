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
    <div className="progress-panel">
      <div className="progress-card">
        <div className="progress-header">
          <span className="ph-label">进展反馈</span>
          <span className="ph-pct" style={{ color: barColor }}>{latestProgress}%</span>
        </div>

        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{
            width: `${latestProgress}%`,
            background: `linear-gradient(90deg, ${barColor}, ${barColor}88)`,
            boxShadow: `0 0 8px ${barColor}44`,
          }} />
        </div>
      </div>

      {!loading && items.length > 0 && (
        <div className="progress-log-list">
          {items.slice(0, 10).map((item: any, i: number) => (
            <div key={item.id} className="progress-log-item" style={{ opacity: i === 0 ? 1 : 0.7 }}>
              <div className="progress-log-icon" style={{
                background: i === 0 ? `${barColor}22` : 'var(--bg-surface)',
                border: `2px solid ${i === 0 ? barColor : 'var(--border-light)'}`,
                color: barColor,
              }}>
                {item.progress}
              </div>
              <div className="progress-log-body">
                {item.note && <div className="pl-note">{item.note}</div>}
                <div className="pl-meta">
                  {item.creator_name} · {item.created_at?.slice(0, 16).replace('T', ' ')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="progress-input-row">
        <div className="progress-input-group">
          <label className="progress-input-label">进度%</label>
          <input
            type="number" min={0} max={100}
            value={progress || ''}
            onChange={(e) => setProgress(Number(e.target.value))}
            placeholder="0"
            className="progress-input"
            style={{ textAlign: 'center' }}
          />
        </div>
        <div className="progress-input-group flex">
          <label className="progress-input-label">进展描述</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="做了什么..."
            className="progress-input"
          />
        </div>
        <button
          className="btn btn-primary btn-xs progress-submit-btn"
          onClick={handleSubmit}
          disabled={submitting || progress < 1 || progress > 100}
        >
          {submitting ? '...' : '反馈'}
        </button>
      </div>
    </div>
  );
}
