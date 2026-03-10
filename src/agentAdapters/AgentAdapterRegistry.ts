/**
 * AgentAdapterRegistry — singleton that holds all registered adapters
 * and coordinates agent lifecycle across backends.
 */

import type * as vscode from 'vscode';

import { ClaudeAdapter } from './ClaudeAdapter.js';
import { CodexAdapter } from './CodexAdapter.js';
import { CopilotAdapter } from './CopilotAdapter.js';
import type { AgentEvent, AgentHandle, BackendType, IAgentAdapter } from './IAgentAdapter.js';

export interface ManagedAgent {
  handle: AgentHandle;
  adapter: IAgentAdapter;
  watcher: vscode.Disposable;
}

export class AgentAdapterRegistry {
  private static _instance: AgentAdapterRegistry | null = null;

  private adapters = new Map<BackendType, IAgentAdapter>([
    ['claude', new ClaudeAdapter()],
    ['copilot', new CopilotAdapter()],
    ['codex', new CodexAdapter()],
  ]);

  private managedAgents = new Map<number, ManagedAgent>();

  static get instance(): AgentAdapterRegistry {
    if (!AgentAdapterRegistry._instance) {
      AgentAdapterRegistry._instance = new AgentAdapterRegistry();
    }
    return AgentAdapterRegistry._instance;
  }

  /** Returns the adapter for the given backend, or null if not registered. */
  getAdapter(type: BackendType): IAgentAdapter | null {
    return this.adapters.get(type) ?? null;
  }

  /** Returns all adapters that report themselves as available. */
  async getAvailableAdapters(): Promise<IAgentAdapter[]> {
    const results: IAgentAdapter[] = [];
    for (const adapter of this.adapters.values()) {
      try {
        if (await adapter.isAvailable()) results.push(adapter);
      } catch {
        /* skip unavailable */
      }
    }
    return results;
  }

  /** Returns all registered adapters (regardless of availability). */
  getAllAdapters(): IAgentAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** Returns all currently managed agents. */
  getManagedAgents(): Map<number, ManagedAgent> {
    return this.managedAgents;
  }

  /** Launches a new agent with the specified backend. */
  async launchAgent(
    backendType: BackendType,
    agentId: number,
    terminalIndex: number,
    folderPath: string | undefined,
    onEvent: (agentId: number, event: AgentEvent) => void,
  ): Promise<ManagedAgent | null> {
    const adapter = this.adapters.get(backendType);
    if (!adapter) return null;

    try {
      const handle = await adapter.launchAgent(folderPath, agentId, terminalIndex);
      const watcher = adapter.watchAgent(handle, (event) => onEvent(agentId, event));
      const managed: ManagedAgent = { handle, adapter, watcher };
      this.managedAgents.set(agentId, managed);
      return managed;
    } catch (err) {
      console.error(`[TheOffice] Failed to launch ${backendType} agent:`, err);
      return null;
    }
  }

  /** Removes an agent and cleans up all resources. */
  removeAgent(agentId: number): void {
    const managed = this.managedAgents.get(agentId);
    if (!managed) return;

    try {
      managed.watcher.dispose();
    } catch {
      /* ignore */
    }
    try {
      managed.adapter.removeAgent(managed.handle);
    } catch {
      /* ignore */
    }

    this.managedAgents.delete(agentId);
  }

  /** Disposes all agents. */
  disposeAll(): void {
    for (const agentId of this.managedAgents.keys()) {
      this.removeAgent(agentId);
    }
  }
}
