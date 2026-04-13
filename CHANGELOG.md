# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0-alpha.1] - 2026-04-12

Opens the v0.2.0 pre-release cycle. Layout system is now unified across the
dashboard grid and worktree dockview; adds nested workspace safety and major
UX work on top of v0.1.0-beta.1.

### Added

- Unified layout module (`src/features/layouts`) — single source of truth for
  dashboard tile grids and Dockview splits, with a declarative preset tree
- Multi-select projects with built-in layout presets
- Nested workspace safety checks to prevent worktree collisions
- Global default terminal profile, selectable from the titlebar "New" menu
- Persisted custom layout presets
- UNC/WSL path normalization when opening projects
- Expanded test coverage (246 tests across workspace store, terminal
  registry, and layout engine)
- Release workflow (`.github/workflows/release.yml`) that builds Tauri
  binaries for Windows, macOS (arm64), and Linux on tag push
- `SECURITY.md` with private vulnerability reporting guidance

### Fixed

- Backend tokio runtime override so multi-terminal output no longer blocks
- PowerShell call-operator quoting, dockview listener cleanup, and lockfile
  sync edge cases

### Known Limitations

Same as `v0.1.0-beta.1` — no code signing, no auto-updater, terminal
history lost on preset switch, ~1.5 MB JS bundle.

## [0.1.0-beta.1] - 2026-04-08

First public pre-release. Core terminal multiplexer is functional and security-hardened.

### Added

- Multi-pane terminal grid with IDE-style docking (Dockview)
- Drag-to-dock, tab reordering, split panes, floating panels
- Built-in profiles for Claude Code, Codex, Gemini CLI, Aider, OpenCode, and system shell
- xterm.js v6 with WebGL renderer, ligatures, unicode 11, image protocol, and search
- Custom dark theme with glassmorphic UI
- Layout presets (Single, 2-col, 3-col, 2x2, 3+1)
- Command palette (Ctrl+Shift+P) with fuzzy search
- Project browser (Ctrl+K) with git branch/dirty status
- Pane status indicators (working, idle, done, error, attention)
- Per-pane color overrides via context menu
- Keyboard shortcuts for split, navigate, maximize, font zoom
- Directional pane navigation (Ctrl+Alt+Arrows)
- Status bar with context-aware shortcut hints
- Terminal search (Ctrl+Shift+F) with regex support
- Context menu with copy, paste, clear, reset, profile switch, directory change
- Error boundary with layout reset recovery
- Custom frameless window with drag-to-move titlebar

### Security

- Content Security Policy configured (strict default-src 'self')
- Shell injection prevention via proper argument quoting (bash and PowerShell)
- Path traversal prevention via canonicalize() in Rust backend
- Minimal Tauri permissions (no filesystem/network/shell-execute beyond PTY)
- Git status check with 2-second timeout to prevent hanging
- PTY spawn race condition guarding via sequence counters

### Known Limitations

- Terminal scroll history and running processes are lost on preset switch (PTY respawns)
- No auto-updater — manual download required for updates
- No code signing — OS security warnings on first launch
- 1.5MB JS bundle — no code splitting yet
- WSL2 `/mnt/c` paths not recognized in CWD detection
