import type * as vscode from 'vscode';

import type { BackendType } from './agentAdapters/IAgentAdapter.js';

export interface AgentState {
  id: number;
  terminalRef: vscode.Terminal;
  projectDir: string;
  jsonlFile: string;
  fileOffset: number;
  lineBuffer: string;
  activeToolIds: Set<string>;
  activeToolStatuses: Map<string, string>;
  activeToolNames: Map<string, string>;
  activeSubagentToolIds: Map<string, Set<string>>; // parentToolId → active sub-tool IDs
  activeSubagentToolNames: Map<string, Map<string, string>>; // parentToolId → (subToolId → toolName)
  isWaiting: boolean;
  permissionSent: boolean;
  hadToolsInTurn: boolean;
  /** Workspace folder name (only set for multi-root workspaces) */
  folderName?: string;
  /** Which AI backend is powering this agent */
  backendType: BackendType;
  /** Assigned Pokémon / character id (e.g. 'bulbasaur') */
  characterId?: string;
  /** Whether to render the shiny variant of the assigned character */
  isShiny?: boolean;
}

export interface PersistedAgent {
  id: number;
  terminalName: string;
  jsonlFile: string;
  projectDir: string;
  /** Workspace folder name (only set for multi-root workspaces) */
  folderName?: string;
  backendType?: BackendType;
  characterId?: string;
  isShiny?: boolean;
}
