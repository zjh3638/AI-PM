import type { SSEFrame, RouteContext } from '../components/Layout/aiTypes';
import { handleAuthExpired } from '../utils/feedback';

export type ChatStreamRequest = {
  message: string;
  agent: string;
  workspace_id?: string;
  conversation_id?: string;
  route_context?: RouteContext;
  edit?: { after_id: string };
  images?: string[];
};

export type StreamCallbacks = {
  onFrame: (frame: SSEFrame) => void;
  /** 连接中断（网络错误或超过 30s 无数据）时触发，可用于提示重连 */
  onLost?: () => void;
};

/** 超过该时长（毫秒）未收到任何数据帧则视为断线 */
const INACTIVITY_TIMEOUT = 30_000;

export function parseSSEFrame(raw: string): SSEFrame | null {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let event = '';
  let dataStr = '';
  for (const l of lines) {
    if (l.startsWith('event:')) event = l.slice(6).trim();
    else if (l.startsWith('data:')) dataStr += l.slice(5).trim();
  }
  if (!event || !dataStr) return null;
  try {
    return { event, data: JSON.parse(dataStr) } as SSEFrame;
  } catch {
    return null;
  }
}

export async function streamChat(
  req: ChatStreamRequest,
  cbs: StreamCallbacks,
  controller?: AbortController,
): Promise<void> {
  const token = localStorage.getItem('token');
  const resp = await fetch('/api/ai/chat-stream', {
    method: 'POST',
    signal: controller?.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(req),
  });
  if (!resp.ok || !resp.body) {
    if (resp.status === 401) {
      handleAuthExpired();
      throw new Error('登录已过期');
    }
    // 解析后端返回的 JSON 错误信息，让聊天面板能展示真实原因
    // 而不是无意义的 "stream failed: 500"
    let msg = `请求失败（${resp.status}）`;
    try {
      const errBody = await resp.json();
      msg = errBody?.message
        || (typeof errBody?.detail === 'string' ? errBody.detail : '')
        || (Array.isArray(errBody?.detail) && errBody.detail[0]?.msg ? errBody.detail[0].msg : '')
        || msg;
    } catch { /* 非 JSON 响应，使用默认 msg */ }
    throw new Error(msg);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let done = false;
  try {
    while (!done) {
      // 30s 无数据视为断线：用超时 Promise 与 read() 竞速
      const timeout = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), INACTIVITY_TIMEOUT),
      );
      const result = await Promise.race([reader.read(), timeout]);
      if (result === 'timeout') {
        cbs.onLost?.();
        try { await reader.cancel(); } catch { /* ignore */ }
        return;
      }
      const { value, done: streamDone } = result;
      if (streamDone) {
        done = true;
        break;
      }
      buf += decoder.decode(value, { stream: true });
      while (true) {
        const i = buf.indexOf('\n\n');
        if (i === -1) break;
        const raw = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const frame = parseSSEFrame(raw);
        if (frame) cbs.onFrame(frame);
      }
    }
  } catch (err) {
    // AbortController.abort() 触发的取消属于正常终止，不算断线
    if ((err as Error)?.name === 'AbortError') return;
    cbs.onLost?.();
    throw err;
  }
}
