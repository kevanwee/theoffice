import type * as vscode from 'vscode';

// ── Backend types ─────────────────────────────────────────────────────────────
export type BackendType = 'claude' | 'copilot' | 'codex';

/** Animation state hint derived from the tool name */
export type AgentAnimationHint = 'type' | 'read' | 'search' | 'run' | 'wait' | 'idle';

// ── Event types sent to the webview ──────────────────────────────────────────

export interface AgentEventToolStart {
  kind: 'tool_start';
  toolId: string;
  toolName: string;
  statusText: string;
  animationHint: AgentAnimationHint;
}

export interface AgentEventToolEnd {
  kind: 'tool_end';
  toolId: string;
  toolName: string;
}

export interface AgentEventWaiting {
  kind: 'waiting';
}

export interface AgentEventPermission {
  kind: 'permission';
  statusText: string;
}

export interface AgentEventCompleted {
  kind: 'completed';
}

export interface AgentEventSubagentStart {
  kind: 'subagent_start';
  parentToolId: string;
  childAgentId: number;
  description: string;
}

export interface AgentEventSubagentEnd {
  kind: 'subagent_end';
  parentToolId: string;
  childAgentId: number;
}

export type AgentEvent =
  | AgentEventToolStart
  | AgentEventToolEnd
  | AgentEventWaiting
  | AgentEventPermission
  | AgentEventCompleted
  | AgentEventSubagentStart
  | AgentEventSubagentEnd;

// ── Handle returned by launchAgent ───────────────────────────────────────────
export interface AgentHandle {
  agentId: number;
  terminalRef?: vscode.Terminal;
  /** Backend-specific session identifier (JSONL path, chat session id, etc.) */
  sessionRef: string;
  projectDir?: string;
  folderName?: string;
}

// ── The adapter contract ──────────────────────────────────────────────────────
export interface IAgentAdapter {
  /** Unique backend type identifier */
  readonly id: BackendType;
  /** Human-readable label shown in the Settings modal */
  readonly label: string;

  /** Returns true if this backend is installed and available */
  isAvailable(): Promise<boolean>;

  /**
   * Launches a new agent session.
   * @param folderPath  Optional workspace folder path to pin the agent to.
   * @param agentId     Pre-assigned integer ID to use for this agent.
   * @param terminalIndex Sequential terminal display index.
   */
  launchAgent(
    folderPath: string | undefined,
    agentId: number,
    terminalIndex: number,
  ): Promise<AgentHandle>;

  /**
   * Starts watching an agent and emits events via `onEvent`.
   * Returns a Disposable that stops watching when disposed.
   */
  watchAgent(handle: AgentHandle, onEvent: (event: AgentEvent) => void): vscode.Disposable;

  /** Tears down the agent (terminal + watchers). */
  removeAgent(handle: AgentHandle): void;
}

// ── Utility: map tool name → animation hint ──────────────────────────────────
export function toolNameToAnimationHint(toolName: string): AgentAnimationHint {
  const name = toolName.toLowerCase();
  if (['edit', 'write', 'multiedit', 'notebookedit', 'bash', 'task'].includes(name)) return 'type';
  if (['read'].includes(name)) return 'read';
  if (['glob', 'grep', 'websearch', 'webfetch'].includes(name)) return 'search';
  if (['bash'].includes(name)) return 'run';
  if (['askuserquestion', 'enterplanmode'].includes(name)) return 'wait';
  return 'idle';
}
