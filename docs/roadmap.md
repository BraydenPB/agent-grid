# Agent Grid — Roadmap

## Phase 1: MVP (Current → v0.2)
Match Lemonade's core experience, open source.

### Done
- [x] Tauri v2 + React + TypeScript scaffold
- [x] PTY-backed terminal panes (xterm.js + WebGL)
- [x] Configurable grid layout (react-grid-layout)
- [x] Built-in profiles: Shell, Claude Code, Codex, Gemini CLI, Aider, OpenCode
- [x] 7 layout presets (Single → 4×4)
- [x] Zustand state store
- [x] Cross-platform shell resolution

### Next (UI/UX focus)
- [ ] Polish terminal pane chrome (drag handle, maximize, context menu)
- [ ] Sidebar profile cards with visual polish
- [ ] Layout preset thumbnails
- [ ] Keyboard shortcuts (Ctrl+T, Ctrl+W, Ctrl+Tab, etc.)
- [ ] App bar with workspace name editing
- [ ] Status bar
- [ ] Custom window controls (frameless option)
- [ ] Pane spawn/close animations
- [ ] Ship monospace font (Cascadia Code)
- [ ] Empty state / first-run experience

### Then (Persistence)
- [ ] Save/load workspaces to disk (JSON)
- [ ] Workspace switcher (tabs or dropdown)
- [ ] Custom profile editor UI
- [ ] Import/export workspaces
- [ ] Remember window size/position

### v0.2 Release
- [ ] Real app icon + branding
- [ ] GitHub repo setup
- [ ] GitHub Actions CI (build + release)
- [ ] Auto-update via GitHub releases

---

## Phase 2: Studio (v0.3–v0.5)
Modular panel system — not just terminals.

- [ ] Panel type system (terminal, browser, editor, notes, diff, kanban)
- [ ] Drag panels from sidebar into grid
- [ ] Monaco code editor panel
- [ ] Embedded browser panel (via Tauri WebView)
- [ ] Markdown notes panel
- [ ] Git diff viewer panel
- [ ] Task/Kanban board panel
- [ ] Panel-to-panel communication (e.g., terminal output → notes)
- [ ] Tabbed panels within grid cells

---

## Phase 3: Cluster (v0.6+)
Multi-agent orchestration.

- [ ] Task queue with assignment to specific panes
- [ ] Skill-based agent assignment (route tasks to best tool)
- [ ] Native git worktree isolation per agent pane
- [ ] Inter-agent context sharing
- [ ] Orchestration sidebar (task status, agent activity)
- [ ] Supervisor mode (one agent coordinates others)

---

## Phase 4: Ecosystem (v1.0+)
Community and integrations.

- [ ] Plugin marketplace / registry
- [ ] Local LLM integration (Ollama)
- [ ] GitHub / Linear / Obsidian connectors
- [ ] Voice input
- [ ] AI-controlled browser automation
- [ ] Inline diff review + approval widgets
- [ ] Team/shared workspaces
- [ ] Light theme
