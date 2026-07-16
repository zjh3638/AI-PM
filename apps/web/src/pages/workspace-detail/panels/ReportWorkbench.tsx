import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useReportStore } from '../../../stores/reportStore';
import { streamReport } from '../../../api/reportStream';
import { showError, showSuccess, showInfo } from '../../../utils/feedback';
import { REPORT_TYPE_LABELS, REPORT_STATUS_LABELS } from '../../../types';
import type { ProjectReport, ReportType } from '../../../types';

export interface ReportWorkbenchProps {
  /** REST 基础路径，如 /workspaces/{id}/reports 或 /project-groups/{id}/reports（不含 /api 前缀） */
  basePath: string;
  /** 是否有管理权限（新建/编辑/生成/发布/删除） */
  canManage: boolean;
  /** 是否显示推送企微按钮（仅项目维度可用） */
  enablePush?: boolean;
  /** 空态文案 */
  emptyHint?: string;
}

/** 报告工作台：项目 / 项目群共用。左侧类型切换+历史列表，右侧编辑器+实时预览。 */
export default function ReportWorkbench({
  basePath, canManage, enablePush = false, emptyHint = '选择或新建一份报告',
}: ReportWorkbenchProps) {
  const { reports, fetchList, create, update, publish, remove, push } = useReportStore();

  const [reportType, setReportType] = useState<ReportType>('WEEKLY');
  const [selected, setSelected] = useState<ProjectReport | null>(null);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const apiBase = `/api${basePath}`;

  useEffect(() => { fetchList(basePath, reportType); }, [basePath, reportType]);

  const selectReport = (r: ProjectReport) => {
    if (dirty && !confirm('当前有未保存的修改，切换将丢失，确定继续？')) return;
    setSelected(r);
    setDraft(r.content || '');
    setDirty(false);
  };

  const handleCreate = async () => {
    const r = await create(basePath, { report_type: reportType });
    setSelected(r);
    setDraft(r.content || '');
    setDirty(false);
    showSuccess('已创建报告');
  };

  const handleSave = async () => {
    if (!selected) return;
    const r = await update(basePath, selected.id, { content: draft });
    setSelected(r);
    setDirty(false);
    showSuccess('已保存');
  };

  const handlePublish = async () => {
    if (!selected) return;
    if (dirty) { showInfo('请先保存再发布'); return; }
    if (!confirm('发布后将不可再编辑，确定发布？')) return;
    await publish(basePath, selected.id);
    setSelected({ ...selected, status: 'PUBLISHED' });
    showSuccess('已发布');
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm('确定删除此报告？')) return;
    await remove(basePath, selected.id);
    setSelected(null);
    setDraft('');
    setDirty(false);
  };

  const handleGenerate = async () => {
    if (!selected) return;
    if (draft.trim() && !confirm('AI 生成将覆盖当前内容，确定继续？')) return;
    setStreaming(true);
    setDraft('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamReport(`${apiBase}/generate-stream`,
        { report_type: selected.report_type }, {
          onDelta: (chunk) => setDraft((prev) => prev + chunk),
          onDone: () => { setDirty(true); showInfo('生成完成，请检查后保存'); },
          onError: (msg) => showError(msg),
        }, controller);
    } catch (e: any) {
      showError(e?.message || '生成失败');
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handlePolish = async () => {
    if (!selected) return;
    if (!draft.trim()) { showInfo('内容为空，无法润色'); return; }
    const instruction = prompt('润色要求（可留空）：') || undefined;
    const current = draft;
    setStreaming(true);
    setDraft('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamReport(`${apiBase}/${selected.id}/polish-stream`,
        { content: current, instruction }, {
          onDelta: (chunk) => setDraft((prev) => prev + chunk),
          onDone: () => { setDirty(true); showInfo('润色完成，请检查后保存'); },
          onError: (msg) => { showError(msg); setDraft(current); },
        }, controller);
    } catch (e: any) {
      showError(e?.message || '润色失败');
      setDraft(current);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleExport = async (format: 'markdown' | 'pdf' | 'docx') => {
    if (!selected) return;
    if (format === 'markdown') {
      const blob = new Blob([draft], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${selected.title}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${apiBase}/${selected.id}/export?format=${format}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!resp.ok) throw new Error('导出失败');
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${selected.title}.${format === 'pdf' ? 'pdf' : 'docx'}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      showError(e?.message || '导出失败');
    }
  };

  const handlePush = async (channel: string) => {
    if (!selected) return;
    if (channel === 'dingtalk') { showInfo('钉钉推送暂未配置'); return; }
    try {
      await push(basePath, selected.id, channel);
      showSuccess('已推送到企业微信群');
    } catch { /* 拦截器已提示 */ }
  };

  const readonly = !canManage || selected?.status === 'PUBLISHED' || streaming;

  return (
    <div className="report-grid" style={{ gridTemplateColumns: '260px 1fr', display: 'grid', gap: 16 }}>
      {/* 左侧：类型切换 + 历史列表 */}
      <div className="report-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['WEEKLY', 'MONTHLY'] as ReportType[]).map((t) => (
            <button key={t}
              className={`ws-tab${reportType === t ? ' active' : ''}`}
              style={{ flex: 1, padding: '6px 0', borderRadius: 'var(--radius)', cursor: 'pointer' }}
              onClick={() => setReportType(t)}>
              {REPORT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        {canManage && (
          <button onClick={handleCreate}
            style={{ padding: '8px', borderRadius: 'var(--radius)', background: 'var(--blue-500)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            + 新建{REPORT_TYPE_LABELS[reportType]}
          </button>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
          {reports.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: '0.8rem' }}>暂无报告</div>
          )}
          {reports.map((r) => (
            <div key={r.id} onClick={() => selectReport(r)}
              style={{
                padding: 10, borderRadius: 'var(--radius)', cursor: 'pointer',
                border: `1px solid ${selected?.id === r.id ? 'var(--blue-400)' : 'var(--border)'}`,
                background: selected?.id === r.id ? 'var(--blue-50)' : 'var(--bg-raised)',
              }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>{r.title}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{r.period_start} ~ {r.period_end}</span>
                <span style={{ color: r.status === 'PUBLISHED' ? 'var(--green-600)' : 'var(--amber-600)' }}>
                  {REPORT_STATUS_LABELS[r.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：编辑器 + 预览 */}
      <div className="report-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 480 }}>
        {!selected ? (
          <div style={{ margin: 'auto', color: 'var(--text-muted)' }}>{emptyHint}</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
              <strong style={{ marginRight: 'auto' }}>{selected.title}</strong>
              {canManage && selected.status !== 'PUBLISHED' && (
                <>
                  <button disabled={streaming} onClick={handleGenerate} className="btn-sm">AI 生成</button>
                  <button disabled={streaming} onClick={handlePolish} className="btn-sm">AI 润色</button>
                  <button disabled={streaming || !dirty} onClick={handleSave} className="btn-sm">保存</button>
                  <button disabled={streaming} onClick={handlePublish} className="btn-sm">发布</button>
                </>
              )}
              <button onClick={() => handleExport('markdown')} className="btn-sm">导出 MD</button>
              <button onClick={() => handleExport('docx')} className="btn-sm">导出 Word</button>
              <button onClick={() => handleExport('pdf')} className="btn-sm">导出 PDF</button>
              {canManage && enablePush && (
                <>
                  <button onClick={() => handlePush('wecom')} className="btn-sm">推送企微</button>
                  <button onClick={() => handlePush('dingtalk')} className="btn-sm">推送钉钉</button>
                </>
              )}
              {canManage && (
                <button onClick={handleDelete} className="btn-sm" style={{ color: 'var(--red-600)' }}>删除</button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1, minHeight: 0 }}>
              <textarea
                value={draft}
                readOnly={readonly}
                onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
                placeholder={streaming ? 'AI 生成中…' : '在此编辑 Markdown，或点击「AI 生成」'}
                style={{
                  resize: 'none', padding: 12, borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)', fontFamily: 'monospace',
                  fontSize: '0.82rem', lineHeight: 1.6, background: readonly ? 'var(--bg-muted)' : 'var(--bg)',
                }} />
              <div style={{ overflowY: 'auto', padding: 12, borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg-raised)' }}
                className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft || '_（预览为空）_'}</ReactMarkdown>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
