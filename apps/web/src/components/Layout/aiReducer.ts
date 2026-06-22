import type { ChatMsg, SSEFrame } from './aiTypes';

export function applyFrame(messages: ChatMsg[], frame: SSEFrame): ChatMsg[] {
  if (messages.length === 0) return messages;
  const lastIdx = messages.length - 1;
  const last = messages[lastIdx];
  if (last.role !== 'assistant') return messages;
  const updated: ChatMsg = (() => {
    switch (frame.event) {
      case 'delta':
        return { ...last, text: last.text + frame.data.content };
      case 'tool_call_start':
        return {
          ...last,
          toolCalls: [...last.toolCalls,
            { idx: frame.data.idx, tool: frame.data.tool, args: frame.data.args, state: 'running' }],
        };
      case 'tool_call_result':
        return {
          ...last,
          toolCalls: last.toolCalls.map(tc =>
            tc.idx === frame.data.idx
              ? {
                  ...tc,
                  state: frame.data.error ? 'error' : 'success',
                  resultSummary: frame.data.result_summary,
                  errorMsg: frame.data.error,
                }
              : tc),
        };
      case 'done':
        return { ...last, status: 'done', id: frame.data.message_id, actions: frame.data.actions };
      case 'error':
        return { ...last, status: 'error', error: frame.data.message };
    }
  })();
  return [...messages.slice(0, lastIdx), updated];
}
