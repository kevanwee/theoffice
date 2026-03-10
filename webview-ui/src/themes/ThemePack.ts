/**
 * ThemePack — the contract that every theme plugin must satisfy.
 *
 * A ThemePack is self-contained: it declares all the characters and scenes it
 * ships, points at asset files relative to the pack's root, and carries
 * optional attribution metadata for CC-licensed content.
 */

// ── Character entries ──────────────────────────────────────────────────────────

export interface CharacterPackEntry {
  /** Unique ID within this pack, e.g. "bulbasaur", "ceruledge" */
  id: string;
  /** Human-readable display name */
  label: string;
  /** Path to the sprite PNG, relative to the theme's asset root */
  spriteFile: string;
  /** Path to the shiny-variant PNG (optional) */
  shinySpriteFile?: string;
  /** Natural width of sprite in pixels (default 16) */
  spriteWidth?: number;
  /** Natural height of sprite in pixels (default 16) */
  spriteHeight?: number;
  /** Pokédex number or other numeric ordering hint (optional) */
  dexNumber?: number;
  /** Arbitrary tags for filtering (e.g. ["starter", "legendary", "gen1"]) */
  tags?: string[];
}

// ── Tile definitions ──────────────────────────────────────────────────────────

export interface TileDefinition {
  /** Tile sheet column (0-based) */
  col: number;
  /** Tile sheet row (0-based) */
  row: number;
  /** Optional human-readable type label, e.g. "grass", "water", "path" */
  typeName?: string;
  /** Whether characters can walk through this tile */
  walkable?: boolean;
}

export interface TileCatalog {
  /** Source image path relative to the theme asset root */
  imageFile: string;
  /** Tile dimensions in pixels */
  tileWidth: number;
  tileHeight: number;
  /** Named tile definitions */
  tiles: Record<string, TileDefinition>;
}

// ── Scene entries ──────────────────────────────────────────────────────────────

export interface ScenePackEntry {
  /** Unique ID within this pack, e.g. "pallet-town", "pokemon-center" */
  id: string;
  /** Human-readable display name */
  label: string;
  /** Tileset PNG path relative to the theme asset root */
  tilesetFile?: string;
  /** JSON catalog describing tile positions & walkability */
  tileCatalogFile?: string;
  /** Default layout JSON used when no saved layout exists */
  defaultLayoutFile?: string;
  /**
   * Optional pre-rendered full-scene image used as the canvas background.
   * Shown behind characters; useful for GBA-style Pokémon ORAS scenes where
   * the full scene image is provided directly.
   */
  sceneImageFile?: string;
  /** Canvas clear color for transparent areas */
  backgroundColor: string;
  /** Tile IDs (from TileCatalog) that should receive programmatic animation */
  animatedTileIds?: string[];
}

// ── Attribution ───────────────────────────────────────────────────────────────

export interface Attribution {
  /** Author or organisation name */
  author: string;
  /** License short-form, e.g. "CC-BY 3.0" */
  license: string;
  /** URL pointing to the original source */
  url?: string;
}

// ── Top-level ThemePack ───────────────────────────────────────────────────────

export interface ThemePack {
  /** Globally unique theme ID, e.g. "pokemon", "office", "cyberpunk" */
  id: string;
  /** Human-readable theme name */
  name: string;
  /** Semantic version string, e.g. "1.0.0" */
  version: string;
  /**
   * All characters this theme provides.
   * May be empty when the pack uses characterCatalogFile to load characters
   * lazily at runtime.
   */
  characters: CharacterPackEntry[];
  /**
   * Optional path (relative to the theme asset root) to a catalog.json file
   * whose `characters` array will be merged into this pack at load time.
   * This keeps theme.json small when the character set is large (e.g. 1000+
   * Pokémon).
   */
  characterCatalogFile?: string;
  /** All scenes this theme provides */
  scenes: ScenePackEntry[];
  /** Scene rendered by default when theme is first activated */
  defaultSceneId: string;
  /** Character assigned to new agents when none is chosen yet */
  defaultCharacterId: string;
  /** Attribution entries for third-party assets */
  attribution?: Attribution[];
}

// ── Runtime helpers ───────────────────────────────────────────────────────────

/** Returns the character entry, or undefined if not found */
export function findCharacter(
  pack: ThemePack,
  characterId: string,
): CharacterPackEntry | undefined {
  return pack.characters.find((c) => c.id === characterId);
}

/** Returns the scene entry, or the default scene if not found */
export function resolveScene(pack: ThemePack, sceneId: string | undefined): ScenePackEntry {
  return pack.scenes.find((s) => s.id === sceneId) ?? pack.scenes[0];
}
