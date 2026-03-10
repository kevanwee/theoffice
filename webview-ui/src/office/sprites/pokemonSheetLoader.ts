/**
 * pokemonSheetLoader.ts
 *
 * Lazily loads Pokémon sprite-sheet PNGs by URL.  On first request the image
 * starts loading in the background; subsequent calls return the ready element
 * once loading is complete.  The renderer falls back to the old pixel-art
 * sprite while the image is still in flight.
 */

const _cache = new Map<string, HTMLImageElement | 'loading'>();

/**
 * Return the cached HTMLImageElement for the given cache key + URL, or null if
 * the image is still loading.  Triggers a load on first call.
 */
export function getOrLoadSheet(key: string, url: string): HTMLImageElement | null {
  const entry = _cache.get(key);
  if (entry instanceof HTMLImageElement) return entry;
  if (entry === 'loading') return null;

  const img = new Image();
  _cache.set(key, 'loading');
  img.onload = () => {
    _cache.set(key, img);
  };
  img.onerror = () => {
    // Remove from cache so a retry is possible next time a valid URI arrives
    _cache.delete(key);
  };
  img.src = url;
  return null;
}

/** Pre-invalidate a key so the next call triggers a fresh load (e.g. URI changed). */
export function invalidateSheet(key: string): void {
  _cache.delete(key);
}
