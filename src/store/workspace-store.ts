import { create } from 'zustand';
import type { Pane, WorkspaceTab, TerminalProfile } from '@/types';
import { DEFAULT_PROFILES } from '@/lib/profiles';
import { GRID_PRESETS } from '@/lib/grid-presets';
import { generateId } from '@/lib/utils';
import { getHomeDir, getPlatform } from '@/lib/tauri-shim';
import {
  loadLayout,
  clearSavedLayout,
  loadNamedLayouts,
  saveNamedLayout,
  deleteNamedLayout,
  loadProfileColors,
  saveProfileColors,
  type NamedLayout,
} from '@/lib/layout-storage';
import { dockviewApiRef } from '@/lib/dockview-api';
import { destroyTerminalEntry } from '@/lib/terminal-registry';

/* ── Helpers ── */

const defaultProfile = DEFAULT_PROFILES[0]!;

function createPane(profileId: string): Pane {
  const profile =
    DEFAULT_PROFILES.find((p) => p.id === profileId) ?? defaultProfile;
  return { id: generateId(), profileId, title: profile.name };
}

function createWorkspaceTab(
  name: string,
  cwd?: string,
  initialPaneProfileId?: string,
): WorkspaceTab {
  const now = new Date().toISOString();
  const panes: Pane[] = [];
  if (initialPaneProfileId) {
    const pane = createPane(initialPaneProfileId);
    if (cwd) pane.cwd = cwd;
    panes.push(pane);
  }
  return {
    id: generateId(),
    name,
    cwd,
    panes,
    activePaneId: panes[0]?.id ?? null,
    maximizedPaneId: null,
    activePreset: null,
    dockviewLayout: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Get the active workspace from state */
function getActive(state: WorkspaceState): WorkspaceTab | undefined {
  return state.workspaces.find((w) => w.id === state.activeWorkspaceId);
}

/** Immutably update the active workspace */
function updateActive(
  state: WorkspaceState,
  updater: (ws: WorkspaceTab) => Partial<WorkspaceTab>,
): Partial<WorkspaceState> {
  const ws = getActive(state);
  if (!ws) return {};
  const updates = updater(ws);
  return {
    workspaces: state.workspaces.map((w) =>
      w.id === ws.id
        ? { ...w, ...updates, updatedAt: new Date().toISOString() }
        : w,
    ),
  };
}

/* ── State interface ── */

interface WorkspaceState {
  workspaces: WorkspaceTab[];
  activeWorkspaceId: string | null;
  profiles: TerminalProfile[];
  layoutVersion: number;
  projectsPath: string;
  showProjectBrowser: boolean;
  changeDirPaneId: string | null;
  pendingCwd: { paneId: string; path: string } | null;
  showCommandPalette: boolean;
  customLayouts: NamedLayout[];

  /** Level 2 — pane ID that's currently expanded full-screen */
  expandedPaneId: string | null;
  /** Pane IDs created while in level 2 (removed on collapse) */
  level2PaneIds: string[];
  /** Dockview layout saved before entering level 2 */
  preExpandLayout: unknown;

  // Workspace tab actions
  addWorkspace: (name: string, cwd?: string, profileId?: string) => string;
  removeWorkspace: (id: string) => void;
  setActiveWorkspace: (id: string) => void;
  renameWorkspaceTab: (id: string, name: string) => void;
  nextWorkspace: () => void;
  prevWorkspace: () => void;

  // Level 2 — expand a single pane full-screen
  expandPane: (paneId: string) => void;
  collapsePane: () => void;

  // Pane actions (scoped to active workspace)
  setActivePaneId: (id: string | null) => void;
  addPane: (profileId: string, direction?: 'right' | 'below') => void;
  addPaneWithCwd: (
    profileId: string,
    cwd: string,
    direction?: 'right' | 'below',
  ) => void;
  removePane: (id: string) => void;
  applyPreset: (presetName: string, profileId: string) => void;
  clearAllPanes: () => void;
  updatePaneProfile: (paneId: string, profileId: string) => void;
  updatePaneColor: (paneId: string, color: string) => void;
  updatePaneCwd: (paneId: string, cwd: string) => void;
  toggleMaximize: (paneId: string) => void;
  focusNextPane: () => void;
  focusPrevPane: () => void;
  focusPaneByIndex: (index: number) => void;
  focusDirection: (direction: 'up' | 'down' | 'left' | 'right') => void;

  // Profile actions
  addProfile: (profile: TerminalProfile) => void;
  updateProfileColor: (profileId: string, color: string) => void;

  // UI actions
  setProjectsPath: (path: string) => void;
  setShowProjectBrowser: (show: boolean) => void;
  setChangeDirPaneId: (paneId: string | null) => void;
  setPendingCwd: (paneId: string, path: string) => void;
  clearPendingCwd: () => void;
  setShowCommandPalette: (show: boolean) => void;

  // Layout persistence
  initProjectsPath: () => Promise<void>;
  restoreLayout: () => boolean;
  saveCustomLayout: (name: string) => void;
  deleteCustomLayout: (id: string) => void;
  applyCustomLayout: (layout: NamedLayout) => void;
}

/* ── Store ── */

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  expandedPaneId: null,
  level2PaneIds: [],
  preExpandLayout: null,
  profiles: (() => {
    const saved = loadProfileColors();
    return DEFAULT_PROFILES.map((p) => ({
      ...p,
      ...(saved[p.id] ? { color: saved[p.id] } : {}),
    }));
  })(),
  layoutVersion: 0,
  projectsPath: '',
  showProjectBrowser: false,
  changeDirPaneId: null,
  pendingCwd: null,
  showCommandPalette: false,
  customLayouts: loadNamedLayouts(),

  /* ── Workspace tab actions ── */

  addWorkspace: (name, cwd, profileId) => {
    const ws = createWorkspaceTab(name, cwd, profileId ?? 'system-shell');

    // Save outgoing workspace's Dockview layout before switching
    let dockviewLayout: unknown = null;
    try {
      if (dockviewApiRef.current)
        dockviewLayout = dockviewApiRef.current.toJSON();
    } catch {
      /* ignore */
    }

    set((s) => ({
      workspaces: [
        ...s.workspaces.map((w) =>
          w.id === s.activeWorkspaceId ? { ...w, dockviewLayout } : w,
        ),
        ws,
      ],
      activeWorkspaceId: ws.id,
      layoutVersion: s.layoutVersion + 1,
      showProjectBrowser: false,
    }));

    return ws.id;
  },

  removeWorkspace: (id) => {
    const state = get();
    const idx = state.workspaces.findIndex((w) => w.id === id);
    if (idx === -1) return;

    // Destroy all terminal entries for the removed workspace
    const ws = state.workspaces[idx]!;
    for (const pane of ws.panes) {
      destroyTerminalEntry(pane.id);
    }

    const remaining = state.workspaces.filter((w) => w.id !== id);
    let nextActiveId = state.activeWorkspaceId;
    if (nextActiveId === id) {
      nextActiveId = remaining[Math.min(idx, remaining.length - 1)]?.id ?? null;
    }

    set((s) => ({
      workspaces: remaining,
      activeWorkspaceId: nextActiveId,
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  setActiveWorkspace: (id) => {
    const state = get();
    if (state.activeWorkspaceId === id) return;

    // Serialize current Dockview layout into the outgoing workspace
    let dockviewLayout: unknown = null;
    try {
      if (dockviewApiRef.current)
        dockviewLayout = dockviewApiRef.current.toJSON();
    } catch {
      /* ignore */
    }

    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === s.activeWorkspaceId ? { ...w, dockviewLayout } : w,
      ),
      activeWorkspaceId: id,
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  renameWorkspaceTab: (id, name) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
    })),

  nextWorkspace: () =>
    set((state) => {
      if (state.workspaces.length <= 1) return state;
      const idx = state.workspaces.findIndex(
        (w) => w.id === state.activeWorkspaceId,
      );
      const nextIdx = (idx + 1) % state.workspaces.length;

      // Save outgoing Dockview layout
      let dockviewLayout: unknown = null;
      try {
        if (dockviewApiRef.current)
          dockviewLayout = dockviewApiRef.current.toJSON();
      } catch {
        /* ignore */
      }

      return {
        workspaces: state.workspaces.map((w) =>
          w.id === state.activeWorkspaceId ? { ...w, dockviewLayout } : w,
        ),
        activeWorkspaceId: state.workspaces[nextIdx]!.id,
        layoutVersion: state.layoutVersion + 1,
      };
    }),

  prevWorkspace: () =>
    set((state) => {
      if (state.workspaces.length <= 1) return state;
      const idx = state.workspaces.findIndex(
        (w) => w.id === state.activeWorkspaceId,
      );
      const prevIdx =
        (idx - 1 + state.workspaces.length) % state.workspaces.length;

      let dockviewLayout: unknown = null;
      try {
        if (dockviewApiRef.current)
          dockviewLayout = dockviewApiRef.current.toJSON();
      } catch {
        /* ignore */
      }

      return {
        workspaces: state.workspaces.map((w) =>
          w.id === state.activeWorkspaceId ? { ...w, dockviewLayout } : w,
        ),
        activeWorkspaceId: state.workspaces[prevIdx]!.id,
        layoutVersion: state.layoutVersion + 1,
      };
    }),

  /* ── Level 2 — expand/collapse ── */

  expandPane: (paneId) => {
    // Save Dockview layout before expanding
    let preExpandLayout: unknown = null;
    try {
      if (dockviewApiRef.current)
        preExpandLayout = dockviewApiRef.current.toJSON();
    } catch {
      /* ignore */
    }

    set((s) => ({
      expandedPaneId: paneId,
      level2PaneIds: [],
      preExpandLayout,
      // Clear maximize — we handle fullscreen ourselves
      ...updateActive(s, () => ({ maximizedPaneId: null })),
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  collapsePane: () => {
    const state = get();
    const ws = getActive(state);
    if (!ws) return;

    // Remove level 2 panes from the workspace
    const l2Ids = new Set(state.level2PaneIds);
    for (const id of l2Ids) {
      destroyTerminalEntry(id);
    }
    const remainingPanes = ws.panes.filter((p) => !l2Ids.has(p.id));

    set((s) => ({
      ...updateActive(s, () => ({
        panes: remainingPanes,
        activePaneId:
          remainingPanes.find((p) => p.id === s.expandedPaneId)?.id ??
          remainingPanes[0]?.id ??
          null,
      })),
      expandedPaneId: null,
      level2PaneIds: [],
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  /* ── Pane actions (scoped to active workspace) ── */

  setActivePaneId: (id) =>
    set((state) => updateActive(state, () => ({ activePaneId: id }))),

  addPane: (profileId, direction = 'right') =>
    set((state) => {
      const ws = getActive(state);
      if (!ws) {
        // No workspace — create one
        const newWs = createWorkspaceTab('Workspace', undefined, profileId);
        return {
          workspaces: [...state.workspaces, newWs],
          activeWorkspaceId: newWs.id,
          layoutVersion: state.layoutVersion + 1,
          showProjectBrowser: false,
        };
      }

      const pane = createPane(profileId);
      const refPaneId =
        ws.activePaneId ?? ws.panes[ws.panes.length - 1]?.id ?? null;
      const paneWithSplit: Pane = refPaneId
        ? { ...pane, splitFrom: { paneId: refPaneId, direction } }
        : pane;

      return {
        ...updateActive(state, () => ({
          panes: [...ws.panes, paneWithSplit],
          activePaneId: paneWithSplit.id,
          activePreset: null,
        })),
        // Track as level 2 pane if expanded
        level2PaneIds: state.expandedPaneId
          ? [...state.level2PaneIds, paneWithSplit.id]
          : state.level2PaneIds,
        showProjectBrowser:
          ws.panes.length === 0 ? false : state.showProjectBrowser,
      };
    }),

  addPaneWithCwd: (profileId, cwd, direction = 'right') =>
    set((state) => {
      const ws = getActive(state);
      if (!ws) return state;

      const pane = createPane(profileId);
      const refPaneId =
        ws.activePaneId ?? ws.panes[ws.panes.length - 1]?.id ?? null;
      const paneWithMeta: Pane = {
        ...pane,
        cwd,
        ...(refPaneId ? { splitFrom: { paneId: refPaneId, direction } } : {}),
      };

      return {
        ...updateActive(state, () => ({
          panes: [...ws.panes, paneWithMeta],
          activePaneId: paneWithMeta.id,
          activePreset: null,
        })),
        showProjectBrowser:
          ws.panes.length === 0 ? false : state.showProjectBrowser,
      };
    }),

  removePane: (id) =>
    set((state) => {
      const ws = getActive(state);
      if (!ws) return state;

      const remaining = ws.panes.filter((p) => p.id !== id);
      let nextActiveId = ws.activePaneId;
      if (nextActiveId === id) {
        const oldIndex = ws.panes.findIndex((p) => p.id === id);
        nextActiveId =
          remaining[Math.min(oldIndex, remaining.length - 1)]?.id ?? null;
      }

      return updateActive(state, () => ({
        panes: remaining,
        activePaneId: nextActiveId,
        activePreset: null,
        maximizedPaneId: ws.maximizedPaneId === id ? null : ws.maximizedPaneId,
      }));
    }),

  applyPreset: (presetName, profileId) =>
    set((state) => {
      const ws = getActive(state);
      if (!ws) return state;

      const preset = GRID_PRESETS.find((p) => p.name === presetName);
      if (!preset) return state;

      const existingPanes = [...ws.panes];
      const newPanes: Pane[] = [];
      while (existingPanes.length + newPanes.length < preset.panelCount) {
        newPanes.push(createPane(profileId));
      }
      const allPanes = [...existingPanes, ...newPanes];

      const resultPanes: Pane[] = allPanes.map((pane, i) => {
        if (i >= preset.positions.length) {
          return { ...pane, dockviewPosition: undefined, splitFrom: undefined };
        }
        const posConfig = preset.positions[i]!;
        if (!posConfig.direction || posConfig.referenceIndex === undefined) {
          return { ...pane, dockviewPosition: {}, splitFrom: undefined };
        }
        return {
          ...pane,
          dockviewPosition: {
            referenceId: allPanes[posConfig.referenceIndex]!.id,
            direction: posConfig.direction,
          },
          splitFrom: undefined,
        };
      });

      return {
        ...updateActive(state, () => ({
          panes: resultPanes,
          activePaneId: resultPanes[0]?.id ?? null,
          activePreset: presetName,
          dockviewLayout: null,
        })),
        layoutVersion: state.layoutVersion + 1,
        showProjectBrowser: false,
      };
    }),

  clearAllPanes: () =>
    set((state) => {
      const ws = getActive(state);
      if (!ws) return state;
      return {
        ...updateActive(state, () => ({
          panes: [],
          activePaneId: null,
          activePreset: null,
          maximizedPaneId: null,
          dockviewLayout: null,
        })),
        layoutVersion: state.layoutVersion + 1,
      };
    }),

  updatePaneProfile: (paneId, profileId) =>
    set((state) => {
      const ws = getActive(state);
      if (!ws) return state;
      const profile =
        state.profiles.find((p) => p.id === profileId) ?? defaultProfile;
      return updateActive(state, () => ({
        panes: ws.panes.map((p) =>
          p.id === paneId ? { ...p, profileId, title: profile.name } : p,
        ),
        activePreset: null,
      }));
    }),

  updatePaneColor: (paneId, color) =>
    set((state) => {
      const ws = getActive(state);
      if (!ws) return state;
      return updateActive(state, () => ({
        panes: ws.panes.map((p) =>
          p.id === paneId ? { ...p, colorOverride: color } : p,
        ),
      }));
    }),

  updatePaneCwd: (paneId, cwd) =>
    set((state) => {
      const ws = getActive(state);
      if (!ws) return state;
      return updateActive(state, () => ({
        panes: ws.panes.map((p) => (p.id === paneId ? { ...p, cwd } : p)),
      }));
    }),

  toggleMaximize: (paneId) => {
    const state = get();
    if (state.expandedPaneId) {
      // Already in level 2 — collapse back to grid
      state.collapsePane();
    } else {
      // Enter level 2
      state.expandPane(paneId);
    }
  },

  focusNextPane: () =>
    set((state) => {
      const ws = getActive(state);
      if (!ws || ws.panes.length === 0) return state;
      const idx = ws.panes.findIndex((p) => p.id === ws.activePaneId);
      if (idx === -1)
        return updateActive(state, () => ({ activePaneId: ws.panes[0]!.id }));
      const next = ws.panes[(idx + 1) % ws.panes.length]!;
      return updateActive(state, () => ({ activePaneId: next.id }));
    }),

  focusPrevPane: () =>
    set((state) => {
      const ws = getActive(state);
      if (!ws || ws.panes.length === 0) return state;
      const idx = ws.panes.findIndex((p) => p.id === ws.activePaneId);
      if (idx === -1)
        return updateActive(state, () => ({
          activePaneId: ws.panes[ws.panes.length - 1]!.id,
        }));
      const prev = ws.panes[(idx - 1 + ws.panes.length) % ws.panes.length]!;
      return updateActive(state, () => ({ activePaneId: prev.id }));
    }),

  focusPaneByIndex: (index) =>
    set((state) => {
      const ws = getActive(state);
      if (!ws) return state;
      const pane = ws.panes[index];
      if (!pane) return state;
      return updateActive(state, () => ({ activePaneId: pane.id }));
    }),

  focusDirection: (direction) => {
    const state = get();
    const ws = getActive(state);
    if (!ws?.activePaneId) return;

    const elements = document.querySelectorAll<HTMLElement>('[data-pane-id]');
    const rects = new Map<string, DOMRect>();
    elements.forEach((el) => {
      const id = el.dataset.paneId;
      if (id) rects.set(id, el.getBoundingClientRect());
    });

    const activeRect = rects.get(ws.activePaneId);
    if (!activeRect) return;

    const activeCx = activeRect.left + activeRect.width / 2;
    const activeCy = activeRect.top + activeRect.height / 2;

    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const [id, rect] of rects) {
      if (id === ws.activePaneId) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = cx - activeCx;
      const dy = cy - activeCy;

      let valid = false;
      switch (direction) {
        case 'left':
          valid = dx < -10;
          break;
        case 'right':
          valid = dx > 10;
          break;
        case 'up':
          valid = dy < -10;
          break;
        case 'down':
          valid = dy > 10;
          break;
      }
      if (!valid) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }

    if (bestId) {
      set((s) => updateActive(s, () => ({ activePaneId: bestId })));
    }
  },

  /* ── Profile actions ── */

  addProfile: (profile) =>
    set((state) => ({ profiles: [...state.profiles, profile] })),

  updateProfileColor: (profileId, color) =>
    set((state) => {
      const profiles = state.profiles.map((p) =>
        p.id === profileId ? { ...p, color } : p,
      );
      const colorMap: Record<string, string> = {};
      for (const p of profiles) {
        if (p.color) colorMap[p.id] = p.color;
      }
      saveProfileColors(colorMap);
      return { profiles };
    }),

  /* ── UI actions ── */

  setProjectsPath: (path) => set({ projectsPath: path }),
  setShowProjectBrowser: (show) => set({ showProjectBrowser: show }),
  setChangeDirPaneId: (paneId) => set({ changeDirPaneId: paneId }),
  setPendingCwd: (paneId, path) => set({ pendingCwd: { paneId, path } }),
  clearPendingCwd: () => set({ pendingCwd: null }),
  setShowCommandPalette: (show) => set({ showCommandPalette: show }),

  /* ── Layout persistence ── */

  initProjectsPath: async () => {
    if (get().projectsPath) return;
    try {
      const home = await getHomeDir();
      const sep = getPlatform() === 'windows' ? '\\' : '/';
      set({ projectsPath: home + sep + 'Desktop' + sep + 'Projects' });
    } catch {
      const fallback = getPlatform() === 'windows' ? 'C:\\Users' : '/home';
      set({ projectsPath: fallback });
    }
  },

  restoreLayout: () => {
    const saved = loadLayout();
    if (!saved || saved.workspaces.length === 0) return false;

    const profiles = get().profiles;

    // Validate workspace tabs and their panes
    const validWorkspaces = saved.workspaces
      .map((ws) => {
        const validPanes = ws.panes.filter(
          (p) =>
            p.id && p.profileId && profiles.some((dp) => dp.id === p.profileId),
        );
        // Strip mode field from legacy panes
        const cleanPanes = validPanes.map((p) => {
          const { ...rest } = p as Pane & { mode?: string };
          if ('mode' in rest) {
            const { mode: _, ...clean } = rest as Pane & { mode?: string };
            return clean;
          }
          return rest;
        });
        // Sanitize dockviewPosition references
        const validIds = new Set(cleanPanes.map((p) => p.id));
        const sanitizedPanes = cleanPanes.map((p) => {
          if (
            p.dockviewPosition?.referenceId &&
            !validIds.has(p.dockviewPosition.referenceId)
          ) {
            const { dockviewPosition: _, ...rest } = p;
            return rest;
          }
          return p;
        });

        return {
          ...ws,
          panes: sanitizedPanes,
          activePaneId:
            ws.activePaneId && validIds.has(ws.activePaneId)
              ? ws.activePaneId
              : (sanitizedPanes[0]?.id ?? null),
        };
      })
      .filter((ws) => ws.panes.length > 0);

    if (validWorkspaces.length === 0) {
      clearSavedLayout();
      return false;
    }

    const activeId =
      saved.activeWorkspaceId &&
      validWorkspaces.some((w) => w.id === saved.activeWorkspaceId)
        ? saved.activeWorkspaceId
        : validWorkspaces[0]!.id;

    set((state) => ({
      workspaces: validWorkspaces,
      activeWorkspaceId: activeId,
      layoutVersion: state.layoutVersion + 1,
    }));

    return true;
  },

  saveCustomLayout: (name) => {
    const state = get();
    // Serialize current Dockview layout into active workspace
    let dockviewLayout: unknown = null;
    try {
      if (dockviewApiRef.current)
        dockviewLayout = dockviewApiRef.current.toJSON();
    } catch {
      /* ignore */
    }
    const workspaces = state.workspaces.map((w) =>
      w.id === state.activeWorkspaceId ? { ...w, dockviewLayout } : w,
    );
    const layout: NamedLayout = {
      id: generateId(),
      name,
      workspaces,
      savedAt: new Date().toISOString(),
    };
    saveNamedLayout(layout);
    set({ customLayouts: loadNamedLayouts() });
  },

  deleteCustomLayout: (id) => {
    deleteNamedLayout(id);
    set({ customLayouts: loadNamedLayouts() });
  },

  applyCustomLayout: (layout) => {
    const profiles = get().profiles;
    const validWorkspaces = layout.workspaces
      .map((ws) => {
        const validPanes = ws.panes.filter(
          (p) =>
            p.id && p.profileId && profiles.some((dp) => dp.id === p.profileId),
        );
        return { ...ws, panes: validPanes };
      })
      .filter((ws) => ws.panes.length > 0);

    if (validWorkspaces.length === 0) return;

    set((state) => ({
      workspaces: validWorkspaces,
      activeWorkspaceId: validWorkspaces[0]!.id,
      layoutVersion: state.layoutVersion + 1,
    }));
  },
}));
