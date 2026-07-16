import { parseSSEFrame } from './aiStream';
import { handleAuthExpired } from '../utils/feedback';

export type ReportStreamCallbacks = {
  onDelta: (chunk: string) => void;
  onDone?: (data: any) => void;
  onError?: (message: string) => void;
};

/** 通用的报告类 SSE 流式请求（生成/润色）。复用 aiStream 的分帧解析。 */
export async function streamReport(
  url: string,
  body: Record<string, any>,
  cbs: ReportStreamCallbacks,
  controller?: AbortController,
): Promise<void> {
  const token = localStorage.getItem('token');
  const resp = await fetch(url, {
    method: 'POST',
    signal: controller?.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) {
    if (resp.status === 401) {
      handleAuthExpired();
      throw new Error('登录已过期');
    }
    let msg = `请求失败（${resp.status}）`;
    try {
      const err = await resp.json();
      msg = err?.message || (typeof err?.detail === 'string' ? err.detail : '') || msg;
    } catch { /* 非 JSON */ }
    throw new Error(msg);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      while (true) {
        const i = buf.indexOf('\n\n');
        if (i === -1) break;
        const raw = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const frame = parseSSEFrame(raw);
        if (!frame) continue;
        if (frame.event === 'delta') cbs.onDelta(frame.data?.content || '');
        else if (frame.event === 'done') cbs.onDone?.(frame.data);
        else if (frame.event === 'error') cbs.onError?.(frame.data?.message || '生成失败');
      }
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return;
    throw err;
  }
}
