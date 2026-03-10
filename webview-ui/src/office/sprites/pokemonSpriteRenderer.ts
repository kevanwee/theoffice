/**
 * pokemonSpriteRenderer.ts
 *
 * Draws a Pokémon sprite onto a Canvas 2D context using programmatic canvas
 * transforms to animate state — no separate sprite sheets needed.
 *
 * All rendering uses imageSmoothingEnabled = false so sprites stay crisp when
 * scaled up via the global zoom factor.
 */

import type { AgentAnimationHint } from '../../../../src/agentAdapters/IAgentAdapter.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SPRITE_SIZE_PX = 16; // source sprite is always 16 × 16

// Shiny sparkle overlay color
const SHINY_SPARKLE_COLOR = 'rgba(220, 240, 255, 0.55)';

// ── Animation helpers ─────────────────────────────────────────────────────────

/** Smooth sine wave on the range [0, 1] — t in seconds */
function sine(t: number, freq: number): number {
  return (Math.sin(t * freq * Math.PI * 2) + 1) * 0.5;
}

// ── Main draw function ────────────────────────────────────────────────────────

export type PokemonSpriteState = AgentAnimationHint | 'walk';

/**
 * Draw a single Pokémon sprite with state-driven animation.
 *
 * @param ctx    Canvas 2D context (NOT saved/restored here — caller handles that)
 * @param img    HTMLImageElement for the sprite
 * @param cx     Centre-X in canvas pixels (after zoom)
 * @param cy     Centre-Y in canvas pixels (after zoom)
 * @param state  Animation hint
 * @param t      Elapsed time in seconds (from requestAnimationFrame timestamp / 1000)
 * @param scale  Zoom scale factor (default 1 — draw at native 16 × 16)
 * @param isShiny Apply shiny sparkle overlay
 */
export function drawPokemonSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  state: PokemonSpriteState,
  t: number,
  scale = 1,
  isShiny = false,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const hw = (SPRITE_SIZE_PX * scale) / 2;
  const hh = (SPRITE_SIZE_PX * scale) / 2;

  // ── Compute transform per state ─────────────────────────────────────────────

  let tx = cx;
  let ty = cy;
  let sx = 1;
  let sy = 1;
  let rot = 0;
  let alpha = 1;

  switch (state) {
    case 'idle': {
      // Gentle 1 px bob at 0.7 Hz
      ty -= sine(t, 0.7) * scale;
      break;
    }
    case 'walk': {
      // Fast bounce at 2.2 Hz, ±2 px
      ty -= sine(t, 2.2) * 2 * scale;
      break;
    }
    case 'type': {
      // Scale pulse ±4 % at 3 Hz (typing rhythm)
      const pulse = 0.96 + sine(t, 3) * 0.08;
      sx = pulse;
      sy = pulse;
      break;
    }
    case 'read': {
      // Slow rock ±3 ° at 0.8 Hz
      rot = (sine(t, 0.8) - 0.5) * ((3 * Math.PI) / 180) * 2;
      break;
    }
    case 'search': {
      // Small horizontal sway at 1.4 Hz
      tx += (sine(t, 1.4) - 0.5) * 3 * scale;
      break;
    }
    case 'run': {
      // Fast vertical bounce at 4 Hz (running code)
      ty -= sine(t, 4) * 3 * scale;
      sx = 1 + sine(t, 4) * 0.05;
      break;
    }
    case 'wait': {
      // Slow opacity blink at 0.6 Hz — down to 40 % alpha
      alpha = 0.4 + sine(t, 0.6) * 0.6;
      break;
    }
  }

  // ── Apply transform ─────────────────────────────────────────────────────────

  ctx.globalAlpha = alpha;
  ctx.translate(tx, ty);
  if (rot !== 0) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);

  // ── Draw sprite ─────────────────────────────────────────────────────────────

  ctx.drawImage(img, -hw, -hh, SPRITE_SIZE_PX * scale, SPRITE_SIZE_PX * scale);

  // ── Shiny sparkle overlay ───────────────────────────────────────────────────

  if (isShiny) {
    // Draw a very subtle radial shimmer on top
    const sparklePhase = (sine(t, 1.5) - 0.5) * 2; // -1 to 1
    const r = hw * 0.6 + sparklePhase * hw * 0.2;
    const grad = ctx.createRadialGradient(0, -hh * 0.3, 0, 0, -hh * 0.3, r);
    grad.addColorStop(0, SHINY_SPARKLE_COLOR);
    grad.addColorStop(1, 'rgba(220, 240, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-hw, -hh, SPRITE_SIZE_PX * scale, SPRITE_SIZE_PX * scale);
  }

  ctx.restore();
}

// ── Multi-character draw ───────────────────────────────────────────────────────

export interface PokemonCharacterRenderInfo {
  img: HTMLImageElement;
  cx: number;
  cy: number;
  state: PokemonSpriteState;
  isShiny?: boolean;
}

/**
 * Draw multiple characters in one call.
 * Sorts by cy so characters further down overlay those higher up (depth sort).
 */
export function drawPokemonCharacters(
  ctx: CanvasRenderingContext2D,
  characters: PokemonCharacterRenderInfo[],
  t: number,
  scale = 1,
): void {
  const sorted = [...characters].sort((a, b) => a.cy - b.cy);
  for (const ch of sorted) {
    drawPokemonSprite(ctx, ch.img, ch.cx, ch.cy, ch.state, t, scale, ch.isShiny ?? false);
  }
}
