/**
 * CharacterPicker.tsx
 *
 * A modal that lets the user assign a Pokémon character to each agent slot.
 * Works with the active ThemePack's character list; gracefully shows an empty
 * state when the theme isn't loaded yet.
 */

import { useMemo, useState } from 'react';

import {
  getPokemonShinySpriteUri,
  getPokemonSpriteUri,
} from '../office/sprites/pokemonUriStore.js';
import { useTheme } from '../themes/ThemeContext.js';
import type { CharacterPackEntry } from '../themes/ThemePack.js';
import { vscode } from '../vscodeApi.js';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CharacterPickerProps {
  /** The agent id we're assigning a character to */
  agentId: number;
  /** Agent display name / label */
  agentLabel?: string;
  onClose: () => void;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  background: 'rgba(0, 0, 0, 0.65)',
  zIndex: 60,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const modalStyle: React.CSSProperties = {
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-border)',
  padding: '8px',
  boxShadow: 'var(--pixel-shadow)',
  width: 'min(520px, 90vw)',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid var(--pixel-border)',
  paddingBottom: 6,
};

const searchStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  fontSize: '18px',
  background: 'var(--vscode-input-background)',
  color: 'var(--vscode-input-foreground)',
  border: '1px solid var(--pixel-border)',
  outline: 'none',
  boxSizing: 'border-box',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
  gap: 4,
  overflowY: 'auto',
  flex: 1,
  padding: 2,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CharacterPicker({ agentId, agentLabel, onClose }: CharacterPickerProps) {
  const { activeTheme, assignCharacter, getCharacterFor } = useTheme();
  const currentAssignment = getCharacterFor(agentId);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(
    currentAssignment?.characterId ?? null,
  );
  const [isShiny, setIsShiny] = useState(currentAssignment?.isShiny ?? false);

  const characters = activeTheme?.characters ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter((c) => c.label.toLowerCase().includes(q) || c.id.includes(q));
  }, [characters, search]);

  function handleConfirm() {
    if (!selectedId) return;
    assignCharacter(agentId, selectedId, isShiny);
    vscode.postMessage({ type: 'characterAssigned', agentId, characterId: selectedId, isShiny });
    onClose();
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <span style={{ fontSize: '22px', color: 'rgba(255,255,255,0.9)' }}>
            Choose character
            {agentLabel ? ` for ${agentLabel}` : ''}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            X
          </button>
        </div>

        {/* Search */}
        <input
          style={searchStyle}
          placeholder="Search Pokémon…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        {/* Shiny toggle */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '18px',
            color: 'rgba(255,255,255,0.75)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(255,255,255,0.5)',
              background: isShiny ? 'rgba(220,200,80,0.8)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              color: '#fff',
              cursor: 'pointer',
            }}
            onClick={() => setIsShiny((v) => !v)}
          >
            {isShiny ? '★' : ''}
          </span>
          Shiny variant
        </label>

        {/* Sprite grid */}
        <div style={gridStyle}>
          {filtered.length === 0 && (
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '18px', padding: 8 }}>
              No characters found
            </span>
          )}
          {filtered.map((ch) => (
            <CharacterTile
              key={ch.id}
              character={ch}
              isSelected={selectedId === ch.id}
              isShiny={isShiny}
              onSelect={() => setSelectedId(ch.id)}
            />
          ))}
        </div>

        {/* Confirm */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '4px 14px',
              fontSize: '18px',
              background: 'transparent',
              border: '1px solid var(--pixel-border)',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedId}
            style={{
              padding: '4px 14px',
              fontSize: '18px',
              background: selectedId ? 'rgba(90,140,255,0.75)' : 'rgba(80,80,80,0.4)',
              border: '1px solid var(--pixel-border)',
              color: '#fff',
              cursor: selectedId ? 'pointer' : 'default',
            }}
          >
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}

function CharacterTile({
  character,
  isSelected,
  isShiny,
  onSelect,
}: {
  character: CharacterPackEntry;
  isSelected: boolean;
  isShiny: boolean;
  onSelect: () => void;
}) {
  // Prefer real shiny sprite from Pokemon Shiny/ folder; fall back to CSS filter
  const hasRealShiny = isShiny && !!character.shinySpriteFile;
  const spriteUri = hasRealShiny
    ? getPokemonShinySpriteUri(character.shinySpriteFile!)
    : getPokemonSpriteUri(character.spriteFile);
  const cssFilter = isShiny && !hasRealShiny ? 'hue-rotate(120deg) saturate(1.4)' : undefined;

  return (
    <div
      onClick={onSelect}
      title={character.label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '4px 2px',
        cursor: 'pointer',
        border: isSelected ? '2px solid rgba(90,140,255,0.9)' : '2px solid transparent',
        background: isSelected ? 'rgba(90,140,255,0.15)' : 'transparent',
      }}
    >
      {spriteUri ? (
        <img
          src={spriteUri}
          alt={character.label}
          width={32}
          height={32}
          style={{
            imageRendering: 'pixelated',
            filter: cssFilter,
          }}
        />
      ) : (
        <div
          style={{
            width: 32,
            height: 32,
            background: 'rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          ?
        </div>
      )}
      <span
        style={{
          fontSize: '11px',
          color: 'rgba(255,255,255,0.7)',
          textAlign: 'center',
          wordBreak: 'break-word',
          lineHeight: 1.2,
          maxWidth: 72,
        }}
      >
        {character.label}
      </span>
    </div>
  );
}
