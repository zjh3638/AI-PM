import { TimelineRisk } from '../../api/meeting';

const LEVEL_META: Record<string, { cls: string; label: string }> = {
  HIGH: { cls: 'high', label: '高' },
  MEDIUM: { cls: 'mid', label: '中' },
  LOW: { cls: 'mid', label: '低' },
};

/** Risk list: sorted by severity, each linked to milestone + owner + mitigation. */
export default function RiskListPanel({ risks }: { risks: TimelineRisk[] }) {
  if (risks.length === 0) {
    return <div className="empty-row" style={{ padding: 24 }}>✓ 当前无风险项</div>;
  }
  return (
    <>
      {risks.map((r) => {
        const meta = LEVEL_META[r.level] || LEVEL_META.MEDIUM;
        return (
          <div className="bs-risk-row" key={r.id}>
            <div className={`bs-risk-sev ${meta.cls}`} />
            <div className="bs-risk-body">
              <div className="rt">{r.title}</div>
              <div className="rmeta">
                {r.workspace_name && <span>项目：{r.workspace_name}</span>}
                {r.milestone_name && <span>里程碑：{r.milestone_name}</span>}
                <span>责任人：{r.owner_name || '-'}</span>
              </div>
              {r.mitigation && <div className="ract">→ 建议：{r.mitigation}</div>}
            </div>
            <span className={`bs-risk-tag ${meta.cls}`}>{meta.label}</span>
          </div>
        );
      })}
    </>
  );
}
