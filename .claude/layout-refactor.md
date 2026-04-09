# Layout System Refactor — Context for Future Sessions

Status: Complete (all P0 + P1 items shipped in v0.1.0-beta.1)
Previous work: Dead code cleanup, referenceId fix, preset rearrangement (branch: claude/fix-terminal-bugs-gH32X)
P0-P1 implementation: commit f345ae4
Note: P2 items moved to .claude/v1-roadmap.md. This file retained as architecture reference.

## What Was Done (2026-04-07)

### Dead Code Removed

- `PaneLayout` interface (x/y/w/h from react-grid-layout era) — removed from types
- `layout` field from `Pane` interface — never read by Dockview
- `isActive` field from `Pane` — duplicated by `activePaneId` in store
- `gridCols`, `layoutSerialized` from `Workspace` — unused
- `GridPreset` compatibility type — unused
- `updatePaneLayout()` and `updateWorkspaceLayouts()` store actions — no callers

### Reference System Fixed

- `dockviewPosition.referenceIndex` (unstable array index) → `referenceId` (stable pane ID)
- Grid preset templates still use `referenceIndex` internally (template-relative index)
- `applyPreset()` resolves template indices to concrete pane IDs at application time
- `terminal-grid.tsx` lookups simplified to use `referenceId` directly

### Preset Rearrangement Enabled

- Removed the `if (state.workspace.panes.length > 0) return state` guard
- `applyPreset()` now reuses existing panes (preserves profile + CWD)
- Creates new panes only if preset needs more than currently exist
- Extra panes beyond preset slots get cleared positioning (Dockview places them)
- Sidebar preset buttons always enabled, active preset highlighted

### Known Limitation: Terminal Respawn on Preset Switch

Switching presets still bumps `layoutVersion`, which triggers full `DockviewReact` remount via `key={layoutVersion}`. This destroys and recreates all terminal components (PTYs respawn). Profile and CWD are preserved, but scroll history and running processes are lost.

**True rearrangement without respawn** requires architectural changes — see "Terminal State Preservation" below.

---

## Remaining Work Items

### P0 — Critical for Production (ALL DONE)

#### 1. Terminal State Preservation Across Layout Changes ✓ (commit f345ae4)

The `key={layoutVersion}` remount hammer is the root cause. Two approaches:

**Option A: Dockview API rearrangement (recommended)**

- Instead of remounting, use `api.clear()` + `api.addPanel()` in a useEffect
- Dockview manages component lifecycle separately from React — panels can be removed and re-added without unmounting the DockviewReact component
- Terminal components still get destroyed when their panel is removed, BUT:
  - We could detach xterm's DOM element before clear, then reattach after re-add
  - Requires `terminal-pane.tsx` to expose a ref for the xterm container
  - The Terminal instance and PTY survive if we prevent disposal during rearrange

**Option B: Portal-based terminals**

- Render all Terminal instances in a hidden container using React portals
- Dockview panels just contain portal targets
- On rearrange, terminals are re-portaled to new containers without unmounting
- More complex but guarantees zero terminal disruption
- Similar to how VS Code manages editor tabs

**Recommendation**: Start with Option A. Remove `key={layoutVersion}`, add a `rearrangeLayout()` function that uses the Dockview API directly. If that still causes flicker, move to Option B.

#### 2. Layout Persistence ✓ (commit f345ae4)

Dockview has built-in `toJSON()`/`fromJSON()` for full layout serialization.

Implementation plan:

- On `api.onDidLayoutChange`, serialize to localStorage (debounced, ~500ms)
- On app start, try `api.fromJSON(saved)` with try/catch fallback to default
- Store the JSON in `Workspace.layoutSerialized` (re-add this field)
- Save/restore pane metadata (profileId, CWD) alongside the Dockview JSON
- Consider Tauri's filesystem API for persistence instead of localStorage

#### 3. Hardcoded Projects Path ✓ (commit f345ae4)

`workspace-store.ts` line 77: `projectsPath: "C:\\Users\\brayd\\Desktop\\Projects"`

- Should use a platform-appropriate default (e.g., `$HOME/Projects` or `$HOME`)
- Could use Tauri's `path` API: `await homeDir()` + `/Projects`
- Make it configurable via settings

### P1 — Important for UX Quality (ALL DONE)

#### 4. Pane Status Indicators (Notification Rings) ✓ (commit f345ae4)

Research source: cmux terminal app (2026). The killer feature for multi-agent workflows.

**Concept**: Color-coded ring/border around each pane indicating agent state:

- No ring / subtle border = working (active process running)
- Blue ring = waiting for input (agent idle, cursor blinking)
- Green ring = done (process exited 0)
- Red ring = error (process exited non-zero)
- Amber ring = needs attention (output detected while unfocused)

**Implementation approach**:

