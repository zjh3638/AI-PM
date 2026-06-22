import { describe, it, expect, vi } from 'vitest';
import { streamChat, parseSSEFrame } from './aiStream';

function makeReadable(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(ctrl) {
      if (i < chunks.length) ctrl.enqueue(enc.encode(chunks[i++]));
      else ctrl.close();
    },
  });
}

describe('parseSSEFrame', () => {
  it('parses event + data lines', () => {
    const f = parseSSEFrame('event: delta\ndata: {"content":"x"}');
    expect(f).toEqual({ event: 'delta', data: { content: 'x' } });
  });
  it('returns null on malformed', () => {
    expect(parseSSEFrame('garbage')).toBeNull();
  });
});

describe('streamChat', () => {
  it('dispatches frames split across chunks', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: makeReadable([
        'event: delta\ndata: {"content":"你"}\n\nevent: delta\ndata: {"con',
        'tent":"好"}\n\nevent: done\ndata: {"message_id":"m","conversation_id":"c","actions":[]}\n\n',
      ]),
      headers: new Headers(),
    }) as any;

    const frames: any[] = [];
    await streamChat(
      { message: 'hi', agent: '项目经理' },
      { onFrame: (f) => frames.push(f) },
    );
    expect(frames.map(f => f.event)).toEqual(['delta', 'delta', 'done']);
    expect(frames[0].data.content).toBe('你');
    expect(frames[1].data.content).toBe('好');
  });

  it('respects AbortController', async () => {
    const ctrl = new AbortController();
    global.fetch = vi.fn((_url, opts: any) => {
      ctrl.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    }) as any;
    await expect(streamChat({ message: 'x', agent: 'a' }, { onFrame: () => {} }, ctrl))
      .rejects.toThrow();
  });
});
