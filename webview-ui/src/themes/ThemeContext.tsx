/**
 * ThemeContext — React context that makes the active ThemePack and per-agent
 * character assignments available to the entire component tree.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import type { ThemePack } from './ThemePack.js';
import { ThemeRegistry } from './ThemeRegistry.js';

// ── Context shape ─────────────────────────────────────────────────────────────

export interface AgentCharacterAssignment {
  /** Extension-side agent numeric id */
  agentId: number;
  /** Character id within the active theme's pack, e.g. "bulbasaur" */
  characterId: string;
  isShiny: boolean;
}

export interface ThemeContextValue {
  /** The currently active ThemePack, or null whilst loading. */
  activeTheme: ThemePack | null;
  /** All registered packs (for the picker). */
  availableThemes: ThemePack[];
  /** Active scene id — one of the scenes in the active pack. */
  activeSceneId: string | null;
  /** Per-agent character assignments. */
  characterAssignments: AgentCharacterAssignment[];
  /** Switch the active theme (also persisted via vscode message). */
  setActiveTheme: (id: string) => void;
  /** Switch the active scene. */
  setActiveScene: (id: string) => void;
  /** Assign a character to an agent. */
  assignCharacter: (agentId: number, characterId: string, isShiny?: boolean) => void;
  /** Get the character id assigned to a specific agent. */
  getCharacterFor: (agentId: number) => AgentCharacterAssignment | null;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [activeTheme, setActiveThemeState] = useState<ThemePack | null>(
    () => ThemeRegistry.getActive() ?? null,
  );
  const [availableThemes, setAvailableThemes] = useState<ThemePack[]>(() => ThemeRegistry.getAll());
  const [activeSceneId, setActiveSceneIdState] = useState<string | null>(null);
  const [characterAssignments, setCharacterAssignments] = useState<AgentCharacterAssignment[]>([]);

  // Stay in sync when registry changes (e.g. after extension sends theme data)
  useEffect(() => {
    const unsub = ThemeRegistry.subscribe((pack) => {
      setActiveThemeState(pack);
      setAvailableThemes(ThemeRegistry.getAll());
      // If no scene set yet, pick the default
      setActiveSceneIdState((prev) => prev ?? pack.defaultSceneId);
    });
    // Seed if registry already has something
    const current = ThemeRegistry.getActive();
    if (current) {
      setActiveThemeState(current);
      setAvailableThemes(ThemeRegistry.getAll());
      setActiveSceneIdState((prev) => prev ?? current.defaultSceneId);
    }
    return unsub;
  }, []);

  const setActiveTheme = useCallback((id: string) => {
    ThemeRegistry.setActive(id);
    // Trusting the subscribe callback above to update React state
  }, []);

  const setActiveScene = useCallback((id: string) => {
    setActiveSceneIdState(id);
  }, []);

  const assignCharacter = useCallback((agentId: number, characterId: string, isShiny = false) => {
    setCharacterAssignments((prev) => {
      const without = prev.filter((a) => a.agentId !== agentId);
      return [...without, { agentId, characterId, isShiny }];
    });
  }, []);

  const getCharacterFor = useCallback(
    (agentId: number): AgentCharacterAssignment | null => {
      return characterAssignments.find((a) => a.agentId === agentId) ?? null;
    },
    [characterAssignments],
  );

  return (
    <ThemeContext.Provider
      value={{
        activeTheme,
        availableThemes,
        activeSceneId,
        characterAssignments,
        setActiveTheme,
        setActiveScene,
        assignCharacter,
        getCharacterFor,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
