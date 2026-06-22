export type ToolCallTrace = {
  idx: number;
  tool: string;
  args: Record<string, unknown>;
  state: 'running' | 'success' | 'error';
  resultSummary?: string;
  errorMsg?: string;
};

export type ChatMsg =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'assistant';
      status: 'streaming' | 'done' | 'error';
      text: string;
      toolCalls: ToolCallTrace[];
      agent: string;
      error?: string;
      actions?: { tool: string; label?: string }[]; // populated on done from server
    };

export type SSEFrame =
  | { event: 'delta'; data: { content: string } }
  | { event: 'tool_call_start'; data: { idx: number; tool: string; args: Record<string, unknown> } }
  | { event: 'tool_call_result'; data: { idx: number; result_summary: string; error?: string } }
  | { event: 'done'; data: { message_id: string; conversation_id: string; actions: { tool: string; label?: string }[] } }
  | { event: 'error'; data: { message: string } };

export type RouteContext = {
  page_type: 'dashboard' | 'workspace_list' | 'workspace_detail' | 'task_detail'
            | 'personal' | 'admin' | 'project_group' | 'bigscreen';
  workspace_id?: string;
  workspace_name?: string;
  workspace_tab?: string;
  task_id?: string;
  task_title?: string;
  filters?: Record<string, string | undefined>;
};
