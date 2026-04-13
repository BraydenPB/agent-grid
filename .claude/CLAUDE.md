# Agent Grid

Open-source multi-pane AI terminal desktop app.

## Stack

- **Framework**: Tauri v2 (Rust backend + system WebView)
- **Frontend**: React 19 + TypeScript + Vite 6
- **Routing**: TanStack Router (type-safe file-based routing, SPA-only — no TanStack Start)
- **Terminal**: xterm.js 6 + WebGL renderer + tauri-plugin-pty
- **State**: Zustand 5 (complex workspace/session state) + TanStack Query (if server-fetched data needed later)
- **Layout**: Dockview (IDE-style docking: tabs, splits, floating panels, drag-to-dock, layout serialization)
- **Styling**: Tailwind CSS v4 (via @tailwindcss/vite)
- **Icons**: Lucide React
- **UI**: Custom components (shadcn/ui patterns, no installed shadcn)

## Stack Decisions (researched 2026-04-05)

- **TanStack Router over Next.js**: Next.js SSR features (API routes, middleware, server components) are dead weight in a Tauri webview SPA. TanStack Router is Vite-native, type-safe, lighter (~42 KB vs ~92 KB), and recommended by Tauri community. Use plain Router, not TanStack Start (Start adds SSR overhead unnecessary for desktop).
- **Dockview over react-grid-layout**: react-grid-layout is a dashboard widget grid, not an IDE panel manager. Dockview (v5.2+, zero-dep, actively maintained) is purpose-built for VS Code-style docking with tabs, split panes, floating panels, and popout windows. Layout serialization built-in for workspace persistence.
- **Zustand confirmed**: ~4M weekly downloads, ~3KB, minimal API. Best fit for complex client state (workspaces, settings, agent sessions). Jotai is complementary for fine-grained derived state if needed later.
- **xterm.js + WebGL confirmed**: No competitors in 2026. WebGL renderer is the performance path (GPU-accelerated texture atlases). v6 added multi-texture support and grapheme clusters.
- **tauri-plugin-pty confirmed**: v0.1.1 on crates.io, still the standard PTY approach for Tauri v2. No alternatives have emerged.
- **Tailwind v4 note**: Known macOS WebView bug (GitHub #14219) where styles don't apply — not an issue on Windows. Use `@tailwindcss/vite` plugin (not PostCSS).

## Architecture

```
src/
  app/            — root App component
  components/     — shared UI (app-bar, sidebar, buttons, etc.)
  features/
    terminals/    — terminal-pane, terminal-grid
    workspaces/   — workspace persistence, switcher (planned)
    tasks/        — task queue, orchestration (planned)
  lib/            — utilities, profiles, grid-presets
  store/          — Zustand stores
  types/          — TypeScript interfaces
src-tauri/
  src/            — Rust backend (lib.rs, main.rs)
  capabilities/   — Tauri permissions (default.json)
```

## Key Patterns

- PTY spawned via `tauri-pty` JS API: `spawn(command, args, { cols, rows })`
- xterm.js Terminal instance per pane, with FitAddon + WebglAddon
- ResizeObserver on terminal container triggers `fitAddon.fit()` → `pty.resize()`
- Layout managed by Dockview (replaces react-grid-layout) — IDE-style docking with tabs, splits, floating panels
- All state in Zustand — workspace, panes, profiles, active pane
- Profiles define CLI commands (claude, codex, gemini, aider, opencode, shell)
- Grid presets define layout templates (Single, 2x2, 3-col, etc.)

## Conventions

- kebab-case file names
- Small, focused components — one component per file
- Tailwind for all styling — no CSS modules
- Conventional Commits: `feat(scope): description`
- TypeScript strict mode

## Dev Commands

```bash
npm run tauri dev    # Start dev (Vite + Tauri)
npm run build        # Frontend build (tsc + vite)
npx tsc --noEmit     # Type check only
cargo check          # Rust check (run from src-tauri/)
```

## Important Notes

- `tauri-pty` JS package is v0.2.1, Rust crate is v0.2
- xterm.js v6 uses `@xterm/xterm` imports (not `xterm`)
- Platform detection via `@tauri-apps/plugin-os` → `platform()`
- Windows shell: `powershell.exe`, macOS/Linux: `$SHELL` or `/bin/bash`
- Icons are placeholders — replace with real branding later
