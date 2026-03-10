import { useEffect, useRef, useState } from 'react';

import type { WorkspaceFolder } from '../hooks/useExtensionMessages.js';
import { vscode } from '../vscodeApi.js';
import { SettingsModal } from './SettingsModal.js';

interface BottomToolbarProps {
  isEditMode: boolean;
  onToggleEditMode: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  workspaceFolders: WorkspaceFolder[];
  selectedAgent: number | null;
  onOpenCharacterPicker: (agentId: number) => void;
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 10,
  left: 10,
  zIndex: 'var(--pixel-controls-z)',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  padding: '4px 6px',
  boxShadow: 'var(--pixel-shadow)',
};

const btnBase: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: '24px',
  color: 'var(--pixel-text)',
  background: 'var(--pixel-btn-bg)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
};

const btnActive: React.CSSProperties = {
  ...btnBase,
  background: 'var(--pixel-active-bg)',
  border: '2px solid var(--pixel-accent)',
};

export function BottomToolbar({
  isEditMode,
  onToggleEditMode,
  isDebugMode,
  onToggleDebugMode,
  workspaceFolders,
  selectedAgent,
  onOpenCharacterPicker,
}: BottomToolbarProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [hoveredFolder, setHoveredFolder] = useState<number | null>(null);
  const [backend, setBackend] = useState<'claude' | 'copilot'>('claude');
  const [isBackendPickerOpen, setIsBackendPickerOpen] = useState(false);
  const folderPickerRef = useRef<HTMLDivElement>(null);
  const backendPickerRef = useRef<HTMLDivElement>(null);

  // Close folder picker on outside click
  useEffect(() => {
    if (!isFolderPickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) {
        setIsFolderPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isFolderPickerOpen]);

  // Close backend picker on outside click
  useEffect(() => {
    if (!isBackendPickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (backendPickerRef.current && !backendPickerRef.current.contains(e.target as Node)) {
        setIsBackendPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isBackendPickerOpen]);

  const hasMultipleFolders = workspaceFolders.length > 1;

  const handleAgentClick = () => {
    if (hasMultipleFolders) {
      setIsFolderPickerOpen((v) => !v);
    } else {
      vscode.postMessage({ type: 'openClaude', backend });
    }
  };

  const handleFolderSelect = (folder: WorkspaceFolder) => {
    setIsFolderPickerOpen(false);
    vscode.postMessage({ type: 'openClaude', folderPath: folder.path, backend });
  };

  return (
    <div style={panelStyle}>
      {/* Backend selector — small ▾ button showing Claude/Copilot */}
      <div ref={backendPickerRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setIsBackendPickerOpen((v) => !v)}
          title={`Backend: ${backend}`}
          style={{
            ...btnBase,
            padding: '5px 7px',
            fontSize: '18px',
            background: isBackendPickerOpen ? 'var(--pixel-active-bg)' : 'var(--pixel-btn-bg)',
            border: isBackendPickerOpen ? '2px solid var(--pixel-accent)' : '2px solid transparent',
          }}
        >
          {backend === 'copilot' ? '🤖' : '🧠'}
        </button>
        {isBackendPickerOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 4,
              background: 'var(--pixel-bg)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
              boxShadow: 'var(--pixel-shadow)',
              minWidth: 130,
              zIndex: 'var(--pixel-controls-z)',
            }}
          >
            {(['claude', 'copilot'] as const).map((b) => (
              <button
                key={b}
                onClick={() => {
                  setBackend(b);
                  setIsBackendPickerOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  fontSize: '20px',
                  color: b === backend ? 'var(--pixel-accent)' : 'var(--pixel-text)',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 0,
                  cursor: 'pointer',
                  fontWeight: b === backend ? 'bold' : 'normal',
                }}
              >
                {b === 'copilot' ? '🤖 Copilot' : '🧠 Claude'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={folderPickerRef} style={{ position: 'relative' }}>
        <button
          onClick={handleAgentClick}
          onMouseEnter={() => setHovered('agent')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...btnBase,
            padding: '5px 12px',
            background:
              hovered === 'agent' || isFolderPickerOpen
                ? 'var(--pixel-agent-hover-bg)'
                : 'var(--pixel-agent-bg)',
            border: '2px solid var(--pixel-agent-border)',
            color: 'var(--pixel-agent-text)',
          }}
        >
          + Agent
        </button>
        {isFolderPickerOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 4,
              background: 'var(--pixel-bg)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
              boxShadow: 'var(--pixel-shadow)',
              minWidth: 160,
              zIndex: 'var(--pixel-controls-z)',
            }}
          >
            {workspaceFolders.map((folder, i) => (
              <button
                key={folder.path}
                onClick={() => handleFolderSelect(folder)}
                onMouseEnter={() => setHoveredFolder(i)}
                onMouseLeave={() => setHoveredFolder(null)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  fontSize: '22px',
                  color: 'var(--pixel-text)',
                  background: hoveredFolder === i ? 'var(--pixel-btn-hover-bg)' : 'transparent',
                  border: 'none',
                  borderRadius: 0,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {folder.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onToggleEditMode}
        onMouseEnter={() => setHovered('edit')}
        onMouseLeave={() => setHovered(null)}
        style={
          isEditMode
            ? { ...btnActive }
            : {
                ...btnBase,
                background: hovered === 'edit' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
              }
        }
        title="Edit office layout"
      >
        Layout
      </button>
      <button
        onClick={() => {
          if (selectedAgent !== null) onOpenCharacterPicker(selectedAgent);
        }}
        onMouseEnter={() => setHovered('character')}
        onMouseLeave={() => setHovered(null)}
        disabled={selectedAgent === null}
        title={
          selectedAgent !== null
            ? `Pick character for Agent ${selectedAgent}`
            : 'Select an agent first'
        }
        style={{
          ...btnBase,
          background: hovered === 'character' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
          opacity: selectedAgent === null ? 0.45 : 1,
          cursor: selectedAgent === null ? 'default' : 'pointer',
        }}
      >
        ★ Char
      </button>
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setIsSettingsOpen((v) => !v)}
          onMouseEnter={() => setHovered('settings')}
          onMouseLeave={() => setHovered(null)}
          style={
            isSettingsOpen
              ? { ...btnActive }
              : {
                  ...btnBase,
                  background:
                    hovered === 'settings' ? 'var(--pixel-btn-hover-bg)' : btnBase.background,
                }
          }
          title="Settings"
        >
          Settings
        </button>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isDebugMode={isDebugMode}
          onToggleDebugMode={onToggleDebugMode}
        />
      </div>
    </div>
  );
}
