import { useParams, useNavigate } from 'react-router-dom';
import { CastView, useAutoFullscreen, useClockStr } from './CastView';
import { useWorkspaceStore } from '../../stores/workspaceStore';

export default function WorkspaceCastPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { current } = useWorkspaceStore();

  useAutoFullscreen();
  const clockStr = useClockStr();

  const exitCast = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    navigate(`/workspaces/${id}`);
  };

  if (!id) return null;

  return (
    <CastView
      workspaceId={id}
      titleSlot={<>📊 {current?.name || '工作空间'} · 投屏</>}
      actionsSlot={
        <>
          <span className="cast-clock">{clockStr}</span>
          <button className="btn btn-ghost btn-sm cast-exit-btn" onClick={exitCast}>⤫ 退出投屏</button>
        </>
      }
    />
  );
}
