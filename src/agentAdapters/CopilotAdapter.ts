/**
 * CopilotAdapter — bridges GitHub Copilot Chat to the agent system.
 *
 * Strategy:
 *   Level 1 (preferred): subscribe to vscode.lm / chat result tool calls array
 *   Level 2 (fallback): parse streaming response text for action markers
 *
 * Per-tool animation is supported: each tool call in a Copilot response fires
 * individual tool_start / tool_end events.
 */

import * as vscode from 'vscode';

import type { AgentEvent, AgentHandle, IAgentAdapter } from './IAgentAdapter.js';
import { toolNameToAnimationHint } from './IAgentAdapter.js';

// Known action text patterns for Level-2 fallback parsing
const ACTION_PATTERNS: Array<{
  regex: RegExp;
  toolName: string;
  hint: 'type' | 'read' | 'search' | 'run' | 'wait' | 'idle';
}> = [
  { regex: /reading\s+(\S+)/i, toolName: 'Read', hint: 'read' },
  { regex: /editing\s+(\S+)/i, toolName: 'Edit', hint: 'type' },
  { regex: /writing\s+(\S+)/i, toolName: 'Write', hint: 'type' },
  { regex: /running[:\s]+(.+)/i, toolName: 'Bash', hint: 'type' },
  { regex: /searching\s+(files|code)/i, toolName: 'Grep', hint: 'search' },
  { regex: /fetching\s+web/i, toolName: 'WebFetch', hint: 'search' },
  { regex: /searching\s+the\s+web/i, toolName: 'WebSearch', hint: 'search' },
];

// Copilot tool names → our animation hint mapping
const COPILOT_TOOL_HINTS: Record<string, 'type' | 'read' | 'search' | 'run' | 'wait' | 'idle'> = {
  vscode_readFile: 'read',
  vscode_readMultipleFiles: 'read',
  vscode_writeFile: 'type',
  vscode_createFile: 'type',
  vscode_editFile: 'type',
  vscode_applyEdit: 'type',
  vscode_runInTerminal: 'run',
  vscode_getTerminalOutput: 'run',
  vscode_search: 'search',
  vscode_findTextInFiles: 'search',
  vscode_listDirectory: 'search',
  vscode_getFileContents: 'read',
};

interface CopilotSession {
  disposables: vscode.Disposable[];
  activeToolIds: Set<string>;
  isDisposed: boolean;
}

export class CopilotAdapter implements IAgentAdapter {
  readonly id = 'copilot' as const;
  readonly label = 'GitHub Copilot';

  private sessions = new Map<number, CopilotSession>();

  async isAvailable(): Promise<boolean> {
    const ext = vscode.extensions.getExtension('GitHub.copilot-chat');
    return !!ext?.isActive || !!ext;
  }

  async launchAgent(
    folderPath: string | undefined,
    agentId: number,
    terminalIndex: number,
  ): Promise<AgentHandle> {
    // Open Copilot Chat panel — the user interacts there directly
    await vscode.commands.executeCommand('workbench.action.chat.open');

    return {
      agentId,
      terminalRef: undefined,
      sessionRef: `copilot-${agentId}`,
      folderName: folderPath ? require('path').basename(folderPath) : undefined,
    };
  }

  watchAgent(handle: AgentHandle, onEvent: (e: AgentEvent) => void): vscode.Disposable {
    const session: CopilotSession = {
      disposables: [],
      activeToolIds: new Set(),
      isDisposed: false,
    };
    this.sessions.set(handle.agentId, session);

    // ── Level 1: Try vscode.lm chat request subscription ─────────────────
    // The VS Code Language Model API exposes chat requests with tool calls
    this._trySubscribeLmApi(handle.agentId, session, onEvent);

    return {
      dispose: () => {
        session.isDisposed = true;
        for (const d of session.disposables) d.dispose();
        this.sessions.delete(handle.agentId);
      },
    };
  }