1. Add `status: 'working' | 'idle' | 'done' | 'error' | 'attention'` to Pane or a separate store
2. Detect state from PTY output:
   - Process exit → done/error (already handled in `terminal-pane.tsx` onExit)
   - Output while unfocused → attention (watch `pty.onData` when `!isActive`)
   - Idle detection: no output for N seconds + cursor visible → idle/waiting
3. Apply ring via CSS: `box-shadow: 0 0 0 2px ${statusColor}, 0 0 12px ${statusColor}40`
4. Also show status on titlebar pane dots
5. Reset attention status when pane gains focus

**OSC-based detection** (advanced):

- Some AI agents emit OSC sequences for status (cmux uses OSC 9/99/777)
- Claude Code, Codex etc. could potentially be detected by prompt patterns
- For v1, use simple heuristics (exit code, output activity, idle timeout)

#### 5. Command Palette (Ctrl+Shift+P) ✓ (commit f345ae4)

A searchable list of all available actions. Critical for discoverability.

**Scope**:

- All keyboard shortcuts (with descriptions)
- Layout presets
- Profile switching
- Split/close/maximize actions
- Project browser
- Settings (future)

**Implementation**:

- Overlay component similar to ProjectBrowser but with fuzzy search
- Action registry: `{ id, label, shortcut?, action: () => void }`
- Filter as user types
- Highlight matching chars in results
- Could use cmdk library (2KB, very popular) or build custom

#### 6. Directional Pane Navigation (Ctrl+Alt+Arrows) ✓ (commit f345ae4)

Navigate to the pane in a specific direction, not just sequential cycling.

**Challenge**: Dockview doesn't expose spatial panel positions to React.
**Approach**:

- Query DOM for `[data-pane-id]` element positions
- Find nearest pane in the requested direction from active pane
- Use `getBoundingClientRect()` for spatial awareness

#### 7. Discoverable Shortcut Hints (Zellij-style Status Bar) ✓ (commit f345ae4)

A thin bar at the bottom showing available shortcuts for current context.

**Implementation**:

- ~20px bar at window bottom
- Shows context-aware shortcuts (e.g., when pane focused: "^D Split | ^W Close | ^Enter Max | ^K Projects")
- Fades out after 5s of no activity, reappears on mode change
- Can be toggled off in settings

### P2 — Polish

#### 8. Confirmation UX for Clear All

Current: 3-second auto-reset timer that silently cancels. Users may click expecting action, get nothing.
Fix: Use a modal dialog instead, or at minimum keep the confirm state until explicitly cancelled.

#### 9. Context Menu Magic Numbers

`terminal-context-menu.tsx` lines 102-103: hardcoded menu dimensions (224px, 360px).
Fix: Measure the rendered menu element and clamp dynamically.

#### 10. Custom Layout Saving

Let users save the current Dockview layout as a named preset.
Requires: layout persistence (item 2) + a "Save Layout" action + stored presets list.

#### 11. Profile Selection in Split Shortcuts

Ctrl+Shift+D/E always split with current profile. Add a modifier (e.g., Ctrl+Shift+Alt+D) to open a profile picker, or use the command palette.

#### 12. Maximize Animation

Currently instant. Add a CSS transition:

```css
.dv-panel {
  transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

May need Dockview CSS class hooks.

---

## Architecture Notes

### Current Component Tree

```
App.tsx
├── Titlebar (+ New dropdown, Layout dropdown, pane dots, window controls)
├── Sidebar (split direction, profiles, presets, clear all)
└── TerminalGrid
    ├── DockviewReact (key={layoutVersion})
    │   └── TerminalPaneWrapper[] (store subscription isolation)
    │       └── TerminalPane (xterm + PTY + header + search + context menu)
    └── ProjectBrowser (overlay via AnimatePresence)
```

### State Flow

```
User action → Zustand store update → React re-render
                                   ↓
                              terminal-grid.tsx useEffect
                                   ↓
                              Dockview API (addPanel/removePanel)
```

### Key Files

| File                                       | Role                                               |
| ------------------------------------------ | -------------------------------------------------- |
| `src/types/index.ts`                       | Core interfaces (Pane, Workspace, TerminalProfile) |
| `src/store/workspace-store.ts`             | All layout state + actions                         |
| `src/features/terminals/terminal-grid.tsx` | Dockview orchestration                             |
| `src/features/terminals/terminal-pane.tsx` | Terminal rendering + PTY lifecycle                 |
| `src/lib/grid-presets.ts`                  | Preset layout templates                            |
| `src/components/sidebar.tsx`               | Sidebar with profiles + presets                    |
| `src/components/titlebar.tsx`              | Top bar with dropdowns + pane dots                 |
| `src/lib/use-global-shortcuts.ts`          | Global keyboard shortcuts                          |

### Dockview API Reference (commonly needed)

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
