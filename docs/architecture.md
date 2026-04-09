# Architecture Overview

## System Diagram

```
┌──────────────────────────────────────────────────────┐
│                    Tauri Window                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Titlebar (drag region, dropdowns, pane dots,    │ │
│  │           window controls)                        │ │
│  ├────────┬─────────────────────────────────────────┤ │
│  │        │                                         │ │
│  │  Side  │     DockviewReact                       │ │
│  │  bar   │     (IDE-style docking engine)           │ │
│  │        │                                         │ │
│  │Profiles│  ┌──────────┐  ┌──────────┐            │ │
│  │Presets │  │ Pane 1   │  │ Pane 2   │            │ │
│  │Actions │  │ xterm.js │  │ xterm.js │            │ │
│  │        │  │ ↕ PTY    │  │ ↕ PTY    │            │ │
│  │        │  └──────────┘  └──────────┘            │ │
│  │        │  ┌──────────┐  ┌──────────┐            │ │
│  │        │  │ Pane 3   │  │ Pane 4   │            │ │
│  │        │  │ xterm.js │  │ xterm.js │            │ │
│  │        │  │ ↕ PTY    │  │ ↕ PTY    │            │ │
│  │        │  └──────────┘  └──────────┘            │ │
│  ├────────┴─────────────────────────────────────────┤ │
│  │  Shortcut Bar (context-aware hints)              │ │
│  └──────────────────────────────────────────────────┘ │
│  Overlays: Command Palette, Project Browser           │
└──────────────────────────────────────────────────────┘
```

## Component Tree

```
App.tsx
├── ErrorBoundary
├── Titlebar (+ New dropdown, Layout dropdown, pane dots, window controls)
├── Sidebar (split direction, profiles, presets, clear all)
├── TerminalGrid
│   ├── DockviewReact
│   │   └── TerminalPaneWrapper[] (store subscription isolation)
│   │       └── TerminalPane (xterm + PTY + header + search + context menu)
│   ├── CommandPalette (overlay via AnimatePresence)
│   └── ProjectBrowser (overlay via AnimatePresence)
└── ShortcutBar
```

## Data Flow

```
User clicks "Add Terminal" (sidebar)
  → useWorkspaceStore.addPane(profileId, direction)
  → Workspace state updates with new Pane
  → TerminalGrid useEffect detects new pane
  → Dockview API: api.addPanel({ id, component, position })
  → TerminalPane mounts:
      1. Creates xterm.js Terminal instance
      2. Loads addons (Fit, WebGL, Search, WebLinks, Clipboard, Serialize, Unicode11, Image)
      3. Opens terminal in container div
      4. Resolves shell command from profile + OS platform
      5. Calls spawnPty({ command, args, cols, rows, cwd })
      6. Wires: pty.onData → term.write, term.onData → pty.write
      7. Attaches ResizeObserver → fitAddon.fit() → pty.resize()
      8. Registers OSC handlers for CWD detection
      9. Starts idle timer for status detection
```

## State Architecture (Zustand)

```
WorkspaceStore
├── workspace: Workspace
│   ├── id, name
│   ├── panes: Pane[]
│   │   └── id, profileId, title, dockviewPosition, colorOverride
│   └── createdAt, updatedAt
├── profiles: TerminalProfile[]
│   └── id, name, command, args, color
├── activePaneId: string | null
├── maximizedPaneId: string | null
├── layoutVersion: number
├── splitDirection: 'right' | 'below'
├── showProjectBrowser: boolean
├── showCommandPalette: boolean
└── actions:
    ├── addPane(profileId, direction?)
    ├── removePane(id)
    ├── updatePaneProfile(id, profileId)
    ├── applyPreset(presetName)
    ├── toggleMaximize(id)
    ├── setActivePaneId(id)
    └── ...

PaneStatusStore
├── statuses: Record<paneId, 'working' | 'idle' | 'done' | 'error' | 'attention'>
└── setStatus(paneId, status)

Terminal Registry (non-React, Map-based)
├── entries: Map<paneId, TerminalEntry>
│   └── terminal, fitAddon, searchAddon, serializeAddon, pty, element,
│       ptyDisposables, spawnSeq, fontSize, profileId, cwd
├── getTerminalEntry(id)
├── setTerminalEntry(id, entry)
└── destroyTerminalEntry(id)
```

## Key Files

