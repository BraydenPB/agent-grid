# Agent Grid — Roadmap

## v0.1.0-beta.1 (Released 2026-04-08)

Core multi-pane AI terminal. Security-audited, no known vulnerabilities.

### Shipped

- [x] Tauri v2 + React 19 + TypeScript scaffold
- [x] PTY-backed terminal panes (xterm.js v6 + WebGL)
- [x] Dockview IDE-style layout (tabs, splits, floating panels, drag-to-dock)
- [x] Built-in profiles: Shell, Claude Code, Codex, Gemini CLI, Aider, OpenCode
- [x] 5 layout presets (Single, 2-col, 3-col, 2x2, 3+1)
- [x] Zustand state store with terminal registry
- [x] Cross-platform shell resolution with injection prevention
- [x] Command palette (Ctrl+Shift+P)
- [x] Project browser (Ctrl+K) with git branch/dirty status
- [x] Pane status indicators (working, idle, done, error, attention)
- [x] Terminal search (Ctrl+Shift+F) with regex
- [x] Context menu with profile switching, directory change, split, colors
- [x] Keyboard shortcuts (split, navigate, maximize, font zoom, directional nav)
- [x] Shortcut bar with context-aware hints
- [x] Error boundary with layout reset recovery
- [x] Custom frameless window with drag-to-move titlebar
- [x] Layout persistence (localStorage)
- [x] Per-pane color overrides
- [x] CI pipeline (GitHub Actions)
- [x] Conventional Commits + Husky + lint-staged

---

## v1.0 — Stable Release

See [v1-release-checklist.md](v1-release-checklist.md) for the full prioritized audit.

### Blocking

- [ ] Test coverage for security-critical functions (shell quoting, path normalization, layout validation)
- [ ] Code signing (Windows EV cert + macOS Developer ID)
- [ ] Auto-updater via `tauri-plugin-updater`
- [ ] Runtime validation for layout persistence (Zod or manual)
- [ ] Clipboard error handling

### Should Fix

- [ ] Bundle size optimization (1.5MB → code-split)
- [ ] ESLint warning cleanup (Dockview types, useEffect deps)
- [ ] PTY zombie prevention
- [ ] Error boundary production mode (hide stack traces)
- [ ] Shell command allowlist
- [ ] Upgrade lucide-react to v1.x

---

## v1.x — Studio

Modular panel system — not just terminals.

- [ ] Panel type system (terminal, browser, editor, notes, diff, kanban)
- [ ] Drag panels from sidebar into grid
- [ ] Monaco code editor panel
- [ ] Embedded browser panel (via Tauri WebView)
- [ ] Markdown notes panel
- [ ] Git diff viewer panel
- [ ] Panel-to-panel communication
- [ ] Custom layout saving and sharing

---

## v2.x — Cluster

Multi-agent orchestration.

- [ ] Task queue with assignment to specific panes
- [ ] Skill-based agent assignment
- [ ] Native git worktree isolation per agent pane
- [ ] Inter-agent context sharing
- [ ] Orchestration sidebar
- [ ] Supervisor mode

---

## v3.x — Ecosystem

Community and integrations.

- [ ] Plugin marketplace / registry
- [ ] Local LLM integration (Ollama)
- [ ] GitHub / Linear / Obsidian connectors
- [ ] Voice input
- [ ] AI-controlled browser automation
- [ ] Team/shared workspaces
- [ ] Light theme
