/**
 * pokemonUriStore.ts
 *
 * Holds the vscode-resource: base URIs for the Pokemon/ and Pokemon Shiny/
 * sprite folders. Populated once at startup when the extension sends
 * `pokemonBaseUri` and `pokemonShinyBaseUri` messages.
 */

let _baseUri: string | null = null;
let _shinyBaseUri: string | null = null;

export function setPokemonBaseUri(uri: string): void {
  _baseUri = uri;
}

export function setPokemonShinyBaseUri(uri: string): void {
  _shinyBaseUri = uri;
}

/** Full URL for a single regular sprite file, or null if base URI hasn't been received yet. */
export function getPokemonSpriteUri(spriteFile: string): string | null {
  if (!_baseUri) return null;
  return `${_baseUri.replace(/\/$/, '')}/${spriteFile}`;
}

/**
 * Full URL for a shiny sprite file from the Pokemon Shiny/ folder.
 * Returns null if the shiny base URI hasn't been received yet.
 */
export function getPokemonShinySpriteUri(spriteFile: string): string | null {
  if (!_shinyBaseUri) return null;
  return `${_shinyBaseUri.replace(/\/$/, '')}/${spriteFile}`;
}

/** Whether the base URI has been received from the extension. */
export function hasPokemonBaseUri(): boolean {
  return _baseUri !== null;
}