| File                                               | Role                                               |
| -------------------------------------------------- | -------------------------------------------------- |
| `src/types/index.ts`                               | Core interfaces (Pane, Workspace, TerminalProfile) |
| `src/store/workspace-store.ts`                     | All layout state + actions                         |
| `src/store/pane-status-store.ts`                   | Pane activity status tracking                      |
| `src/features/terminals/terminal-grid.tsx`         | Dockview orchestration                             |
| `src/features/terminals/terminal-pane.tsx`         | Terminal rendering + PTY lifecycle                 |
| `src/features/terminals/terminal-search.tsx`       | In-pane search UI                                  |
| `src/features/terminals/terminal-context-menu.tsx` | Right-click menu                                   |
| `src/features/command-palette/command-palette.tsx` | Ctrl+Shift+P palette                               |
| `src/features/projects/project-browser.tsx`        | Ctrl+K project navigator                           |
| `src/lib/profiles.ts`                              | Shell command resolution + injection prevention    |
| `src/lib/cwd.ts`                                   | Path normalization (MSYS, Cygwin, file:// URIs)    |
| `src/lib/tauri-shim.ts`                            | Browser-safe wrappers for Tauri APIs               |
| `src/lib/terminal-registry.ts`                     | Non-React terminal instance storage                |
| `src/lib/layout-storage.ts`                        | Layout persistence to localStorage                 |
| `src/lib/grid-presets.ts`                          | Preset layout templates                            |
| `src/lib/use-global-shortcuts.ts`                  | Global keyboard shortcuts                          |
| `src/components/sidebar.tsx`                       | Sidebar with profiles + presets                    |
| `src/components/titlebar.tsx`                      | Top bar with dropdowns + pane dots                 |
| `src/components/error-boundary.tsx`                | React error boundary with recovery                 |
| `src-tauri/src/lib.rs`                             | Rust backend (list_projects command)               |
| `src-tauri/capabilities/default.json`              | Tauri permissions (minimal)                        |

## Security Architecture

### Tauri Permissions (Least Privilege)

Only these capabilities are granted:

- `core:default` — standard Tauri core
- `core:window:*` — window controls for custom titlebar
- `opener:default` — open external links
- `os:default` — platform detection for shell selection
- `pty:default` — terminal PTY spawning

No filesystem, shell-execute, or network permissions beyond what's listed.

### Content Security Policy

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' asset: http://asset.localhost;
font-src 'self' data:;
connect-src ipc: http://ipc.localhost
```

### Shell Injection Prevention

`resolveShellCommand()` in `profiles.ts` individually quotes each argument:

- Bash: wraps in single quotes, escapes internal single quotes with `'\''`
- PowerShell: wraps in single quotes, escapes internal single quotes with `''`

### Path Traversal Prevention

Rust `list_projects` command uses `Path::canonicalize()` to resolve symlinks and `..` before any directory read.

## Cross-Platform Shell Resolution

```
platform() === "windows"  → powershell.exe
platform() === "macos"    → /bin/bash -l
platform() === "linux"    → /bin/bash -l
```

Profile command `__SYSTEM_SHELL__` triggers platform detection. Named profiles spawn through the system shell for PATH resolution: `bash -lc 'quoted command'` or `powershell -Command & 'quoted command'`.

## Key Dependencies

| Package            | Purpose                       | Version |
| ------------------ | ----------------------------- | ------- |
| tauri              | Desktop framework (Rust)      | 2.x     |
| tauri-plugin-pty   | Native PTY sessions           | 0.2.x   |
| tauri-plugin-os    | Platform detection            | 2.x     |
| @xterm/xterm       | Terminal rendering            | 6.x     |
| @xterm/addon-webgl | GPU-accelerated rendering     | 0.19.x  |
| @xterm/addon-fit   | Auto-resize terminal          | 0.11.x  |
| dockview           | IDE-style docking layout      | 5.2.x   |
| zustand            | State management              | 5.x     |
| framer-motion      | Animations (palette, browser) | 12.x    |
| tailwindcss        | Styling                       | 4.x     |

## Dockview API Reference

```typescript
api.addPanel({ id, component, title, params, position? })
api.removePanel(panel)
api.getPanel(id) → panel
api.maximizeGroup(panel) / api.exitMaximizedGroup()
api.hasMaximizedGroup() → boolean
api.toJSON() → serialized layout
api.fromJSON(json) → restore layout
api.clear() → remove all panels
api.onDidLayoutChange → event
panel.api.group → group containing this panel
```
