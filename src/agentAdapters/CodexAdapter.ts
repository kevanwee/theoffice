/** Monitor Codex CLI's date-partitioned rollout JSONL files. */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  FILE_WATCHER_POLL_INTERVAL_MS,
  JSONL_POLL_INTERVAL_MS,
  TERMINAL_NAME_PREFIX,
} from '../constants.js';
import { CodexLogReader, codexSessionsDir, findCodexRollouts } from './codexLog.js';
import type { AgentEvent, AgentHandle, IAgentAdapter } from './IAgentAdapter.js';

export class CodexAdapter implements IAgentAdapter {
  readonly id = 'codex' as const;
  readonly label = 'OpenAI Codex';
  private sessions = new Map<number, vscode.Disposable>();
  private launches = new Map<number, { after: number; cwd: string }>();
  private claimed = new Set<string>();

  async isAvailable(): Promise<boolean> {
    const { execFile } = await import('child_process');
    return new Promise((resolve) => {
      execFile('codex', ['--version'], { shell: process.platform === 'win32' }, (err) =>
        resolve(!err),
      );
    });
  }

  async launchAgent(
    folderPath: string | undefined,
    agentId: number,
    terminalIndex: number,
  ): Promise<AgentHandle> {
    const cwd = folderPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
    const terminal = vscode.window.createTerminal({
      name: `${TERMINAL_NAME_PREFIX} #${terminalIndex} (Codex)`,
      cwd,
    });
    // Capture before launching: logs can exist before watchAgent is called.
    this.launches.set(agentId, { after: Date.now(), cwd });
    terminal.show();
    terminal.sendText('codex');
    return {
      agentId,
      terminalRef: terminal,
      sessionRef: codexSessionsDir(os.homedir(), process.env.CODEX_HOME),
      projectDir: cwd,
      folderName: path.basename(cwd),
    };
  }

  watchAgent(handle: AgentHandle, onEvent: (event: AgentEvent) => void): vscode.Disposable {
    const launch = this.launches.get(handle.agentId);
    this.sessions.get(handle.agentId)?.dispose();
    if (launch) {
      this.launches.set(handle.agentId, launch);
    }
    const reader = new CodexLogReader(onEvent);
    let file = '';
    let watcher: fs.FSWatcher | undefined;
    let disposed = false;
    let warned = false;
    const read = () => {
      if (!disposed && file) {
        reader.read(file);
      }
    };
    const discover = () => {
      if (disposed || file || !launch) {
        return;
      }
      const candidates = findCodexRollouts(
        handle.sessionRef,
        launch.after,
        launch.cwd,
        this.claimed,
      );
      // Concurrent launches in the same folder cannot be correlated reliably.
      const pending = [...this.launches.keys()].filter((id) => {
        const other = this.launches.get(id)!;
        return other.cwd === launch.cwd && id !== handle.agentId;
      });
      if (candidates.length > 1 || (candidates.length > 0 && pending.length > 0)) {
        if (!warned) {
          warned = true;
          void vscode.window.showWarningMessage(
            'The Office: multiple Codex sessions match this folder. Launch one agent at a time; telemetry will remain unbound rather than guess.',
          );
        }
        return;
      }
      if (candidates.length !== 1) {
        return;
      }
      file = candidates[0];
      this.claimed.add(file);
      this.launches.delete(handle.agentId);
      try {
        watcher = fs.watch(file, read);
      } catch {
        /* polling remains active */
      }
      read();
    };
    const discovery = setInterval(discover, JSONL_POLL_INTERVAL_MS);
    const polling = setInterval(read, FILE_WATCHER_POLL_INTERVAL_MS);
    const session = {
      dispose: () => {
        disposed = true;
        clearInterval(discovery);
        clearInterval(polling);
        watcher?.close();
        // Keep claims so a removed terminal's log cannot be reassigned.
        this.launches.delete(handle.agentId);
        this.sessions.delete(handle.agentId);
      },
    };
    this.sessions.set(handle.agentId, session);
    discover();
    return session;
  }

  removeAgent(handle: AgentHandle): void {
    this.sessions.get(handle.agentId)?.dispose();
    this.launches.delete(handle.agentId);
    handle.terminalRef?.dispose();
  }
}
