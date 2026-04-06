# UI/UX Focus — Next Implementation Phase

## Current State
The app has a working scaffold: app bar, sidebar with profile buttons + layout presets, and a terminal grid powered by react-grid-layout + xterm.js + PTY. The UI is functional but minimal — dark zinc palette, basic buttons, no polish.

---

## Priority 1: Core Grid Experience

### Terminal Pane Chrome
- [ ] Drag handle in pane header (currently the whole grid item is draggable, should be header-only via `.pane-drag-handle`)
- [ ] Pane header shows: profile icon/color dot, title, running command, close button
- [ ] Double-click header to maximize pane (toggle full-grid), Escape to restore
- [ ] Right-click header → context menu: Split Right, Split Below, Close, Change Profile, Duplicate
- [ ] Pane border glow color matches profile color when focused
- [ ] Smooth transition animations on layout changes

### Grid Behavior
- [ ] Drag-and-drop reordering with visual drop targets
- [ ] Resize handles visible on hover (bottom-right corner + edges)
- [ ] Snap-to-grid with visual guides
- [ ] Minimum pane size enforcement (prevent squishing terminals to unusable sizes)
- [ ] Grid background with subtle dot pattern or guidelines when dragging

### Terminal Rendering
- [ ] Confirm WebGL renderer is active (check console for fallback)
- [ ] Terminal font: ship Cascadia Code or Fira Code (don't rely on system install)
- [ ] Selection/copy behavior works properly
- [ ] Scrollback indicator (shows when scrolled up, click to jump to bottom)
- [ ] Terminal link detection (clickable URLs)

---

## Priority 2: Sidebar & Controls

### Profile Launcher (left sidebar)
- [ ] Profile cards with: icon, name, color accent, "Add" button
- [ ] Hover state shows tooltip with command details
- [ ] Quick-add: click profile → adds to first open slot in grid
- [ ] Drag profile from sidebar into grid to place at specific position
- [ ] "Custom..." button opens a profile editor dialog
- [ ] Profile editor: name, command, args, color, env vars, working directory
- [ ] Show which profiles are currently running (badge count)

### Layout Controls
- [ ] Visual preset thumbnails (mini grid icons instead of text labels)
- [ ] "Current layout" indicator showing which preset is active
- [ ] Save current layout as custom preset
- [ ] Layout presets apply with chosen profile (dropdown or last-used)

### Workspace Switcher
- [ ] Workspace tabs or dropdown in app bar
- [ ] New workspace, rename, delete
- [ ] Each workspace saves: grid layout, pane profiles, pane state
- [ ] Persist workspaces to JSON file in app data directory
- [ ] Import/export workspaces (shareable JSON)

---

## Priority 3: App Shell Polish

### App Bar
- [ ] Drag region for window movement (already has `data-tauri-drag-region`)
- [ ] Workspace name (editable on click)
- [ ] Center: quick-action bar (add pane, layout preset picker)
- [ ] Right: status indicators (total panes, memory usage?)
- [ ] Custom window controls (minimize, maximize, close) for frameless look
- [ ] Consider going frameless with custom titlebar for modern feel

### Status Bar (bottom)
- [ ] Pane count, active profile names
- [ ] Per-pane CPU/memory if feasible
- [ ] Connection status indicators per PTY
- [ ] Quick keyboard shortcut hints

### Theme
- [ ] Dark theme is primary (current zinc palette is good base)
- [ ] Refine the color system:
  - Background: `#0d1117` (GitHub dark feel)
  - Surface: `#161b22`
  - Border: `#30363d`
  - Text: `#c9d1d9` / `#8b949e`
  - Accent: `#58a6ff` (blue) for focus states
  - Each profile has its own accent color
- [ ] Subtle depth: use `ring`, `shadow-sm` on focused elements
- [ ] Smooth transitions on all interactive elements (150ms ease)
- [ ] Consider light theme later (not priority)

---

## Priority 4: Keyboard & Shortcuts

- [ ] `Ctrl+T` — new terminal (with default profile)
- [ ] `Ctrl+W` — close focused pane
- [ ] `Ctrl+Tab` / `Ctrl+Shift+Tab` — cycle panes
- [ ] `Ctrl+1-9` — focus pane by position
- [ ] `Ctrl+Shift+Arrow` — resize focused pane
- [ ] `Ctrl+\`` — toggle sidebar
- [ ] `Ctrl+Shift+P` — command palette (future)
- [ ] `F11` — toggle fullscreen
- [ ] Key bindings registered via Tauri globalShortcut or window-level listeners

---

## Priority 5: Micro-Interactions & Delight

- [ ] Pane spawn animation (fade in + slight scale)
- [ ] Pane close animation (fade out + collapse)
- [ ] Sidebar collapse/expand with smooth width transition
- [ ] Drag ghost shows semi-transparent pane preview
- [ ] Empty state: illustration or onboarding message when no panes open
- [ ] First-run experience: auto-open one shell pane

---

## Design References
- **Lemonade**: the direct competitor — match its grid polish, beat its limitations
- **Warp Terminal**: modern terminal UX, command blocks, sleek dark theme
- **VS Code Terminal**: panel chrome, split behavior, integrated feel
- **iTerm2**: split pane management, profile system
- **Windows Terminal**: tab + pane system, profile cards, settings UI

---

## Technical Notes for Implementation

### Font Loading
Ship a monospace font (Cascadia Code or Fira Code) as a static asset. Configure in xterm.js Terminal options. Use `@font-face` in CSS and wait for font load before opening terminal.

### react-grid-layout Tips
- `draggableHandle` is set to `.pane-drag-handle` — add this class to pane header
- `compactType={null}` allows free placement (no auto-stacking)
- `onLayoutChange` syncs back to Zustand store
- For animations, react-grid-layout has built-in CSS transitions on `.react-grid-item`

### Window Controls
Tauri v2 supports `decorations: false` in `tauri.conf.json` for frameless windows. Use `data-tauri-drag-region` on the custom titlebar div. Window control buttons via `@tauri-apps/api/window`.

### Workspace Persistence
Use Tauri's `app_data_dir()` from `@tauri-apps/api/path` to find the save location. Store as `workspaces.json`. Load on app start, auto-save on changes (debounced).

### Performance Considerations
- Each xterm.js instance is heavy — lazy-init terminals only when pane is visible
- WebGL renderer uses one WebGL context per terminal — browsers limit to ~16 contexts
- For 16-pane grids, may need to fall back to canvas renderer for excess panes
- Debounce resize events (requestAnimationFrame is already used)
