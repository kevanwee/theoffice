/** Codex rollout discovery and decoding; independent of the VS Code host. */
import * as fs from 'fs';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';

import {
  BASH_COMMAND_DISPLAY_MAX_LENGTH,
  CODEX_LOG_CHUNK_BYTES,
  CODEX_META_BYTES,
} from '../constants.js';
import type { AgentEvent } from './IAgentAdapter.js';

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parse(value: string): Record<string, unknown> {
  try {
    return object(JSON.parse(value));
  } catch {
    return {};
  }
}

export function codexSessionsDir(home: string, codexHome?: string): string {
  return path.join(codexHome || path.join(home, '.codex'), 'sessions');
}

/** Date directories only; never follow symlinks or read unrelated user files. */
export function findCodexRollouts(
  root: string,
  after: number,
  cwd: string,
  claimed: Set<string>,
): string[] {
  const matches: string[] = [];
  const day = new Date(after).toISOString().slice(0, 10).replaceAll('-', '');
  const normalise = (p: string) =>
    process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
  function walk(dir: string, parts: string[]) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory() && parts.length < 3 && /^\d+$/.test(entry.name)) {
        const next = [...parts, entry.name];
        if (next.join('') >= day.slice(0, next.join('').length)) {
          walk(file, next);
        }
      } else if (
        entry.isFile() &&
        entry.name.startsWith('rollout-') &&
        entry.name.endsWith('.jsonl') &&
        !claimed.has(file)
      ) {
        let fd: number | undefined;
        try {
          fd = fs.openSync(file, 'r');
          const buffer = Buffer.alloc(CODEX_META_BYTES);
          const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
          const text = buffer.subarray(0, bytes).toString('utf8');
          const end = text.indexOf('\n');
          if (end < 0) {
            continue;
          } // Metadata may still be being written.
          const line = parse(text.slice(0, end));
          const meta = object(line.payload);
          if (
            line.type === 'session_meta' &&
            meta.source === 'cli' &&
            typeof meta.cwd === 'string' &&
            normalise(meta.cwd) === normalise(cwd) &&
            typeof meta.timestamp === 'string' &&
            Date.parse(meta.timestamp) >= after
          ) {
            matches.push(file);
          }
        } catch {
          /* file replaced or inaccessible */
        } finally {
          if (fd !== undefined) {
            fs.closeSync(fd);
          }
        }
      }
    }
  }
  walk(root, []);
  return matches.sort();
}

export class CodexLogReader {
  private offset = 0;
  private buffer = '';
  private decoder = new StringDecoder('utf8');
  private active = new Map<string, string>();

  constructor(private emit: (event: AgentEvent) => void) {}

  read(file: string): void {
    let fd: number | undefined;
    try {
      fd = fs.openSync(file, 'r');
      const size = fs.fstatSync(fd).size;
      if (size < this.offset) {
        this.finish(false);
        this.offset = 0;
        this.buffer = '';
        this.decoder = new StringDecoder('utf8');
      }
      // Bound work per tick; polling picks up the remainder of a large append.
      const bytes = Math.min(size - this.offset, CODEX_LOG_CHUNK_BYTES);
      if (bytes <= 0) {
        return;
      }
      const data = Buffer.alloc(bytes);
      const read = fs.readSync(fd, data, 0, bytes, this.offset);
      this.offset += read;
      this.push(data.subarray(0, read));
    } catch {
      /* writer may temporarily replace the file */
    } finally {
      if (fd !== undefined) {
        fs.closeSync(fd);
      }
    }
  }

  push(bytes: Buffer): void {
    const lines = (this.buffer + this.decoder.write(bytes)).split('\n');
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      this.line(line);
    }
  }

  private finish(completed: boolean): void {
    for (const [toolId, toolName] of this.active) {
      this.emit({ kind: 'tool_end', toolId, toolName });
    }
    this.active.clear();
    this.emit({ kind: completed ? 'completed' : 'waiting' });
  }

  private line(line: string): void {
    const envelope = parse(line);
    const event =
      envelope.type === 'response_item' || envelope.type === 'event_msg'
        ? object(envelope.payload)
        : envelope;
    const type = event.type;
    if (['task_complete', 'turn_complete', 'turn_aborted', 'error'].includes(String(type))) {
      this.finish(type === 'task_complete' || type === 'turn_complete');
      return;
    }
    if (['function_call', 'custom_tool_call', 'tool_call'].includes(String(type))) {
      const fn = object(event.function);
      const toolId = event.call_id ?? event.id;
      const toolName = event.name ?? fn.name;
      if (typeof toolId !== 'string' || typeof toolName !== 'string' || this.active.has(toolId)) {
        return;
      }
      const raw = event.arguments ?? event.input ?? fn.arguments;
      const input = typeof raw === 'string' ? parse(raw) : object(raw);
      const command = input.cmd ?? input.command;
      const isRun = ['exec_command', 'shell_command', 'shell', 'write_stdin'].includes(toolName);
      const isEdit = ['apply_patch', 'patch_file', 'write_file'].includes(toolName);
      this.active.set(toolId, toolName);
      this.emit({
        kind: 'tool_start',
        toolId,
        toolName,
        statusText: isRun
          ? `Running: ${String(command ?? toolName).slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH)}`
          : `Using ${toolName}`,
        animationHint: isRun
          ? 'run'
          : isEdit
            ? 'type'
            : toolName.includes('search')
              ? 'search'
              : 'read',
      });
    } else if (
      ['function_call_output', 'custom_tool_call_output', 'tool_call_result'].includes(String(type))
    ) {
      const toolId = event.call_id ?? event.id;
      if (typeof toolId !== 'string') {
        return;
      }
      const toolName = this.active.get(toolId);
      if (!toolName) {
        return;
      }
      this.active.delete(toolId);
      this.emit({ kind: 'tool_end', toolId, toolName });
    } else if (type === 'message' && event.role === 'assistant' && event.phase === 'final_answer') {
      // Commentary messages are not turn completion.
      this.finish(false);
    }
  }
}
