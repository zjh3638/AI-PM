interface Ws {
  id: string;
  name: string;
  health: string;
  department_name?: string | null;
}

interface Props {
  workspaces: Ws[];
  currentId: string;
  onChange: (id: string) => void;
}

const dotClass = (health: string) =>
  health === 'on-track' ? 'ok' : health === 'at-risk' ? 'warn' : 'bad';

export default function ProjectSwitcher({ workspaces, currentId, onChange }: Props) {
  if (workspaces.length <= 1) return null;

  // group by department name (owner's department); undefined → 未分组
  const groups = new Map<string, Ws[]>();
  for (const ws of workspaces) {
    const key = ws.department_name || '未分组';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ws);
  }
  const hasGroups = groups.size > 1 || !groups.has('未分组');

  if (!hasGroups) {
    // flat fallback (no department info)
    return (
      <div className="sw-bar">
        <span className="sw-label">切换项目</span>
        <div className="sw-tabs">
          {workspaces.map(ws => (
            <button key={ws.id} className={`sw-tab${ws.id === currentId ? ' on' : ''}`} onClick={() => onChange(ws.id)}>
              <span className={`sw-dot ${dotClass(ws.health)}`} />{ws.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="sw-bar sw-bar-grouped">
      <span className="sw-label">切换项目</span>
      <div className="sw-groups">
        {[...groups.entries()].map(([dept, list]) => (
          <div className="sw-group" key={dept}>
            <span className="sw-group-title">{dept}</span>
            <div className="sw-tabs">
              {list.map(ws => (
                <button key={ws.id} className={`sw-tab${ws.id === currentId ? ' on' : ''}`} onClick={() => onChange(ws.id)}>
                  <span className={`sw-dot ${dotClass(ws.health)}`} />{ws.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
