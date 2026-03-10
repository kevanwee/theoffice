/**
 * pokemonSpriteCache.ts
 *
 * Manages a small in-memory cache of HTMLImageElement objects for Pokémon
 * sprites.  The extension host sends sprites as data-URIs via postMessage;
 * this module queues pending loads and resolves them as images arrive.
 */

type Listener = (img: HTMLImageElement) => void;

interface CacheEntry {
  img: HTMLImageElement;
  ready: boolean;
}

class PokemonSpriteCacheClass {
  private cache: Map<string, CacheEntry> = new Map();
  private listeners: Map<string, Set<Listener>> = new Map();

  /**
   * Load a sprite from a data-URI string.
   * Safe to call multiple times — subsequent calls are no-ops if already loaded.
   */
  put(id: string, dataUri: string): HTMLImageElement {
    const existing = this.cache.get(id);
    if (existing?.ready) return existing.img;

    const img = new Image();
    const entry: CacheEntry = { img, ready: false };
    this.cache.set(id, entry);

    img.onload = () => {
      entry.ready = true;
      const cbs = this.listeners.get(id);
      if (cbs) {
        for (const cb of cbs) cb(img);
        this.listeners.delete(id);
      }
    };
    img.src = dataUri;
    return img;
  }

  /**
   * Get a cached image synchronously.
   * Returns undefined if not loaded yet — use whenReady for async.
   */
  get(id: string): HTMLImageElement | undefined {
    const entry = this.cache.get(id);
    return entry?.ready ? entry.img : undefined;
  }

  /**
   * Returns a Promise that resolves once the image is loaded.
   * If already cached, resolves immediately.
   */
  whenReady(id: string): Promise<HTMLImageElement> {
    const entry = this.cache.get(id);
    if (entry?.ready) return Promise.resolve(entry.img);

    return new Promise((resolve) => {
      if (!this.listeners.has(id)) this.listeners.set(id, new Set());
      this.listeners.get(id)!.add(resolve);
    });
  }

  /** True if the sprite is loaded and ready to draw. */
  isReady(id: string): boolean {
    return this.cache.get(id)?.ready === true;
  }

  /** Bulk-load from a map { characterId: dataUri } */
  putAll(sprites: Record<string, string>): void {
    for (const [id, uri] of Object.entries(sprites)) {
      this.put(id, uri);
    }
  }

  /** Clear the entire cache (call on extension deactivation). */
  clear(): void {
    this.cache.clear();
    this.listeners.clear();
  }
}

/** Singleton instance used across the webview. */
export const PokemonSpriteCache = new PokemonSpriteCacheClass();
