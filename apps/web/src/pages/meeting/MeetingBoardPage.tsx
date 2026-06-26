import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMeetingStore } from '../../stores/meetingStore';
import api from '../../api/client';
import ProjectSwitcher from './ProjectSwitcher';
import OverviewTab from './OverviewTab';
import MilestoneTab from './MilestoneTab';
import RiskTab from './RiskTab';
import NotesPanel from './NotesPanel';
import MinutesView from './MinutesView';

type Step = 'board' | 'minutes';
type BoardTab = 'overview' | 'milestones' | 'risks';

export default function MeetingBoardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { meeting, boardData, boardLoading, fetchMeeting, fetchBoard } = useMeetingStore();
  const [step, setStep] = useState<Step>('board');
  const [boardTab, setBoardTab] = useState<BoardTab>('milestones');
  const [currentWsId, setCurrentWsId] = useState<string>('');
  const [workspaceList, setWorkspaceList] = useState<Array<{ id: string; name: string; health: string }>>([]);
  const [presMode, setPresMode] = useState(false);

  // Load meeting
  useEffect(() => {
    if (!id) return;
    fetchMeeting(id);
  }, [id]);

  // Once meeting loaded, resolve workspaces
  useEffect(() => {
    if (!meeting) return;
    if (meeting.dimension === 'PROJECT') {
      setWorkspaceList([{ id: meeting.dimension_id, name: '', health: 'on-track' }]);
      setCurrentWsId(meeting.dimension_id);
      fetchBoard(meeting.id, meeting.dimension_id);
    } else {
      // PROJECT_GROUP: fetch workspace list via project group API
      api.get(`/project-groups/${meeting.dimension_id}`).then((res: any) => {
        const wss = res.data?.workspaces || [];
        const list = wss.map((w: any) => ({ id: w.id, name: w.name, health: 'on-track' }));
        setWorkspaceList(list);
        if (list.length > 0) {
          setCurrentWsId(list[0].id);
          fetchBoard(meeting.id!, list[0].id);
        }
      }).catch(() => {});
    }
  }, [meeting]);

  const handleSwitchWs = useCallback((wsId: string) => {
    setCurrentWsId(wsId);
    if (id) fetchBoard(id, wsId);
  }, [id, fetchBoard]);

  if (!meeting) return <div className="empty-state"><div>加载中...</div></div>;

  return (
    <div className={presMode ? 'page presenting' : 'page'}>
      {/* Header */}
      <div className="hd">
        <div className="crumb">{meeting.dimension === 'PROJECT_GROUP' ? '项目群' : '项目'} / <b>会议</b></div>
        <span className="separator">|</span>
        <span className="title">📋 {meeting.title}</span>
        <span className="meta">{new Date(meeting.created_at).toLocaleDateString('zh-CN')}</span>
        <span className="sp" />
        <span className="badge acc">{meeting.dimension === 'PROJECT_GROUP' ? '项目群' : '项目'}</span>
        <button className="step-btn" onClick={() => navigate(-1)}>← 返回</button>
        <button className={`step-btn${step === 'board' ? ' on' : ''}`} onClick={() => setStep('board')}>📊 看板</button>
        <button className={`step-btn${step === 'minutes' ? ' on' : ''}`} onClick={() => setStep('minutes')}>📝 纪要</button>
        <button className={`pres-btn${presMode ? ' on' : ''}`} onClick={() => setPresMode(!presMode)}>{presMode ? '☀ 退出投屏' : '🖥 投屏模式'}</button>
      </div>

      {step === 'board' ? (
        <div className="main">
          <div className="board">
            <ProjectSwitcher workspaces={workspaceList} currentId={currentWsId} onChange={handleSwitchWs} />

            {boardData && (
              <>
                <div className="summary">
                  <span className="s-icon">{boardData.health === 'on-track' ? '🟢' : boardData.health === 'at-risk' ? '🟡' : '🔴'}</span>
                  <div>
                    <div className="s-name">{boardData.workspace_name}</div>
                    <div className="s-meta">负责人：{boardData.owner_name || '-'} · {boardData.total_tasks}个任务 · 整体完成 {boardData.pct}%</div>
                  </div>
                  <div className="s-stats">
                    <span className="stat-good">✓ {boardData.done}</span>
                    <span className="stat-bad">⏰ {boardData.overdue} 逾期</span>
                    <span className="stat-warn">⚠ {boardData.risks.length} 风险</span>
                  </div>
                </div>

                <div className="board-tabs">
                  <button className={`bt-tab${boardTab === 'overview' ? ' on' : ''}`} onClick={() => setBoardTab('overview')}>📊 整体进展</button>
                  <button className={`bt-tab${boardTab === 'milestones' ? ' on' : ''}`} onClick={() => setBoardTab('milestones')}>🏔 里程碑</button>
                  <button className={`bt-tab${boardTab === 'risks' ? ' on' : ''}`} onClick={() => setBoardTab('risks')}>⚠️ 风险</button>
                </div>

                <div className="tab-content">
                  {boardTab === 'overview' && <OverviewTab data={boardData} />}
                  {boardTab === 'milestones' && <MilestoneTab data={boardData} />}
                  {boardTab === 'risks' && <RiskTab data={boardData} />}
                </div>
              </>
            )}
            {boardLoading && <div className="empty-state">加载看板数据...</div>}
          </div>
          <NotesPanel meetingId={id!} />
        </div>
      ) : (
        <MinutesView meetingId={id!} />
      )}
    </div>
  );
}
