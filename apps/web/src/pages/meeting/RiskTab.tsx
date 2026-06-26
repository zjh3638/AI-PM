import { BoardData } from '../../api/meeting';

export default function RiskTab({ data }: { data: BoardData }) {
  if (data.risks.length === 0) {
    return <div className="ov-card"><div className="empty-row" style={{ padding: 40 }}>✓ 当前无风险项</div></div>;
  }
  return (
    <>
      {data.risks.map((r) => (
        <div key={r.id} className={`risk-item ${r.level.toLowerCase()}`}>
          <span className={`risk-level ${r.level.toLowerCase()}`}>{r.level}</span>
          <div className="risk-body">
            <div className="r-title">{r.title}</div>
            {r.description && <div className="r-desc">{r.description}</div>}
          </div>
          <div className="risk-meta">{r.owner_name || '-'}<br />{r.status === 'MITIGATING' ? '应对中' : r.status === 'IDENTIFIED' ? '已识别' : r.status}{r.milestone_name ? ` · ${r.milestone_name}` : ''}</div>
        </div>
      ))}
    </>
  );
}
