import { TimelineKeyPerson } from '../../api/meeting';

const FLAG_LABEL: Record<string, string> = { ok: '正常', warn: '偏高', block: '延期/阻塞' };

/** Key-person progress lanes: progress bar + load + status flag. */
export default function KeyPersonLane({ persons }: { persons: TimelineKeyPerson[] }) {
  if (persons.length === 0) {
    return <div className="empty-row" style={{ padding: 24 }}>暂无关键人数据</div>;
  }
  return (
    <>
      {persons.map((p) => {
        const barColor = p.flag === 'block' ? '#ef4444' : p.flag === 'warn' ? '#fbbf24' : '#60a5fa';
        const loadColor = p.load >= 5 ? '#f87171' : p.load >= 3 ? '#fbbf24' : '#34d399';
        return (
          <div className="bs-person-row" key={p.user_id}>
            <div className="bs-person-av" style={{ background: barColor }}>{p.name.slice(0, 2)}</div>
            <div className="bs-person-info">
              <div className="nm">{p.name}</div>
              <div className="rl">{p.role || '—'}</div>
            </div>
            <div className="bs-person-bar">
              <div className="pf" style={{ width: `${p.pct}%`, background: barColor }} />
            </div>
            <div className="bs-person-pct">{Math.round(p.pct)}%</div>
            <div className="bs-person-load" style={{ color: loadColor }}>负载 {p.load}</div>
            <span className={`bs-person-flag ${p.flag}`}>
              {p.overdue_tasks > 0 ? `延期${p.overdue_tasks}` : FLAG_LABEL[p.flag]}
            </span>
          </div>
        );
      })}
    </>
  );
}
