import type { SSEFrame, RouteContext } from '../components/Layout/aiTypes';

export type ChatStreamRequest = {
  message: string;
  agent: string;
  workspace_id?: string;
  conversation_id?: string;
  route_context?: RouteContext;
};

export type StreamCallbacks = {
  onFrame: (frame: SSEFrame) => void;
};

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
    throw new Error(`stream failed: ${resp.status}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
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
      if (frame) cbs.onFrame(frame);
    }
  }
}
