import { Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { ProjectGroupStats } from '../../../types';

export default function OverviewTab({ stats }: { stats: ProjectGroupStats[] }) {
  const navigate = useNavigate();
  if (stats.length === 0) return <div className="empty-state">暂无子项目，请到「设置」添加</div>;
  return (
    <div className="stream-grid">
      {stats.map((s) => (
        <div key={s.workspace_id} className="ws-card"
             onClick={() => navigate(`/workspaces/${s.workspace_id}`)}>
          <div className="ws-head">
            <span className="ws-name">{s.workspace_name}</span>
            <Tag color={s.completion >= 80 ? 'green' : s.completion >= 50 ? 'blue' : 'orange'}>
              {s.completion}%
            </Tag>
          </div>
          <div className="ws-stats">
            <span>任务 <span className="sv">{s.total}</span></span>
            <span>完成 <span className="sv">{s.done}</span></span>
            <span style={{ color: s.overdue > 0 ? 'var(--red-500)' : undefined }}>
              逾期 <span className="sv">{s.overdue}</span>
            </span>
          </div>
          <div className="health-bar" style={{ marginTop: 8 }}>
            <span className="fill good" style={{ width: `${s.completion}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