  removeAgent(handle: AgentHandle): void {
    const session = this.sessions.get(handle.agentId);
    if (session) {
      session.isDisposed = true;
      for (const d of session.disposables) d.dispose();
      this.sessions.delete(handle.agentId);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _trySubscribeLmApi(
    agentId: number,
    session: CopilotSession,
    onEvent: (e: AgentEvent) => void,
  ): void {
    // VS Code 1.107+ exposes vscode.lm.onDidChangeChatModels
    // We hook into the chat response stream to detect tool calls
    try {
      // Listen for language model request start — fires when Copilot begins a response
      if ('lm' in vscode && typeof (vscode.lm as any).onDidReceiveChatRequest === 'function') {
        const d = (vscode.lm as any).onDidReceiveChatRequest((req: any) => {
          if (session.isDisposed) return;
          this._handleLmRequest(agentId, session, req, onEvent);
        });
        session.disposables.push(d);
      } else {
        // Level 2 fallback: emulate via output channel observation
        this._subscribeOutputChannelFallback(agentId, session, onEvent);
      }
    } catch {
      this._subscribeOutputChannelFallback(agentId, session, onEvent);
    }
  }

  private _handleLmRequest(
    agentId: number,
    session: CopilotSession,
    req: any,
    onEvent: (e: AgentEvent) => void,
  ): void {
    // req.toolCalls is an array of { id, name, input } when tools are in use
    const toolCalls: Array<{ id: string; name: string; input?: Record<string, unknown> }> =
      req?.toolCalls ?? [];

    for (const tc of toolCalls) {
      if (session.isDisposed) break;
      const toolId = tc.id || `${agentId}-${Date.now()}`;
      const toolName = tc.name || 'Unknown';
      const hint = COPILOT_TOOL_HINTS[toolName] ?? toolNameToAnimationHint(toolName);
      const statusText = this._formatCopilotStatus(toolName, tc.input ?? {});

      session.activeToolIds.add(toolId);
      onEvent({ kind: 'tool_start', toolId, toolName, statusText, animationHint: hint });

      // Tool end: fire after a small delay simulating completion
      // (Copilot doesn't always expose explicit tool result events)
      setTimeout(() => {
        if (session.isDisposed) return;
        session.activeToolIds.delete(toolId);
        onEvent({ kind: 'tool_end', toolId, toolName });
        if (session.activeToolIds.size === 0) {
          onEvent({ kind: 'waiting' });
        }
      }, 800);
    }

    if (toolCalls.length === 0) {
      // Plain response — emit idle
      onEvent({ kind: 'waiting' });
    }
  }

  private _subscribeOutputChannelFallback(
    agentId: number,
    session: CopilotSession,
    onEvent: (e: AgentEvent) => void,
  ): void {
    // Level-2: watch for chat response events via vscode.chat API if available
    try {
      if ('chat' in vscode && typeof (vscode.chat as any).onDidPerformAction === 'function') {
        const d = (vscode.chat as any).onDidPerformAction((action: any) => {
          if (session.isDisposed) return;
          const text: string = action?.label ?? action?.title ?? '';
          this._parseActionText(agentId, session, text, onEvent);
        });
        session.disposables.push(d);
      }
    } catch {
      /* API not available */
    }
  }

  private _parseActionText(
    agentId: number,
    session: CopilotSession,
    text: string,
    onEvent: (e: AgentEvent) => void,
  ): void {
    for (const pattern of ACTION_PATTERNS) {
      const match = text.match(pattern.regex);
      if (match) {
        const toolId = `copilot-${agentId}-${Date.now()}`;
        session.activeToolIds.add(toolId);
        onEvent({
          kind: 'tool_start',
          toolId,
          toolName: pattern.toolName,
          statusText: text.slice(0, 50),
          animationHint: pattern.hint,
        });
        setTimeout(() => {
          if (!session.isDisposed) {
            session.activeToolIds.delete(toolId);
            onEvent({ kind: 'tool_end', toolId, toolName: pattern.toolName });
          }
        }, 600);
        return;
      }
    }
    onEvent({ kind: 'waiting' });
  }

  private _formatCopilotStatus(toolName: string, input: Record<string, unknown>): string {
    const file =
      typeof input.uri === 'string'
        ? require('path').basename(input.uri)
        : typeof input.path === 'string'
          ? require('path').basename(input.path)
          : '';
    switch (toolName) {
      case 'vscode_readFile':
      case 'vscode_readMultipleFiles':
      case 'vscode_getFileContents':
        return `Reading ${file}`;
      case 'vscode_writeFile':
      case 'vscode_createFile':
      case 'vscode_editFile':
      case 'vscode_applyEdit':
        return `Editing ${file}`;
      case 'vscode_runInTerminal':
        return `Running: ${String(input.command ?? '').slice(0, 30)}`;
      case 'vscode_search':
      case 'vscode_findTextInFiles':
        return 'Searching code';
      case 'vscode_listDirectory':
        return 'Browsing files';
      default:
        return `Using ${toolName}`;
    }
  }
}
