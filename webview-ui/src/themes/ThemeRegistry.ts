/**
 * ThemeRegistry — singleton that manages loaded ThemePacks and the current
 * active theme.  It decouples theme loading from React rendering; the React
 * ThemeContext reads from it reactively.
 */

import type { ThemePack } from './ThemePack.js';

type ChangeListener = (pack: ThemePack) => void;

class ThemeRegistryClass {
  private packs: Map<string, ThemePack> = new Map();
  private activeId: string | null = null;
  private listeners: Set<ChangeListener> = new Set();

  /** Register a ThemePack.  Safe to call multiple times with the same id. */
  register(pack: ThemePack): void {
    this.packs.set(pack.id, pack);
  }

  /** Replace the list of known packs (called when extension sends a bulk update). */
  setAll(packs: ThemePack[]): void {
    this.packs.clear();
    for (const p of packs) {
      this.packs.set(p.id, p);
    }
    // If active theme was removed, fall back to first available
    if (this.activeId && !this.packs.has(this.activeId)) {
      const first = this.packs.keys().next().value;
      this.activeId = first ?? null;
    }
    if (this.activeId) this._notify();
  }

  /** Activate a theme by id.  Silently ignores unknown ids. */
  setActive(id: string): void {
    if (!this.packs.has(id)) return;
    this.activeId = id;
    this._notify();
  }

  /** Returns the active ThemePack, or undefined if none is loaded yet. */
  getActive(): ThemePack | undefined {
    return this.activeId ? this.packs.get(this.activeId) : undefined;
  }

  /** Returns all registered packs as an array. */
  getAll(): ThemePack[] {
    return Array.from(this.packs.values());
  }

  /** Subscribe to active-theme changes.  Returns an unsubscribe function. */
  subscribe(fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private _notify(): void {
    const pack = this.getActive();
    if (!pack) return;
    for (const fn of this.listeners) {
      fn(pack);
    }
  }
}

/** Singleton instance shared across the webview. */
export const ThemeRegistry = new ThemeRegistryClass();
