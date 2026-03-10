# Changelog

## v0.1.0

Initial release of **The Office** — a Pokémon-themed VS Code extension that visualises AI coding agents as animated Pokémon characters.

### Features

- **1,044 Pokémon characters** — full sprite catalog with all forms and regional variants, generated from local `Pokemon/` folder
- **Shiny variants** — toggling ✦ Shiny in the character picker uses real sprites from `Pokemon Shiny/` folder (1,042 Pokémon have shiny sprites)
- **Searchable character picker** — find any Pokémon by name with instant filtering
- **Multi-backend support** — Claude Code (JSONL watching), GitHub Copilot (vscode.lm API), OpenAI Codex (JSONL watching)
- **ORAS-style scenes** — five scene backgrounds from the LeoB ORAS Pokémon tileset: Littleroot Town, Route 102, Oldale Town, Petalburg City, Rustboro City
- **ThemePack plugin architecture** — swap entire visual themes; community themes are supported
- **Per-tool animation** — Pokémon animate based on what the agent is doing (typing, reading, running, searching, waiting)
- **Speech bubbles** — visual waiting/permission indicators
- **Sound notifications** — ascending chime when an agent finishes its turn
- **Sub-agent visualisation** — Task tool sub-agents spawn as their own Pokémon linked to the parent
- **Office layout editor** — floors, walls, furniture, full HSBC colour controls, undo/redo
- **Persistent layouts** — saved to `~/.the-office/layout.json`, shared across VS Code windows
- **Export/Import layouts** — share layouts as JSON files

### Architecture

Based on the [Pixel Agents](https://github.com/pablodelucca/pixel-agents) engine by Pablo De Lucca (MIT), extended with:
- `IAgentAdapter` / `ClaudeAdapter` / `CopilotAdapter` / `CodexAdapter` — pluggable backend system
- `ThemePack` / `ThemeRegistry` / `ThemeContext` — full React theme plugin system
- `pokemonUriStore` — vscode-resource: URI routing for local sprite folders
- `build-pokemon-catalog.ts` — automated catalog generation from sprite folders
