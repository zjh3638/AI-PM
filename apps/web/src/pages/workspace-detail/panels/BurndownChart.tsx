import { useEffect, useState } from 'react';
import { useIterationStore } from '../../../stores/iterationStore';

const ITER_STATUS: Record<string, { label: string; cls: string }> = {
  PLANNING: { label: '规划中', cls: 'badge' },
  ACTIVE: { label: '进行中', cls: 'badge-blue' },
  CLOSED: { label: '已关闭', cls: 'badge-green' },
};

export { ITER_STATUS };

export default function BurndownChart({ wsId }: { wsId: string }) {
  const { iterations, fetchList, burndown, fetchBurndown } = useIterationStore();
  const [iterId, setIterId] = useState<string>('');

  useEffect(() => { fetchList(wsId); }, [wsId]);

  useEffect(() => {
    if (iterId) fetchBurndown(wsId, iterId);
  }, [iterId, wsId]);

  const data: { date: string; remaining: number; ideal: number }[] = burndown || [];
  const w = 560, h = 200, pad = { top: 12, right: 16, bottom: 28, left: 40 };
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;

  const maxVal = Math.max(...data.map(d => Math.max(d.remaining, d.ideal)), 1);
  const yTick = (v: number) => pad.top + ph * (1 - v / maxVal);
  const xTick = (i: number) => pad.left + (data.length > 1 ? (i / (data.length - 1)) * pw : pw / 2);

  const linePath = (field: 'remaining' | 'ideal') =>
    data.length > 0
      ? data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xTick(i)},${yTick(d[field])}`).join(' ')
      : '';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4>迭代燃尽图</h4>
        <select
          style={{ padding: '4px 8px', fontSize: '0.74rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
          value={iterId}
          onChange={(e) => setIterId(e.target.value)}
        >
          <option value="">选择迭代...</option>
          {iterations.filter((it) => it.status === 'ACTIVE' || it.status === 'PLANNING').map((it) => (
            <option key={it.id} value={it.id}>{it.name} ({it.status === 'ACTIVE' ? '进行中' : '计划中'})</option>
          ))}
        </select>
      </div>
      {data.length === 0 ? (
        <div className="report-chart" style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{iterId ? '暂无燃尽数据' : '请选择一个迭代'}</span>
        </div>
      ) : (
        <svg width={w} height={h} style={{ display: 'block', margin: '0 auto' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
            <g key={pct}>
              <line x1={pad.left} x2={w - pad.right} y1={yTick(maxVal * pct)} y2={yTick(maxVal * pct)} stroke="var(--border-light)" strokeWidth={0.5} />
              <text x={pad.left - 6} y={yTick(maxVal * pct) + 3} textAnchor="end" fontSize={8} fill="var(--text-muted)">{Math.round(maxVal * pct)}</text>
            </g>
          ))}
          <path d={linePath('ideal')} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4,3" />
          <path d={linePath('remaining')} fill="none" stroke="var(--blue-500)" strokeWidth={2} />
          {data.map((d, i) => (
            <g key={i}>
              <circle cx={xTick(i)} cy={yTick(d.remaining)} r={3} fill="var(--blue-500)" />
              <text x={xTick(i)} y={h - 4} textAnchor="middle" fontSize={7} fill="var(--text-muted)">
                {d.date.slice(5)}
              </text>
            </g>
          ))}
          <rect x={w - 180} y={pad.top} width={8} height={8} fill="var(--blue-500)" rx={2} />
          <text x={w - 168} y={pad.top + 7} fontSize={8} fill="var(--text-secondary)">实际剩余</text>
          <rect x={w - 100} y={pad.top} width={8} height={8} fill="none" stroke="var(--text-muted)" strokeWidth={1} rx={2} />
          <text x={w - 88} y={pad.top + 7} fontSize={8} fill="var(--text-secondary)">理想线</text>
        </svg>
      )}
    </div>
  );
}
