#!/usr/bin/env node
/**
 * build-pokemon-catalog.ts
 *
 * Scans the Pokemon/ folder at the workspace root, produces:
 *   webview-ui/public/assets/themes/pokemon/catalog.json
 *
 * The script does NOT copy sprite files — the PixelAgentsViewProvider converts
 * them to data-URIs at runtime so the webview stays within CSP.  This catalog
 * just maps IDs → metadata.
 *
 * Usage (from workspace root):
 *   npx tsx scripts/build-pokemon-catalog.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POKEMON_DIR = path.join(ROOT, 'Pokemon');
const POKEMON_SHINY_DIR = path.join(ROOT, 'Pokemon Shiny');
const OUT_FILE = path.join(
  ROOT,
  'webview-ui',
  'public',
  'assets',
  'themes',
  'pokemon',
  'catalog.json',
);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert "ALCREMIE_1" → { baseName: "ALCREMIE", formIndex: 1 } */
function parseFilename(noExt: string): { baseName: string; formIndex: number | null } {
  const match = noExt.match(/^(.+?)(?:_(\d+))?$/);
  if (!match) return { baseName: noExt, formIndex: null };
  return {
    baseName: match[1],
    formIndex: match[2] !== undefined ? parseInt(match[2], 10) : null,
  };
}

/**
 * Build a lookup set of all shiny sprite filenames available in Pokemon Shiny/.
 * Keys are lowercase filenames for case-insensitive matching.
 */
function buildShinySet(dir: string): Set<string> {
  if (!fs.existsSync(dir)) return new Set<string>();
  return new Set(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.toLowerCase()),
  );
}

/** Title-case: "BULBASAUR" → "Bulbasaur", "MR_MIME" → "Mr. Mime" */
function toDisplayName(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMr\b/i, 'Mr.')
    .replace(/\bMs\b/i, 'Ms.')
    .replace(/\bMrs\b/i, 'Mrs.');
}

// ── Catalog entry shape ───────────────────────────────────────────────────────

interface CatalogEntry {
  id: string;
  label: string;
  /** Path relative to the Pokemon/ folder */
  spriteFile: string;
  /** Path relative to the Pokemon Shiny/ folder (present when a shiny sprite exists) */
  shinySpriteFile?: string;
  formVariants?: Array<{ id: string; label: string; spriteFile: string; shinySpriteFile?: string }>;
  spriteWidth: number;
  spriteHeight: number;
  tags: string[];
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!fs.existsSync(POKEMON_DIR)) {
  console.error(`[build-pokemon-catalog] Pokemon/ not found at ${POKEMON_DIR}`);
  process.exit(1);
}

const shinySet = buildShinySet(POKEMON_SHINY_DIR);
console.log(`[build-pokemon-catalog] Found ${shinySet.size} shiny sprites in Pokemon Shiny/`);

const pngs = fs
  .readdirSync(POKEMON_DIR)
  .filter((f) => f.endsWith('.png') && f !== '000.png')
  .sort();

/** Map baseName → list of form variant filenames */
const formMap = new Map<string, string[]>();

for (const file of pngs) {
  const { baseName, formIndex } = parseFilename(path.basename(file, '.png'));
  if (!formMap.has(baseName)) formMap.set(baseName, []);
  if (formIndex !== null) {
    formMap.get(baseName)!.push(file);
  } else {
    // Put the base form at index 0
    formMap.get(baseName)!.unshift(file);
  }
}

const entries: CatalogEntry[] = [];

/** Return shinySpriteFile if a matching file exists in Pokemon Shiny/ (case-insensitive). */
function resolveShiny(spriteFile: string): string | undefined {
  return shinySet.has(spriteFile.toLowerCase()) ? spriteFile : undefined;
}

for (const [baseName, files] of formMap) {
  const baseFile = files[0]; // always first — base or only form
  const forms = files.slice(1);

  const entry: CatalogEntry = {
    id: baseName.toLowerCase(),
    label: toDisplayName(baseName),
    spriteFile: baseFile,
    spriteWidth: 16,
    spriteHeight: 16,
    tags: [],
  };

  const shinyFile = resolveShiny(baseFile);
  if (shinyFile) entry.shinySpriteFile = shinyFile;

  if (forms.length > 0) {
    entry.formVariants = forms.map((f, i) => {
      const noExt = path.basename(f, '.png');
      const variant: { id: string; label: string; spriteFile: string; shinySpriteFile?: string } = {
        id: noExt.toLowerCase(),
        label: `${toDisplayName(baseName)} (Form ${i + 1})`,
        spriteFile: f,
      };
      const shiny = resolveShiny(f);
      if (shiny) variant.shinySpriteFile = shiny;
      return variant;
    });
  }

  entries.push(entry);
}

// Sort by display label
entries.sort((a, b) => a.label.localeCompare(b.label));

const catalog = {
  version: 1,
  generatedAt: new Date().toISOString(),
  totalCharacters: entries.length,
  characters: entries,
};

const outDir = path.dirname(OUT_FILE);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(OUT_FILE, JSON.stringify(catalog, null, 2), 'utf-8');
console.log(
  `[build-pokemon-catalog] ✅  Wrote ${entries.length} characters to ${path.relative(ROOT, OUT_FILE)}`,
);
