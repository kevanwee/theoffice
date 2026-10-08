import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';

import { CodexLogReader, codexSessionsDir, findCodexRollouts } from '../agentAdapters/codexLog.js';
import type { AgentEvent } from '../agentAdapters/IAgentAdapter.js';

const timestamp = '2026-10-08T12:00:00.000Z';
const after = Date.parse(timestamp);
const cwd = path.resolve('fixture-project');
const record = (type: string, payload: object) => JSON.stringify({ type, payload }) + '\n';

test('discovers only new CLI rollouts in the matching workspace, respecting claims', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-codex-'));
  try {
    const dir = path.join(root, '2026', '10', '08');
    fs.mkdirSync(dir, { recursive: true });
    const write = (name: string, meta: object) => {
      const file = path.join(dir, 'rollout-' + name + '.jsonl');
      fs.writeFileSync(file, record('session_meta', { timestamp, cwd, source: 'cli', ...meta }));
      return file;
    };
    const expected = write('matching', {});
    write('other-folder', { cwd: path.resolve('other-project') });
    write('old-but-recently-modified', { timestamp: '2026-10-07T12:00:00Z' });
    write('subagent', { source: { subagent: 'thread_spawn' } });
    write('app-server', { source: 'vscode' });
    fs.writeFileSync(path.join(dir, 'rollout-partial.jsonl'), '{"type":"session_meta"');
    assert.deepEqual(findCodexRollouts(root, after, cwd, new Set()), [expected]);
    assert.deepEqual(findCodexRollouts(root, after, cwd, new Set([expected])), []);
    const second = write('second', {});
    assert.deepEqual(findCodexRollouts(root, after, cwd, new Set()), [expected, second].sort());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('honours CODEX_HOME without modifying credentials or configuration', () => {
  assert.equal(codexSessionsDir('/home/test', '/custom'), path.join('/custom', 'sessions'));
  assert.equal(codexSessionsDir('/home/test'), path.join('/home/test', '.codex', 'sessions'));
});

test('decodes wrapped calls and outputs; does not duplicate mirrored events', () => {
  const events: AgentEvent[] = [];
  const reader = new CodexLogReader((e) => events.push(e));
  const call = {
    type: 'function_call',
    call_id: 'shell-1',
    name: 'exec_command',
    arguments: '{"cmd":"echo hello"}',
  };
  reader.push(Buffer.from(record('response_item', call) + record('response_item', call)));
  reader.push(Buffer.from(record('event_msg', { type: 'exec_command_begin', call_id: 'shell-1' })));
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'tool_start');
  assert.equal(events[0].kind === 'tool_start' && events[0].animationHint, 'run');
  reader.push(
    Buffer.from(
      record('response_item', { type: 'function_call_output', call_id: 'shell-1', output: 'ok' }),
    ),
  );
  assert.deepEqual(events[1], { kind: 'tool_end', toolId: 'shell-1', toolName: 'exec_command' });
  reader.push(Buffer.from(record('event_msg', { type: 'task_complete' })));
  assert.deepEqual(events[2], { kind: 'completed' });
});

test('buffers incomplete lines and split UTF-8; custom tools retain call IDs', () => {
  const events: AgentEvent[] = [];
  const reader = new CodexLogReader((e) => events.push(e));
  const bytes = Buffer.from(
    record('response_item', {
      type: 'custom_tool_call',
      call_id: 'patch-1',
      name: 'apply_patch',
      input: 'café',
    }),
  );
  const split = bytes.indexOf(Buffer.from('é')) + 1;
  reader.push(bytes.subarray(0, split));
  assert.equal(events.length, 0);
  reader.push(bytes.subarray(split, bytes.length - 1));
  assert.equal(events.length, 0);
  reader.push(bytes.subarray(bytes.length - 1));
  assert.equal(events[0].kind === 'tool_start' && events[0].toolId, 'patch-1');
  reader.push(
    Buffer.from(record('response_item', { type: 'custom_tool_call_output', call_id: 'patch-1' })),
  );
  assert.equal(events[1].kind, 'tool_end');
});

test('ignores malformed lines and commentary; aborted turns clear active tools', () => {
  const events: AgentEvent[] = [];
  const reader = new CodexLogReader((e) => events.push(e));
  reader.push(
    Buffer.from(
      'null\nnot json\n' +
        record('response_item', { type: 'message', role: 'assistant', phase: 'commentary' }),
    ),
  );
  assert.equal(events.length, 0);
  reader.push(
    Buffer.from(
      record('response_item', { type: 'function_call', call_id: '1', name: 'exec_command' }),
    ),
  );
  reader.push(Buffer.from(record('event_msg', { type: 'turn_aborted' })));
  assert.deepEqual(
    events.map((e) => e.kind),
    ['tool_start', 'tool_end', 'waiting'],
  );
});

test('incremental file reads do not replay lines and recover after truncation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-codex-read-'));
  try {
    const file = path.join(root, 'rollout-test.jsonl');
    const events: AgentEvent[] = [];
    const reader = new CodexLogReader((e) => events.push(e));
    fs.writeFileSync(
      file,
      record('response_item', { type: 'function_call', call_id: '1', name: 'exec_command' }),
    );
    reader.read(file);
    reader.read(file);
    assert.equal(events.length, 1);
    fs.appendFileSync(file, record('event_msg', { type: 'turn_complete' }));
    reader.read(file);
    assert.deepEqual(
      events.map((e) => e.kind),
      ['tool_start', 'tool_end', 'completed'],
    );
    fs.writeFileSync(file, '\n');
    reader.read(file);
    assert.equal(events.at(-1)?.kind, 'waiting');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('discovers a local-date rollout across the UTC year boundary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-codex-local-date-'));
  try {
    const dir = path.join(root, '2025', '12', '31');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'rollout-local-date.jsonl');
    const timestamp = '2026-01-01T00:30:00.000Z';
    fs.writeFileSync(file, record('session_meta', { timestamp, cwd, source: 'cli' }));
    assert.deepEqual(findCodexRollouts(root, Date.parse(timestamp), cwd, new Set()), [file]);
    assert.deepEqual(findCodexRollouts(root, Date.parse(timestamp) + 1, cwd, new Set()), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
