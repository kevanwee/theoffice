/**
 * ClaudeAdapter — wraps the existing Claude Code JSONL-based agent logic.
 *
 * This adapter monitors ~/.claude/projects/<workspace>/SESSION_ID.jsonl
 * using the hybrid fs.watch + stat polling approach from the original codebase.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  BASH_COMMAND_DISPLAY_MAX_LENGTH,
  FILE_WATCHER_POLL_INTERVAL_MS,
  JSONL_POLL_INTERVAL_MS,
  PERMISSION_TIMER_DELAY_MS,
  TASK_DESCRIPTION_DISPLAY_MAX_LENGTH,
  TEXT_IDLE_DELAY_MS,
  TOOL_DONE_DELAY_MS,
} from '../constants.js';
import type { AgentEvent, AgentHandle, IAgentAdapter } from './IAgentAdapter.js';
import { toolNameToAnimationHint } from './IAgentAdapter.js';

const TERMINAL_NAME_PREFIX = 'Agent';
const PERMISSION_EXEMPT_TOOLS = new Set(['Task', 'AskUserQuestion']);

function formatStatus(toolName: string, input: Record<string, unknown>): string {
  const base = (p: unknown) => (typeof p === 'string' ? path.basename(p) : '');
  switch (toolName) {
    case 'Read':
      return `Reading ${base(input.file_path)}`;
    case 'Edit':
      return `Editing ${base(input.file_path)}`;
    case 'Write':
      return `Writing ${base(input.file_path)}`;
    case 'MultiEdit':
      return `Editing ${base(input.file_path)}`;
    case 'Bash': {
      const cmd = (input.command as string) || '';
      return `Running: ${cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + '…' : cmd}`;
    }
    case 'Glob':
      return 'Searching files';
    case 'Grep':
      return 'Searching code';
    case 'WebFetch':
      return 'Fetching web content';
    case 'WebSearch':
      return 'Searching the web';
    case 'Task': {
      const desc = typeof input.description === 'string' ? input.description : '';
      return desc
        ? `Subtask: ${desc.length > TASK_DESCRIPTION_DISPLAY_MAX_LENGTH ? desc.slice(0, TASK_DESCRIPTION_DISPLAY_MAX_LENGTH) + '…' : desc}`
        : 'Running subtask';
    }
    case 'AskUserQuestion':
      return 'Waiting for your answer';
    case 'EnterPlanMode':
      return 'Planning';
    case 'NotebookEdit':
      return 'Editing notebook';
    default:
      return `Using ${toolName}`;
  }
}

interface SessionState {
  fileOffset: number;
  lineBuffer: string;
  activeToolIds: Set<string>;
  activeToolNames: Map<string, string>;
  isWaiting: boolean;
  permissionSent: boolean;
  hadToolsInTurn: boolean;
  watcher: fs.FSWatcher | null;
  pollingInterval: ReturnType<typeof setInterval> | null;
  waitingTimer: ReturnType<typeof setTimeout> | null;
  permissionTimer: ReturnType<typeof setTimeout> | null;
  jsonlPollTimer: ReturnType<typeof setInterval> | null;
}

export class ClaudeAdapter implements IAgentAdapter {
  readonly id = 'claude' as const;
  readonly label = 'Claude Code';

  private sessions = new Map<number, SessionState>();

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const { exec } = require('child_process') as typeof import('child_process');
      exec('claude --version', (err) => resolve(!err));
    });
  }

  async launchAgent(
    folderPath: string | undefined,
    agentId: number,
    terminalIndex: number,
  ): Promise<AgentHandle> {
    const folders = vscode.workspace.workspaceFolders;
    const cwd = folderPath || folders?.[0]?.uri.fsPath;
    const isMultiRoot = !!(folders && folders.length > 1);

    const terminal = vscode.window.createTerminal({
      name: `${TERMINAL_NAME_PREFIX} #${terminalIndex} (Claude)`,
      cwd,
    });
    terminal.show();

    const sessionId = crypto.randomUUID();
    terminal.sendText(`claude --session-id ${sessionId}`);

    const projectDir = this._getProjectDir(cwd);
    const expectedFile = projectDir ? path.join(projectDir, `${sessionId}.jsonl`) : '';
    const folderName = isMultiRoot && cwd ? path.basename(cwd) : undefined;

    return {
      agentId,
      terminalRef: terminal,
      sessionRef: expectedFile,
      projectDir: projectDir ?? undefined,
      folderName,
    };
  }

  watchAgent(handle: AgentHandle, onEvent: (e: AgentEvent) => void): vscode.Disposable {
    const state: SessionState = {
      fileOffset: 0,
      lineBuffer: '',
      activeToolIds: new Set(),
      activeToolNames: new Map(),
      isWaiting: false,
      permissionSent: false,
      hadToolsInTurn: false,
      watcher: null,
      pollingInterval: null,
      waitingTimer: null,
      permissionTimer: null,
      jsonlPollTimer: null,
    };
    this.sessions.set(handle.agentId, state);

    const filePath = handle.sessionRef;
    if (!filePath) {
      return { dispose: () => {} };
    }

    const readLines = () => this._readNewLines(handle.agentId, filePath, state, onEvent);

    // Poll until the JSONL file appears then switch to watchers
    state.jsonlPollTimer = setInterval(() => {
      try {
        if (fs.existsSync(filePath)) {
          if (state.jsonlPollTimer) {
            clearInterval(state.jsonlPollTimer);
            state.jsonlPollTimer = null;
          }
          this._startWatching(filePath, state, readLines);
          readLines();
        }
      } catch {
        /* file not yet */
      }
    }, JSONL_POLL_INTERVAL_MS);

    return {
      dispose: () => {
        this._stopSession(handle.agentId, filePath);
      },
    };
  }

  removeAgent(handle: AgentHandle): void {
    this._stopSession(handle.agentId, handle.sessionRef);
    try {
      handle.terminalRef?.dispose();
    } catch {
      /* ignore */
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _getProjectDir(cwd?: string): string | null {
    const workspacePath = cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) return null;
    const dirName = workspacePath.replace(/[^a-zA-Z0-9-]/g, '-');
    return path.join(os.homedir(), '.claude', 'projects', dirName);
  }

  private _startWatching(filePath: string, state: SessionState, readLines: () => void): void {
    try {
      state.watcher = fs.watch(filePath, readLines);
    } catch {
      /* fs.watch unavailable */
    }

    try {
      fs.watchFile(filePath, { interval: FILE_WATCHER_POLL_INTERVAL_MS }, readLines);
    } catch {
      /* ignore */
    }

    state.pollingInterval = setInterval(readLines, FILE_WATCHER_POLL_INTERVAL_MS);
  }

  private _stopSession(agentId: number, filePath: string): void {
    const state = this.sessions.get(agentId);
    if (!state) return;

    if (state.jsonlPollTimer) clearInterval(state.jsonlPollTimer);
    if (state.pollingInterval) clearInterval(state.pollingInterval);
    if (state.waitingTimer) clearTimeout(state.waitingTimer);
    if (state.permissionTimer) clearTimeout(state.permissionTimer);
    state.watcher?.close();

    try {
      fs.unwatchFile(filePath);
    } catch {
      /* ignore */
    }

    this.sessions.delete(agentId);
  }

  private _readNewLines(
    agentId: number,
    filePath: string,
    state: SessionState,
    onEvent: (e: AgentEvent) => void,
  ): void {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size <= state.fileOffset) return;

      const buf = Buffer.alloc(stat.size - state.fileOffset);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buf, 0, buf.length, state.fileOffset);
      fs.closeSync(fd);
      state.fileOffset = stat.size;

      const text = state.lineBuffer + buf.toString('utf-8');
      const lines = text.split('\n');
      state.lineBuffer = lines.pop() || '';

      const hasLines = lines.some((l) => l.trim());
      if (hasLines) {
        if (state.waitingTimer) {
          clearTimeout(state.waitingTimer);
          state.waitingTimer = null;
        }
        if (state.permissionTimer) {
          clearTimeout(state.permissionTimer);
          state.permissionTimer = null;
        }
      }

      for (const line of lines) {
        if (line.trim()) this._parseLine(agentId, line, state, onEvent);
      }
    } catch {
      /* file not accessible yet */
    }
  }

  private _parseLine(
    agentId: number,
    line: string,
    state: SessionState,
    onEvent: (e: AgentEvent) => void,
  ): void {
    try {
      const record = JSON.parse(line);

      // ── Tool use ────────────────────────────────────────────────────────
      if (record.type === 'assistant' && Array.isArray(record.message?.content)) {
        const blocks = record.message.content as Array<{
          type: string;
          id?: string;
          name?: string;
          input?: Record<string, unknown>;
        }>;
        const hasToolUse = blocks.some((b) => b.type === 'tool_use');
        if (hasToolUse) {
          if (state.waitingTimer) {
            clearTimeout(state.waitingTimer);
            state.waitingTimer = null;
          }
          state.isWaiting = false;
          state.hadToolsInTurn = true;
          let hasNonExempt = false;

          for (const block of blocks) {
            if (block.type === 'tool_use' && block.id) {
              const toolName = block.name || '';
              const statusText = formatStatus(toolName, block.input || {});
              state.activeToolIds.add(block.id);
              state.activeToolNames.set(block.id, toolName);
              if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) hasNonExempt = true;

              onEvent({
                kind: 'tool_start',
                toolId: block.id,
                toolName,
                statusText,
                animationHint: toolNameToAnimationHint(toolName),
              });
            }
          }

          if (hasNonExempt && !state.permissionSent) {
            state.permissionTimer = setTimeout(() => {
              state.permissionSent = true;
              onEvent({ kind: 'permission', statusText: 'Permission may be needed' });
            }, PERMISSION_TIMER_DELAY_MS);
          }
        }
      }

      // ── Tool result ─────────────────────────────────────────────────────
      if (
        record.type === 'tool_result' ||
        (record.type === 'user' && Array.isArray(record.message?.content))
      ) {
        const content =
          record.type === 'tool_result'
            ? [record]
            : (record.message.content as Array<{ type?: string; tool_use_id?: string }>);

        for (const item of content) {
          if (item.type === 'tool_result' && item.tool_use_id) {
            const toolId = item.tool_use_id;
            const toolName = state.activeToolNames.get(toolId) || '';
            state.activeToolIds.delete(toolId);
            state.activeToolNames.delete(toolId);

            onEvent({ kind: 'tool_end', toolId, toolName });

            // Start idle timer when no more active tools
            if (state.activeToolIds.size === 0) {
              setTimeout(() => {
                if (state.activeToolIds.size === 0) {
                  state.waitingTimer = setTimeout(() => {
                    state.isWaiting = true;
                    onEvent({ kind: 'waiting' });
                  }, TEXT_IDLE_DELAY_MS);
                }
              }, TOOL_DONE_DELAY_MS);
            }
          }
        }
      }

      // ── Turn completion (system/turn_duration) ──────────────────────────
      if (record.type === 'system' && record.subtype === 'turn_duration') {
        // Reliable turn-end signal — clear all tool state
        for (const toolId of state.activeToolIds) {
          const toolName = state.activeToolNames.get(toolId) || '';
          onEvent({ kind: 'tool_end', toolId, toolName });
        }
        state.activeToolIds.clear();
        state.activeToolNames.clear();
        state.isWaiting = true;
        state.hadToolsInTurn = false;
        state.permissionSent = false;
        if (state.waitingTimer) {
          clearTimeout(state.waitingTimer);
          state.waitingTimer = null;
        }
        if (state.permissionTimer) {
          clearTimeout(state.permissionTimer);
          state.permissionTimer = null;
        }
        onEvent({ kind: 'waiting' });
      }
    } catch {
      /* malformed JSON */
    }
  }
}
