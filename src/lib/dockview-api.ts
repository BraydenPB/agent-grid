/**
 * Module-level Dockview API refs so any module (store, sidebar, etc.)
 * can call api.toJSON() on demand without prop drilling.
 *
 * gridDockviewApiRef  — Layer 1 (main grid, one panel per project)
 * expandedDockviewApiRef — Layer 2 (expanded project, multi-pane)
 * dockviewApiRef — alias for whichever layer is active (kept for compat)
 */
import type { DockviewApi } from 'dockview';

/** Layer 1 — main project grid */
export const gridDockviewApiRef: { current: DockviewApi | null } = {
  current: null,
};

/** Layer 2 — expanded project view */
export const expandedDockviewApiRef: { current: DockviewApi | null } = {
  current: null,
};

/** Legacy alias — points to whichever layer is currently mounted */
export const dockviewApiRef: { current: DockviewApi | null } = {
  current: null,
};
