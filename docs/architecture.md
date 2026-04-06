# Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Tauri Window                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  App Bar (drag region, workspace name, controls)│ │
│  ├────────┬────────────────────────────────────────┤ │
│  │        │                                        │ │
│  │  Side  │     Terminal Grid                      │ │
│  │  bar   │     (react-grid-layout)                │ │
│  │        │                                        │ │
│  │ Profiles│  ┌──────────┐  ┌──────────┐          │ │
│  │ Presets │  │ Pane 1   │  │ Pane 2   │          │ │
│  │ Actions │  │ xterm.js │  │ xterm.js │          │ │
│  │        │  │ ↕ PTY    │  │ ↕ PTY    │          │ │
│  │        │  └──────────┘  └──────────┘          │ │
│  │        │  ┌──────────┐  ┌──────────┐          │ │
│  │        │  │ Pane 3   │  │ Pane 4   │          │ │
│  │        │  │ xterm.js │  │ xterm.js │          │ │
│  │        │  │ ↕ PTY    │  │ ↕ PTY    │          │ │
│  │        │  └──────────┘  └──────────┘          │ │
│  ├────────┴────────────────────────────────────────┤ │
│  │  Status Bar (pane count, indicators)            │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Data Flow

```
User clicks "Add Terminal" (sidebar)
  → useWorkspaceStore.addPane(profileId)
  → Workspace state updates with new Pane
  → TerminalGrid re-renders with new layout item
  → TerminalPane mounts:
      1. Creates xterm.js Terminal instance
      2. Loads FitAddon + WebglAddon
      3. Opens terminal in container div
      4. Resolves shell command from profile + OS platform
      5. Calls spawn(command, args, { cols, rows })
      6. Wires: pty.onData → term.write, term.onData → pty.write
      7. Attaches ResizeObserver → fitAddon.fit() → pty.resize()
```

## State Architecture (Zustand)

```
WorkspaceStore
├── workspace: Workspace
│   ├── id, name, gridCols
│   ├── panes: Pane[]
│   │   └── id, profileId, title, isActive, layout {x,y,w,h}
│   └── createdAt, updatedAt
├── profiles: TerminalProfile[]
│   └── id, name, command, args, icon, color, env, cwd
├── activePaneId: string | null
└── actions:
    ├── addPane(profileId)
    ├── removePane(id)
    ├── updatePaneLayout(id, layout)
    ├── updateWorkspaceLayouts(layouts)  ← from react-grid-layout onChange
    ├── applyPreset(presetName, profileId)
    ├── renameWorkspace(name)
    └── addProfile(profile)
```

## Type Definitions

```typescript
TerminalProfile  — defines a launchable CLI tool
Pane             — a running terminal instance in the grid
PaneLayout       — position + size in the grid (x, y, w, h)
Workspace        — a saved arrangement of panes
Task             — a queued task for orchestration (future)
GridPreset       — a named layout template
```

## Plugin/Extension Points (Future)

The architecture is designed for panel-type extensibility:

```
features/
  terminals/     — Terminal panel type (done)
  workspaces/    — Workspace management (next)
  tasks/         — Task queue / orchestration
  browser/       — Embedded browser panel (future)
  editor/        — Monaco code editor panel (future)
  notes/         — Markdown notes panel (future)
  diff/          — Git diff viewer panel (future)
```

Each feature is self-contained with its own components, store slice, and types. The grid layout system already supports arbitrary panel types — a panel just needs to be a React component that fills its grid cell.

## Cross-Platform Shell Resolution

```
platform() === "windows"  → powershell.exe
platform() === "macos"    → $SHELL || /bin/bash
platform() === "linux"    → $SHELL || /bin/bash
```

Profile command `__SYSTEM_SHELL__` is a sentinel that triggers platform detection. Named profiles (claude, codex, etc.) use their command directly.

## Key Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| tauri | Desktop framework (Rust) | 2.x |
| tauri-plugin-pty | Native PTY sessions | 0.2.x |
| tauri-plugin-os | Platform detection | 2.x |
| @xterm/xterm | Terminal rendering | 6.x |
| @xterm/addon-fit | Auto-resize terminal | 0.11.x |
| @xterm/addon-webgl | GPU-accelerated rendering | 0.19.x |
| react-grid-layout | Drag/resize grid layout | 1.5.x |
| zustand | State management | 5.x |
| tailwindcss | Styling | 4.x |
