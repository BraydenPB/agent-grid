# Agent Grid

A fast, cross-platform, open-source desktop app for running multiple AI coding terminals in parallel. Think **Lemonade, but open source and extensible**.

Run Claude Code, Codex, Gemini CLI, Aider, OpenCode, or any CLI tool side-by-side in a configurable terminal grid — powered by real PTY sessions, not fake terminal emulators.

## Why Agent Grid?

- **Open source (MIT)** — no license limits, no paywall
- **Lightweight** — Tauri v2 (~50 MB), not Electron
- **Cross-platform** — Windows, macOS, Linux from day one
- **Real terminals** — full PTY sessions with xterm.js + WebGL rendering
- **Configurable grid** — drag, resize, and save layouts (1–16 panes)
- **Profile system** — one-click launch for any AI coding tool
- **Extensible** — architecture ready for plugins, panels, and orchestration

## Stack

| Layer     | Technology                                                       |
| --------- | ---------------------------------------------------------------- |
| Framework | [Tauri v2](https://v2.tauri.app) (Rust backend + system WebView) |
| Frontend  | React 19 + TypeScript                                            |
| Terminal  | [xterm.js](https://xtermjs.org) with WebGL renderer              |
| PTY       | [tauri-plugin-pty](https://github.com/Tnze/tauri-plugin-pty)     |
| State     | [Zustand](https://zustand.docs.pmnd.rs)                          |
| Layout    | [Dockview](https://dockview.dev) (IDE-style docking)             |
| Styling   | [Tailwind CSS v4](https://tailwindcss.com)                       |
| Icons     | [Lucide](https://lucide.dev)                                     |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) >= 18
- [Rust](https://rustup.rs) >= 1.77
- Platform-specific Tauri dependencies — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Install & Run

```bash
git clone https://github.com/BraydenPB/agent-grid.git
cd agent-grid
npm install
npm run tauri dev
```

Pre-built binaries are published on the [Releases](https://github.com/BraydenPB/agent-grid/releases) page.

### Build for Production

```bash
npm run tauri build
```

## Architecture

```
agent-grid/
├── src/                     # React frontend
│   ├── app/                 # Root app component
│   ├── components/          # Shared UI (app bar, sidebar)
│   ├── features/
│   │   ├── terminals/       # Terminal pane + grid
│   │   ├── workspaces/      # Workspace management (planned)
│   │   └── tasks/           # Task orchestration (planned)
│   ├── lib/                 # Utilities, profiles, presets
│   ├── store/               # Zustand state stores
│   └── types/               # TypeScript interfaces
├── src-tauri/               # Rust backend
│   ├── src/
│   │   ├── lib.rs           # Plugin registration
│   │   └── main.rs          # Entry point
│   ├── capabilities/        # Tauri permission capabilities
│   ├── Cargo.toml
│   └── tauri.conf.json
└── index.html
```

## Roadmap

### MVP (current)

- [x] Configurable terminal grid (drag + resize)
- [x] PTY-backed terminal panes
- [x] Built-in profiles for AI coding tools
- [x] Quick layout presets (single, 2×2, 3-col, etc.)
- [ ] Saved/loadable workspaces (JSON persistence)
- [ ] Status bar with usage tracking
- [ ] Custom profile editor

### Studio Phase

- [ ] Drag-and-drop panel system (Agent, Browser, Notes, Code Editor)
- [ ] Monaco code editor panel
- [ ] Git diff viewer panel
- [ ] Embedded browser panel
- [ ] Task/Kanban panel

### Cluster Phase

- [ ] Multi-agent orchestration layer
- [ ] Auto task queuing + skill-based assignment
- [ ] Native git worktree isolation per agent
- [ ] Real-time inter-agent collaboration

### Ecosystem

- [ ] Local LLM support (Ollama integration)
- [ ] GitHub / Linear / Obsidian connectors
- [ ] Plugin marketplace
- [ ] Auto-updates via GitHub releases
- [ ] Voice input
- [ ] Inline diff review + permission widgets

## License

[MIT](LICENSE)
