import { useMeetingStore } from '../../stores/meetingStore';

export default function MinutesView({ meetingId }: { meetingId: string }) {
  const { meeting } = useMeetingStore();
  if (!meeting) return null;

  const summary = meeting.summary;

  const handleExportMd = () => {
    if (!summary) return;
    const blob = new Blob([summary], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${meeting.title}-会议纪要.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="minutes-view" style={{ maxWidth: 800, margin: '0 auto', padding: '24px 0 60px' }}>
      <div className="mv-header">
        <span className="mv-title">📝 会议纪要</span>
        {summary && <span className="badge acc">AI 生成</span>}
        <span className="mv-meta">{meeting.title} · {new Date(meeting.created_at).toLocaleDateString('zh-CN')}</span>
      </div>
      {summary ? (
        <>
          <div className="ov-card" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: '0.75rem' }}>{summary}</div>
          <div className="minutes-actions">
            <button onClick={handleExportMd}>📥 下载 Markdown</button>
            <button>📄 导出 PDF</button>
            <button className="pri">📧 发送邮件</button>
            <button>✏️ 编辑</button>
          </div>
        </>
      ) : (
        <div className="ov-card"><div className="empty-row" style={{ padding: 40, textAlign: 'center' }}>尚未生成会议纪要</div></div>
      )}
    </div>
  );
}
