interface Props {
  workspaces: Array<{ id: string; name: string; health: string }>;
  currentId: string;
  onChange: (id: string) => void;
}

export default function ProjectSwitcher({ workspaces, currentId, onChange }: Props) {
  if (workspaces.length <= 1) return null;
  return (
    <div className="sw-bar">
      <span className="sw-label">切换项目</span>
      <div className="sw-tabs">
        {workspaces.map((ws) => (
          <button key={ws.id} className={`sw-tab${ws.id === currentId ? ' on' : ''}`} onClick={() => onChange(ws.id)}>
            <span className={`sw-dot ${ws.health === 'on-track' ? 'ok' : ws.health === 'at-risk' ? 'warn' : 'bad'}`} />
            {ws.name}
          </button>
        ))}
      </div>
    </div>
  );
}
