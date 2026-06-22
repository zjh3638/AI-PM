import { describe, it, expect } from 'vitest';
import { applyFrame } from './aiReducer';
import type { ChatMsg, SSEFrame } from './aiTypes';

const baseAssistant: ChatMsg = {
  id: 'tmp-1', role: 'assistant', status: 'streaming',
  text: '', toolCalls: [], agent: '项目经理',
};

describe('applyFrame', () => {
  it('appends delta content to last assistant message', () => {
    const start: ChatMsg[] = [baseAssistant];
    const next = applyFrame(start, { event: 'delta', data: { content: '你好' } });
    expect((next[0] as any).text).toBe('你好');
    const next2 = applyFrame(next, { event: 'delta', data: { content: '世界' } });
    expect((next2[0] as any).text).toBe('你好世界');
  });

  it('appends tool_call_start as running trace', () => {
    const f: SSEFrame = { event: 'tool_call_start', data: { idx: 0, tool: 'create_task', args: { title: 'x' } } };
    const next = applyFrame([baseAssistant], f);
    expect((next[0] as any).toolCalls).toHaveLength(1);
    expect((next[0] as any).toolCalls[0].state).toBe('running');
  });

  it('updates tool trace on tool_call_result success', () => {
    const withStart = applyFrame([baseAssistant], { event: 'tool_call_start', data: { idx: 0, tool: 'f', args: {} } });
    const next = applyFrame(withStart, { event: 'tool_call_result', data: { idx: 0, result_summary: 'ok' } });
    expect((next[0] as any).toolCalls[0].state).toBe('success');
    expect((next[0] as any).toolCalls[0].resultSummary).toBe('ok');
  });

  it('marks tool trace as error when error field present', () => {
    const withStart = applyFrame([baseAssistant], { event: 'tool_call_start', data: { idx: 0, tool: 'f', args: {} } });
    const next = applyFrame(withStart, { event: 'tool_call_result', data: { idx: 0, result_summary: '', error: 'boom' } });
    expect((next[0] as any).toolCalls[0].state).toBe('error');
    expect((next[0] as any).toolCalls[0].errorMsg).toBe('boom');
  });

  it('marks done on done frame and sets server-side id', () => {
    const next = applyFrame([baseAssistant], { event: 'done', data: { message_id: 'm-9', conversation_id: 'c-1', actions: [] } });
    expect((next[0] as any).status).toBe('done');
    expect(next[0].id).toBe('m-9');
  });

  it('marks error on error frame', () => {
    const next = applyFrame([baseAssistant], { event: 'error', data: { message: 'fail' } });
    expect((next[0] as any).status).toBe('error');
    expect((next[0] as any).error).toBe('fail');
  });
});
