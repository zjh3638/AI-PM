import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CastView, useAutoFullscreen, useClockStr } from '../workspace-detail/CastView';
import { useProjectGroupStore } from '../../stores/projectGroupStore';

/**
 * 项目群投屏：轮播项目群下的每个项目的投屏视图。
 * - 左上角项目名下拉：切换到指定项目
 * - 顶部右侧「下一个」按钮：切换到列表中的下一个项目（循环）
 */
export default function ProjectGroupCastPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { current, fetchDetail } = useProjectGroupStore();

  useAutoFullscreen();
  const clockStr = useClockStr();

  const [currentWsId, setCurrentWsId] = useState<string | null>(null);

  useEffect(() => {
    if (id) fetchDetail(id);
  }, [id]);

  const workspaces = useMemo(() => current?.workspaces || [], [current]);

  // 首次加载或列表变化时，默认选中第一个项目
  useEffect(() => {
    if (workspaces.length === 0) {
      setCurrentWsId(null);
      return;
    }
    setCurrentWsId((prev) => (prev && workspaces.find((w) => w.id === prev) ? prev : workspaces[0].id));
  }, [workspaces]);

  const exitCast = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    navigate(`/project-groups/${id}`);
  };

  const gotoNext = () => {
    if (workspaces.length === 0 || !currentWsId) return;
    const idx = workspaces.findIndex((w) => w.id === currentWsId);
    const nextIdx = (idx + 1) % workspaces.length;
    setCurrentWsId(workspaces[nextIdx].id);
  };

  if (!id) return null;

  if (workspaces.length === 0) {
    return (
      <div className="bs-page cast-page">
        <div className="bs-topbar">
          <div className="bs-logo">📊 {current?.name || '项目群'} · 投屏</div>
          <div className="bs-meta">该项目群下暂无关联项目</div>
          <div className="bs-actions">
            <span className="cast-clock">{clockStr}</span>
            <button className="btn btn-ghost btn-sm cast-exit-btn" onClick={exitCast}>⤫ 退出投屏</button>
          </div>
        </div>
        <div className="cast-empty" style={{ padding: 48, textAlign: 'center' }}>请先在项目群设置中添加项目。</div>
      </div>
    );
  }

  if (!currentWsId) return null;

  const titleSlot = (
    <span className="cast-group-title">
      <span className="cast-group-name">📊 {current?.name || '项目群'}</span>
      <span className="cast-group-sep">·</span>
      <select
        className="cast-group-select"
        value={currentWsId}
        onChange={(e) => setCurrentWsId(e.target.value)}
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>
    </span>
  );

  const actionsSlot = (
    <>
      <button
        className="btn btn-ghost btn-sm"
        onClick={gotoNext}
        disabled={workspaces.length <= 1}
        title="切换到下一个项目"
      >
        下一个 →
      </button>
      <span className="cast-clock">{clockStr}</span>
      <button className="btn btn-ghost btn-sm cast-exit-btn" onClick={exitCast}>⤫ 退出投屏</button>
    </>
  );

  return (
    <CastView
      key={currentWsId}
      workspaceId={currentWsId}
      titleSlot={titleSlot}
      actionsSlot={actionsSlot}
    />
  );
}
