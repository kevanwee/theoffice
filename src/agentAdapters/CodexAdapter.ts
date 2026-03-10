/**
 * CodexAdapter — monitors OpenAI Codex CLI session logs.
 *
 * Codex CLI (https://github.com/openai/codex) writes session events to
 * ~/.codex/sessions/<SESSION_ID>/events.jsonl
 *
 * Each event line is a JSON object with a "type" field. Known types:
 *   agent_reasoning, tool_call, tool_call_result, message, error
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  FILE_WATCHER_POLL_INTERVAL_MS,
  JSONL_POLL_INTERVAL_MS,
  TEXT_IDLE_DELAY_MS,
  TOOL_DONE_DELAY_MS,
} from '../constants.js';
import type { AgentEvent, AgentHandle, IAgentAdapter } from './IAgentAdapter.js';
import { toolNameToAnimationHint } from './IAgentAdapter.js';

const TERMINAL_NAME_PREFIX = 'Agent';

// Maps Codex CLI tool names to display text
function formatCodexStatus(toolName: string, input: Record<string, unknown>): string {
  const file = (p: unknown) => (typeof p === 'string' ? path.basename(p) : '');
  switch (toolName) {
    case 'shell': {
      const cmd = String(input.cmd ?? input.command ?? '').slice(0, 30);
      return `Running: ${cmd}`;
    }
    case 'read_file':
      return `Reading ${file(input.path ?? input.file_path)}`;
    case 'write_file':
      return `Writing ${file(input.path ?? input.file_path)}`;
    case 'patch_file':
      return `Editing ${file(input.path ?? input.file_path)}`;
    case 'list_dir':
      return 'Browsing files';
    case 'search_files':
      return 'Searching code';
    case 'grep':
      return 'Searching code';
    case 'web_search':
      return 'Searching the web';
    default:
      return `Using ${toolName}`;
  }
}

// Map Codex tool names to animation hints
function codexHint(toolName: string): 'type' | 'read' | 'search' | 'run' | 'wait' | 'idle' {
  switch (toolName) {
    case 'shell':
      return 'run';
    case 'read_file':
      return 'read';
    case 'write_file':
    case 'patch_file':
      return 'type';
    case 'list_dir':
    case 'search_files':
    case 'grep':
    case 'web_search':
      return 'search';
    default:
      return toolNameToAnimationHint(toolName);
  }
}

interface CodexSession {
  filePath: string;
  fileOffset: number;
  lineBuffer: string;
  activeToolIds: Set<string>;
  activeToolNames: Map<string, string>;
  watcher: fs.FSWatcher | null;
  pollingInterval: ReturnType<typeof setInterval> | null;
  jsonlPollTimer: ReturnType<typeof setInterval> | null;
  waitingTimer: ReturnType<typeof setTimeout> | null;
  isDisposed: boolean;
}

export class CodexAdapter implements IAgentAdapter {
  readonly id = 'codex' as const;
  readonly label = 'OpenAI Codex';

  private sessions = new Map<number, CodexSession>();

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const { exec } = require('child_process') as typeof import('child_process');
      exec('codex --version', (err) => resolve(!err));
    });
  }

  async launchAgent(
    folderPath: string | undefined,
    agentId: number,
    terminalIndex: number,
  ): Promise<AgentHandle> {
    const folders = vscode.workspace.workspaceFolders;
    const cwd = folderPath || folders?.[0]?.uri.fsPath;

    const terminal = vscode.window.createTerminal({
      name: `${TERMINAL_NAME_PREFIX} #${terminalIndex} (Codex)`,
      cwd,
    });
    terminal.show();
    terminal.sendText('codex');

    // Codex stores sessions under ~/.codex/sessions/
    // We'll use the most recently created session folder
    const sessionsDir = path.join(os.homedir(), '.codex', 'sessions');
    const sessionRef = sessionsDir; // We'll scan dynamically in watchAgent

    return {
      agentId,
      terminalRef: terminal,
      sessionRef,
      folderName: cwd ? path.basename(cwd) : undefined,
    };
  }

  watchAgent(handle: AgentHandle, onEvent: (e: AgentEvent) => void): vscode.Disposable {
    const sessionsDir = handle.sessionRef;
    const launchTimestamp = Date.now();

    const csession: CodexSession = {
      filePath: '',
      fileOffset: 0,
      lineBuffer: '',
      activeToolIds: new Set(),
      activeToolNames: new Map(),
      watcher: null,
      pollingInterval: null,
      jsonlPollTimer: null,
      waitingTimer: null,
      isDisposed: false,
    };
    this.sessions.set(handle.agentId, csession);

    // Poll for most-recently-created events.jsonl in ~/.codex/sessions/
    csession.jsonlPollTimer = setInterval(() => {
      if (csession.isDisposed) return;
      const eventsFile = this._findLatestEventsFile(sessionsDir, launchTimestamp);
      if (eventsFile) {
        csession.filePath = eventsFile;
        if (csession.jsonlPollTimer) {
          clearInterval(csession.jsonlPollTimer);
          csession.jsonlPollTimer = null;
        }
        this._startWatching(csession, eventsFile, () =>
          this._readNewLines(handle.agentId, csession, onEvent),
        );
        this._readNewLines(handle.agentId, csession, onEvent);
      }
    }, JSONL_POLL_INTERVAL_MS);

    return {
      dispose: () => {
        csession.isDisposed = true;
        this._stopSession(handle.agentId, csession);
      },
    };
  }

  removeAgent(handle: AgentHandle): void {
    const csession = this.sessions.get(handle.agentId);
    if (csession) {
      csession.isDisposed = true;
      this._stopSession(handle.agentId, csession);
    }
    try {
      handle.terminalRef?.dispose();
    } catch {
      /* ignore */
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _findLatestEventsFile(sessionsDir: string, after: number): string | null {
    try {
      if (!fs.existsSync(sessionsDir)) return null;
      const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
      let latest: { file: string; mtime: number } | null = null;
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const eventsFile = path.join(sessionsDir, entry.name, 'events.jsonl');
        try {
          const stat = fs.statSync(eventsFile);
          if (stat.mtimeMs >= after && (!latest || stat.mtimeMs > latest.mtime)) {
            latest = { file: eventsFile, mtime: stat.mtimeMs };
          }
        } catch {
          /* skip */
        }
      }
      return latest?.file ?? null;
    } catch {
      return null;
    }
  }

  private _startWatching(csession: CodexSession, filePath: string, readLines: () => void): void {
    try {
      csession.watcher = fs.watch(filePath, readLines);
    } catch {
      /* ignore */
    }

    try {
      fs.watchFile(filePath, { interval: FILE_WATCHER_POLL_INTERVAL_MS }, readLines);
    } catch {
      /* ignore */
    }

    csession.pollingInterval = setInterval(readLines, FILE_WATCHER_POLL_INTERVAL_MS);
  }

  private _stopSession(agentId: number, csession: CodexSession): void {
    if (csession.jsonlPollTimer) clearInterval(csession.jsonlPollTimer);
    if (csession.pollingInterval) clearInterval(csession.pollingInterval);
    if (csession.waitingTimer) clearTimeout(csession.waitingTimer);
    csession.watcher?.close();
    if (csession.filePath) {
      try {
        fs.unwatchFile(csession.filePath);
      } catch {
        /* ignore */
      }
    }
    this.sessions.delete(agentId);
  }

  private _readNewLines(
    agentId: number,
    csession: CodexSession,
    onEvent: (e: AgentEvent) => void,
  ): void {
    if (csession.isDisposed || !csession.filePath) return;
    try {
      const stat = fs.statSync(csession.filePath);
      if (stat.size <= csession.fileOffset) return;

      const buf = Buffer.alloc(stat.size - csession.fileOffset);
      const fd = fs.openSync(csession.filePath, 'r');
      fs.readSync(fd, buf, 0, buf.length, csession.fileOffset);
      fs.closeSync(fd);
      csession.fileOffset = stat.size;

      const text = csession.lineBuffer + buf.toString('utf-8');
      const lines = text.split('\n');
      csession.lineBuffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) this._parseLine(agentId, line, csession, onEvent);
      }
    } catch {
      /* file not accessible */
    }
  }

  private _parseLine(
    agentId: number,
    line: string,
    csession: CodexSession,
    onEvent: (e: AgentEvent) => void,
  ): void {
    try {
      const record = JSON.parse(line);
      const type: string = record.type ?? '';

      if (type === 'tool_call' || type === 'function_call') {
        const toolId = record.id ?? record.call_id ?? `codex-${agentId}-${Date.now()}`;
        const toolName = record.name ?? record.function?.name ?? 'Unknown';
        const input = record.input ?? record.function?.arguments ?? {};
        const parsed = typeof input === 'string' ? this._tryParseJson(input) : input;
        const statusText = formatCodexStatus(toolName, parsed);

        csession.activeToolIds.add(toolId);
        csession.activeToolNames.set(toolId, toolName);
        if (csession.waitingTimer) {
          clearTimeout(csession.waitingTimer);
          csession.waitingTimer = null;
        }

        onEvent({
          kind: 'tool_start',
          toolId,
          toolName,
          statusText,
          animationHint: codexHint(toolName),
        });
      }

      if (type === 'tool_call_result' || type === 'function_call_output') {
        const toolId = record.call_id ?? record.id ?? '';
        const toolName = csession.activeToolNames.get(toolId) || '';
        csession.activeToolIds.delete(toolId);
        csession.activeToolNames.delete(toolId);

        onEvent({ kind: 'tool_end', toolId, toolName });

        if (csession.activeToolIds.size === 0) {
          setTimeout(() => {
            if (!csession.isDisposed && csession.activeToolIds.size === 0) {
              csession.waitingTimer = setTimeout(() => {
                onEvent({ kind: 'waiting' });
              }, TEXT_IDLE_DELAY_MS);
            }
          }, TOOL_DONE_DELAY_MS);
        }
      }

      if (type === 'message' && record.role === 'assistant') {
        // Plain text response means agent is waiting for user
        if (csession.activeToolIds.size === 0) {
          onEvent({ kind: 'waiting' });
        }
      }
    } catch {
      /* malformed */
    }
  }

  private _tryParseJson(s: string): Record<string, unknown> {
    try {
      return JSON.parse(s);
    } catch {
      return {};
    }
  }
}
