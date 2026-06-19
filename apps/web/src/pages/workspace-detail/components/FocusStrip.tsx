import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkspaceStore } from '../../../stores/workspaceStore';

export default function FocusStrip() {
  const { id: wsId } = useParams<{ id: string }>();
  const { focusSignals, fetchFocusSignals } = useWorkspaceStore();

  useEffect(() => { if (wsId) fetchFocusSignals(wsId); }, [wsId]);

  if (focusSignals.length === 0) return null;

  return (
    <div className="focus-strip">
      {focusSignals.map((s, i) => (
        <div key={i} className="fs-item">
          <span className={`fs-dot ${s.level}`} />
          <span className="fs-text">{s.text}</span>
          <button className={`fs-btn${s.level === 'red' || s.type === 'upcoming' ? ' primary' : ''}`}>{s.action}</button>
        </div>
      ))}
    </div>
  );
}
