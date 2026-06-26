import { BoardData } from '../../api/meeting';

export default function OverviewTab({ data }: { data: BoardData }) {
  const pctColor = data.pct > 60 ? 'var(--blue-500)' : data.pct > 30 ? 'var(--amber-500)' : 'var(--red-500)';
  const barClass = data.pct > 60 ? 'info' : data.pct > 30 ? 'warn' : 'warn';

  return (
    <>
      <div className="ov-grid">
        <div className="ov-card">
          <div className="ov-label">整体完成率</div>
          <div className="ov-big" style={{ color: pctColor }}>{Math.round(data.pct)}%</div>
          <div className="ov-bar"><div className={`ov-bar-fill ${barClass}`} style={{ width: `${data.pct}%` }} /></div>
          <div className="ov-sub">{data.done}/{data.total_tasks} 任务已完成</div>
        </div>
        <div className="ov-card">
          <div className="ov-label">任务状态分布</div>
          <div className="ov-status-row">
            <div className="ov-status-item"><div className="c" style={{ color: '#64748b' }}>{data.total_tasks - data.done}</div><div className="l">待办/进行中</div></div>
            <div className="ov-status-item"><div className="c" style={{ color: 'var(--green-500)' }}>{data.done}</div><div className="l">已完成</div></div>
            <div className="ov-status-item"><div className="c" style={{ color: 'var(--red-500)' }}>{data.overdue}</div><div className="l">逾期</div></div>
          </div>
        </div>
      </div>
      <div className="ov-card">
        <div className="ov-label">最近7天完成的工作</div>
        {data.recent_completed.length === 0 ? (
          <div className="empty-row">暂无</div>
        ) : (
          <table className="task-table">
            <thead><tr><th>任务</th><th>完成人</th><th>时间</th></tr></thead>
            <tbody>
              {data.recent_completed.map((t, i) => (
                <tr key={i}>
                  <td>{t.title}</td><td className="t-who">{t.assignee_name || '-'}</td>
                  <td className="t-time">{t.completed_at ? new Date(t.completed_at).toLocaleDateString('zh-CN') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
