import { create } from 'zustand';
import type {
  Pane,
  InnerPane,
  PaneWorkspace,
  Workspace,
  TerminalProfile,
} from '@/types';
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

interface WorkspaceState {
  // Current workspace
  workspace: Workspace;
  // Available terminal profiles
  profiles: TerminalProfile[];
  // Which pane is focused
  activePaneId: string | null;
  // Bumped on preset apply to force Dockview remount
  layoutVersion: number;
  // Which preset is currently active (null if user modified layout)
  activePreset: string | null;
  // Root directory for project browser
  projectsPath: string;
  // Whether to show the project browser overlay
  showProjectBrowser: boolean;
  // Directory change flow: pane requesting a cwd change via project browser
  changeDirPaneId: string | null;
  // Result of a directory change pick
  pendingCwd: { paneId: string; path: string } | null;
  // Maximized pane (hides all others via Dockview API)
  maximizedPaneId: string | null;
  // Command palette visibility
  showCommandPalette: boolean;
  // User-saved named layouts
  customLayouts: NamedLayout[];
  // Nested workspaces keyed by outer paneId
  paneWorkspaces: Record<string, PaneWorkspace>;

  // Actions
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
  renameWorkspace: (name: string) => void;
  addProfile: (profile: TerminalProfile) => void;
  updatePaneProfile: (paneId: string, profileId: string) => void;
  updatePaneColor: (paneId: string, color: string) => void;
  updateProfileColor: (profileId: string, color: string) => void;
  setProjectsPath: (path: string) => void;
  setShowProjectBrowser: (show: boolean) => void;
  setChangeDirPaneId: (paneId: string | null) => void;
  setPendingCwd: (paneId: string, path: string) => void;
  clearPendingCwd: () => void;
  toggleMaximize: (paneId: string) => void;
  setShowCommandPalette: (show: boolean) => void;
  focusNextPane: () => void;
  focusPrevPane: () => void;
  focusPaneByIndex: (index: number) => void;
  focusDirection: (direction: 'up' | 'down' | 'left' | 'right') => void;
  getPaneIndex: (paneId: string) => number;
  initProjectsPath: () => Promise<void>;
  restoreLayout: () => boolean;
  saveCustomLayout: (name: string) => void;
  deleteCustomLayout: (id: string) => void;
  applyCustomLayout: (layout: NamedLayout) => void;

  // Inner workspace actions
  createPaneWorkspace: (parentPaneId: string) => void;
  removePaneWorkspace: (parentPaneId: string) => void;
  addInnerPane: (
    parentPaneId: string,
    profileId: string,
    direction?: 'right' | 'below',
  ) => void;
  removeInnerPane: (parentPaneId: string, innerPaneId: string) => void;
  setActiveInnerPaneId: (
    parentPaneId: string,
    innerPaneId: string | null,
  ) => void;
  toggleInnerMaximize: (parentPaneId: string, innerPaneId: string) => void;
  updateInnerPaneProfile: (
    parentPaneId: string,
    innerPaneId: string,
    profileId: string,
  ) => void;
  updateInnerPaneColor: (
    parentPaneId: string,
    innerPaneId: string,
    color: string,
  ) => void;
  // Live CWD tracking — updated from OSC 7 in terminal-pane
  updatePaneCwd: (paneId: string, cwd: string) => void;
}

// DEFAULT_PROFILES always has at least one entry
const defaultProfile = DEFAULT_PROFILES[0]!;

function createPane(profileId: string): Pane {
  const profile =
    DEFAULT_PROFILES.find((p) => p.id === profileId) ?? defaultProfile;
  return {
    id: generateId(),
    profileId,
    title: profile.name,
  };
}

function createDefaultWorkspace(): Workspace {
  return {
    id: generateId(),
    name: 'Default Workspace',
    panes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: createDefaultWorkspace(),
  profiles: (() => {
    const saved = loadProfileColors();
    return DEFAULT_PROFILES.map((p) => ({
      ...p,
      ...(saved[p.id] ? { color: saved[p.id] } : {}),
    }));
  })(),
  activePaneId: null,
  layoutVersion: 0,
  activePreset: null,
  projectsPath: '',
  showProjectBrowser: false,
  changeDirPaneId: null,
  pendingCwd: null,
  maximizedPaneId: null,
  showCommandPalette: false,
  customLayouts: loadNamedLayouts(),
  paneWorkspaces: {},

  setActivePaneId: (id) => set({ activePaneId: id }),

  addPane: (profileId, direction = 'right') =>
    set((state) => {
      const pane = createPane(profileId);

      // Split from the active pane (or last pane if none active)
      const refPaneId =
        state.activePaneId ??
        state.workspace.panes[state.workspace.panes.length - 1]?.id ??
        null;

      const paneWithSplit: Pane = refPaneId
        ? { ...pane, splitFrom: { paneId: refPaneId, direction } }
        : pane;

      return {
        workspace: {
          ...state.workspace,
          panes: [...state.workspace.panes, paneWithSplit],
          updatedAt: new Date().toISOString(),
        },
        activePaneId: paneWithSplit.id,
        activePreset: null,
        // Clear stale project browser overlay when transitioning from empty state
        showProjectBrowser:
          state.workspace.panes.length === 0 ? false : state.showProjectBrowser,
      };
    }),

  addPaneWithCwd: (profileId, cwd, direction = 'right') =>
    set((state) => {
      const pane = createPane(profileId);

      const refPaneId =
        state.activePaneId ??
        state.workspace.panes[state.workspace.panes.length - 1]?.id ??
        null;

      const paneWithMeta: Pane = {
        ...pane,
        cwd,
        ...(refPaneId ? { splitFrom: { paneId: refPaneId, direction } } : {}),
      };

      return {
        workspace: {
          ...state.workspace,
          panes: [...state.workspace.panes, paneWithMeta],
          updatedAt: new Date().toISOString(),
        },
        activePaneId: paneWithMeta.id,
        activePreset: null,
        showProjectBrowser:
          state.workspace.panes.length === 0 ? false : state.showProjectBrowser,
      };
    }),

  removePane: (id) =>
    set((state) => {
      const remaining = state.workspace.panes.filter((p) => p.id !== id);
      let nextActiveId = state.activePaneId;
      if (nextActiveId === id) {
        const oldIndex = state.workspace.panes.findIndex((p) => p.id === id);
        nextActiveId =
          remaining[Math.min(oldIndex, remaining.length - 1)]?.id ?? null;
      }
      // Clean up any inner workspace for this pane
      const { [id]: _, ...remainingWorkspaces } = state.paneWorkspaces;
      return {
        workspace: {
          ...state.workspace,
          panes: remaining,
          updatedAt: new Date().toISOString(),
        },
        activePaneId: nextActiveId,
        activePreset: null,
        maximizedPaneId:
          state.maximizedPaneId === id ? null : state.maximizedPaneId,
        paneWorkspaces: remainingWorkspaces,
      };
    }),

  applyPreset: (presetName, profileId) =>
    set((state) => {
      const preset = GRID_PRESETS.find((p) => p.name === presetName);
      if (!preset) return state;

      const existingPanes = [...state.workspace.panes];
      const targetCount = preset.panelCount;

      // Reuse existing panes (preserve profile + CWD), create new ones only if needed
      const newPanes: Pane[] = [];
      while (existingPanes.length + newPanes.length < targetCount) {
        newPanes.push(createPane(profileId));
      }
      const allPanes = [...existingPanes, ...newPanes];

      // Apply dockview positions with resolved stable IDs
      const resultPanes: Pane[] = allPanes.map((pane, i) => {
        if (i >= preset.positions.length) {
          // Extra pane beyond preset slots — clear positioning, Dockview will place it
          return { ...pane, dockviewPosition: undefined, splitFrom: undefined };
        }

        const posConfig = preset.positions[i]!;
        if (!posConfig.direction || posConfig.referenceIndex === undefined) {
          // First panel — no reference needed
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
        workspace: {
          ...state.workspace,
          panes: resultPanes,
          updatedAt: new Date().toISOString(),
        },
        activePaneId: resultPanes[0]?.id ?? null,
        activePreset: presetName,
        layoutVersion: state.layoutVersion + 1,
        showProjectBrowser: false,
      };
    }),

  clearAllPanes: () => {
    clearSavedLayout();
    return set((state) => ({
      workspace: {
        ...state.workspace,
        panes: [],
        updatedAt: new Date().toISOString(),
      },
      activePaneId: null,
      activePreset: null,
      maximizedPaneId: null,
      layoutVersion: state.layoutVersion + 1,
      paneWorkspaces: {},
    }));
  },

  renameWorkspace: (name) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        name,
        updatedAt: new Date().toISOString(),
      },
    })),

  addProfile: (profile) =>
    set((state) => ({
      profiles: [...state.profiles, profile],
    })),

  updatePaneProfile: (paneId, profileId) =>
    set((state) => {
      const profile =
        state.profiles.find((candidate) => candidate.id === profileId) ??
        defaultProfile;

      return {
        workspace: {
          ...state.workspace,
          panes: state.workspace.panes.map((pane) =>
            pane.id === paneId
              ? {
                  ...pane,
                  profileId,
                  title: profile.name,
                }
              : pane,
          ),
          updatedAt: new Date().toISOString(),
        },
        activePreset: null,
      };
    }),

  updatePaneColor: (paneId, color) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        panes: state.workspace.panes.map((pane) =>
          pane.id === paneId ? { ...pane, colorOverride: color } : pane,
        ),
        updatedAt: new Date().toISOString(),
      },
    })),

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

  setProjectsPath: (path) => set({ projectsPath: path }),
  setShowProjectBrowser: (show) => set({ showProjectBrowser: show }),
  setChangeDirPaneId: (paneId) => set({ changeDirPaneId: paneId }),
  setPendingCwd: (paneId, path) => set({ pendingCwd: { paneId, path } }),
  clearPendingCwd: () => set({ pendingCwd: null }),

  toggleMaximize: (paneId) =>
    set((state) => ({
      maximizedPaneId: state.maximizedPaneId === paneId ? null : paneId,
    })),

  setShowCommandPalette: (show) => set({ showCommandPalette: show }),

  focusNextPane: () =>
    set((state) => {
      const panes = state.workspace.panes;
      if (panes.length === 0) return state;
      const idx = panes.findIndex((p) => p.id === state.activePaneId);
      if (idx === -1) return { activePaneId: panes[0]!.id };
      const next = panes[(idx + 1) % panes.length]!;
      return { activePaneId: next.id };
    }),

  focusPrevPane: () =>
    set((state) => {
      const panes = state.workspace.panes;
      if (panes.length === 0) return state;
      const idx = panes.findIndex((p) => p.id === state.activePaneId);
      if (idx === -1) return { activePaneId: panes[panes.length - 1]!.id };
      const prev = panes[(idx - 1 + panes.length) % panes.length]!;
      return { activePaneId: prev.id };
    }),

  focusPaneByIndex: (index) =>
    set((state) => {
      const pane = state.workspace.panes[index];
      if (!pane) return state;
      return { activePaneId: pane.id };
    }),

  focusDirection: (direction) => {
    const state = get();
    if (!state.activePaneId) return;

    // Query DOM for pane positions
    const elements = document.querySelectorAll<HTMLElement>('[data-pane-id]');
    const rects = new Map<string, DOMRect>();
    elements.forEach((el) => {
      const id = el.dataset.paneId;
      if (id) rects.set(id, el.getBoundingClientRect());
    });

    const activeRect = rects.get(state.activePaneId);
    if (!activeRect) return;

    const activeCx = activeRect.left + activeRect.width / 2;
    const activeCy = activeRect.top + activeRect.height / 2;

    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const [id, rect] of rects) {
      if (id === state.activePaneId) continue;

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = cx - activeCx;
      const dy = cy - activeCy;

      // Check direction constraint
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

    if (bestId) set({ activePaneId: bestId });
  },

  getPaneIndex: (paneId: string): number => {
    return get().workspace.panes.findIndex((p) => p.id === paneId);
  },

  initProjectsPath: async () => {
    if (get().projectsPath) return;
    try {
      const home = await getHomeDir();
      const sep = getPlatform() === 'windows' ? '\\' : '/';
      set({ projectsPath: home + sep + 'Desktop' + sep + 'Projects' });
    } catch {
      // Fallback if path API unavailable
      const fallback = getPlatform() === 'windows' ? 'C:\\Users' : '/home';
      set({ projectsPath: fallback });
    }
  },

  restoreLayout: () => {
    const saved = loadLayout();
    if (!saved || saved.panes.length === 0) return false;

    // Validate pane data — each needs at least id and profileId
    const validPanes = saved.panes.filter(
      (p) =>
        p.id &&
        p.profileId &&
        DEFAULT_PROFILES.some((dp) => dp.id === p.profileId),
    );
    if (validPanes.length === 0) {
      clearSavedLayout();
      return false;
    }

    // Sanitize dockviewPosition references — strip any that point to
    // pane IDs not present in the restored set (prevents dockview crash)
    const validIds = new Set(validPanes.map((p) => p.id));
    const sanitizedPanes = validPanes.map((p) => {
      if (
        p.dockviewPosition?.referenceId &&
        !validIds.has(p.dockviewPosition.referenceId)
      ) {
        const { dockviewPosition: _, ...rest } = p;
        return rest;
      }
      return p;
    });

    // Restore inner workspaces — only for panes that survived validation
    const restoredWorkspaces: Record<string, PaneWorkspace> = {};
    if (saved.paneWorkspaces) {
      for (const [parentId, pw] of Object.entries(saved.paneWorkspaces)) {
        if (validIds.has(parentId) && pw.panes?.length > 0) {
          restoredWorkspaces[parentId] = pw;
        }
      }
    }

    set((state) => ({
      workspace: {
        ...state.workspace,
        panes: sanitizedPanes,
        updatedAt: new Date().toISOString(),
      },
      activePaneId: saved.activePaneId ?? sanitizedPanes[0]?.id ?? null,
      activePreset: saved.activePreset,
      layoutVersion: state.layoutVersion + 1,
      paneWorkspaces: restoredWorkspaces,
    }));

    return true;
  },

  saveCustomLayout: (name) => {
    const state = get();
    let dockviewLayout: unknown = null;
    try {
      if (dockviewApiRef.current)
        dockviewLayout = dockviewApiRef.current.toJSON();
    } catch {
      /* ignore */
    }
    const layout: NamedLayout = {
      id: generateId(),
      name,
      panes: state.workspace.panes,
      dockviewLayout,
      ...(Object.keys(state.paneWorkspaces).length > 0
        ? { paneWorkspaces: state.paneWorkspaces }
        : {}),
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
    const validPanes = layout.panes.filter(
      (p) =>
        p.id && p.profileId && profiles.some((dp) => dp.id === p.profileId),
    );
    if (validPanes.length === 0) return;

    // Restore inner workspaces — only for panes that survived validation
    const validIds = new Set(validPanes.map((p) => p.id));
    const restoredWorkspaces: Record<string, PaneWorkspace> = {};
    if (layout.paneWorkspaces) {
      for (const [parentId, pw] of Object.entries(layout.paneWorkspaces)) {
        if (validIds.has(parentId) && pw.panes?.length > 0) {
          restoredWorkspaces[parentId] = pw;
        }
      }
    }

    set((state) => ({
      workspace: {
        ...state.workspace,
        panes: validPanes,
        updatedAt: new Date().toISOString(),
      },
      activePaneId: validPanes[0]?.id ?? null,
      activePreset: null,
      layoutVersion: state.layoutVersion + 1,
      paneWorkspaces: restoredWorkspaces,
    }));
  },

  /* ── Inner workspace actions ── */

  createPaneWorkspace: (parentPaneId) =>
    set((state) => {
      // Already has a workspace — no-op
      if (state.paneWorkspaces[parentPaneId]) return state;

      const outerPane = state.workspace.panes.find(
        (p) => p.id === parentPaneId,
      );
      if (!outerPane) return state;

      // Create the initial inner pane inheriting the outer pane's profile/cwd
      const innerPane: InnerPane = {
        id: generateId(),
        profileId: outerPane.profileId,
        title: outerPane.title,
        cwd: outerPane.cwd,
      };

      const pw: PaneWorkspace = {
        id: generateId(),
        parentPaneId,
        panes: [innerPane],
        maximizedPaneId: null,
        activePaneId: innerPane.id,
      };

      return {
        workspace: {
          ...state.workspace,
          panes: state.workspace.panes.map((p) =>
            p.id === parentPaneId ? { ...p, mode: 'workspace' as const } : p,
          ),
          updatedAt: new Date().toISOString(),
        },
        paneWorkspaces: {
          ...state.paneWorkspaces,
          [parentPaneId]: pw,
        },
      };
    }),

  removePaneWorkspace: (parentPaneId) =>
    set((state) => {
      const { [parentPaneId]: _, ...rest } = state.paneWorkspaces;
      return {
        workspace: {
          ...state.workspace,
          panes: state.workspace.panes.map((p) =>
            p.id === parentPaneId ? { ...p, mode: 'single' as const } : p,
          ),
          updatedAt: new Date().toISOString(),
        },
        paneWorkspaces: rest,
      };
    }),

  addInnerPane: (parentPaneId, profileId, direction = 'right') =>
    set((state) => {
      const pw = state.paneWorkspaces[parentPaneId];
      if (!pw) return state;

      const profile =
        state.profiles.find((p) => p.id === profileId) ?? defaultProfile;
      const refPaneId =
        pw.activePaneId ?? pw.panes[pw.panes.length - 1]?.id ?? null;

      const innerPane: InnerPane = {
        id: generateId(),
        profileId,
        title: profile.name,
        ...(refPaneId ? { splitFrom: { paneId: refPaneId, direction } } : {}),
      };

      return {
        paneWorkspaces: {
          ...state.paneWorkspaces,
          [parentPaneId]: {
            ...pw,
            panes: [...pw.panes, innerPane],
            activePaneId: innerPane.id,
          },
        },
      };
    }),

  removeInnerPane: (parentPaneId, innerPaneId) =>
    set((state) => {
      const pw = state.paneWorkspaces[parentPaneId];
      if (!pw) return state;

      const remaining = pw.panes.filter((p) => p.id !== innerPaneId);

      // If last inner pane removed, revert to single mode
      if (remaining.length === 0) {
        const { [parentPaneId]: _, ...rest } = state.paneWorkspaces;
        return {
          workspace: {
            ...state.workspace,
            panes: state.workspace.panes.map((p) =>
              p.id === parentPaneId ? { ...p, mode: 'single' as const } : p,
            ),
            updatedAt: new Date().toISOString(),
          },
          paneWorkspaces: rest,
        };
      }

      let nextActiveId = pw.activePaneId;
      if (nextActiveId === innerPaneId) {
        const oldIndex = pw.panes.findIndex((p) => p.id === innerPaneId);
        nextActiveId =
          remaining[Math.min(oldIndex, remaining.length - 1)]?.id ?? null;
      }

      return {
        paneWorkspaces: {
          ...state.paneWorkspaces,
          [parentPaneId]: {
            ...pw,
            panes: remaining,
            activePaneId: nextActiveId,
            maximizedPaneId:
              pw.maximizedPaneId === innerPaneId ? null : pw.maximizedPaneId,
          },
        },
      };
    }),

  setActiveInnerPaneId: (parentPaneId, innerPaneId) =>
    set((state) => {
      const pw = state.paneWorkspaces[parentPaneId];
      if (!pw) return state;
      return {
        paneWorkspaces: {
          ...state.paneWorkspaces,
          [parentPaneId]: { ...pw, activePaneId: innerPaneId },
        },
      };
    }),

  toggleInnerMaximize: (parentPaneId, innerPaneId) =>
    set((state) => {
      const pw = state.paneWorkspaces[parentPaneId];
      if (!pw) return state;
      return {
        paneWorkspaces: {
          ...state.paneWorkspaces,
          [parentPaneId]: {
            ...pw,
            maximizedPaneId:
              pw.maximizedPaneId === innerPaneId ? null : innerPaneId,
          },
        },
      };
    }),

  updateInnerPaneProfile: (parentPaneId, innerPaneId, profileId) =>
    set((state) => {
      const pw = state.paneWorkspaces[parentPaneId];
      if (!pw) return state;

      const profile =
        state.profiles.find((p) => p.id === profileId) ?? defaultProfile;

      return {
        paneWorkspaces: {
          ...state.paneWorkspaces,
          [parentPaneId]: {
            ...pw,
            panes: pw.panes.map((p) =>
              p.id === innerPaneId
                ? { ...p, profileId, title: profile.name }
                : p,
            ),
          },
        },
      };
    }),

  updateInnerPaneColor: (parentPaneId, innerPaneId, color) =>
    set((state) => {
      const pw = state.paneWorkspaces[parentPaneId];
      if (!pw) return state;
      return {
        paneWorkspaces: {
          ...state.paneWorkspaces,
          [parentPaneId]: {
            ...pw,
            panes: pw.panes.map((p) =>
              p.id === innerPaneId ? { ...p, colorOverride: color } : p,
            ),
          },
        },
      };
    }),

  updatePaneCwd: (paneId, cwd) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        panes: state.workspace.panes.map((p) =>
          p.id === paneId ? { ...p, cwd } : p,
        ),
      },
    })),
}));
