import { create } from 'zustand';
import type {
  Pane,
  Project,
  ProjectWorkspace,
  WorkspaceTab,
  TerminalProfile,
} from '@/types';
import { DEFAULT_PROFILES } from '@/lib/profiles';
import { GRID_PRESETS } from '@/lib/grid-presets';
import { generateId } from '@/lib/utils';
import { getHomeDir, getPlatform } from '@/lib/tauri-shim';
import {
  loadLayout,
  saveLayout,
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
import { usePaneStatusStore } from '@/store/pane-status-store';

/** Cached startup layout — parsed once, consumed by both currentLevel init and restoreLayout */
let cachedStartupLayout = loadLayout();

/* ── Helpers ── */

const defaultProfile = DEFAULT_PROFILES[0]!;

function createPane(profileId: string): Pane {
  const profile =
    DEFAULT_PROFILES.find((p) => p.id === profileId) ?? defaultProfile;
  return { id: generateId(), profileId, title: profile.name };
}

function createProjectWorkspace(
  projectId: string,
  name: string,
  cwd?: string,
  initialPaneProfileId?: string,
): ProjectWorkspace {
  const now = new Date().toISOString();
  const panes: Pane[] = [];
  if (initialPaneProfileId) {
    const pane = createPane(initialPaneProfileId);
    if (cwd) pane.cwd = cwd;
    panes.push(pane);
  }
  return {
    id: generateId(),
    projectId,
    name,
    worktreePath: cwd,
    panes,
    activePaneId: panes[0]?.id ?? null,
    maximizedPaneId: null,
    activePreset: null,
    dockviewLayout: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createProject(name: string, path: string): Project {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    path,
    mainPaneId: null,
    workspaceIds: [],
    activeWorkspaceId: '',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * When switching away from a workspace, capture the correct outgoing layout
 * and reset all expansion state. If the user is in level 2/3, the live
 * Dockview JSON is a truncated subset — use the saved pre-expand layout instead.
 */
function collapseAndCaptureOutgoing(state: WorkspaceState): {
  dockviewLayout: unknown;
  expansionReset: Partial<WorkspaceState>;
} {
  let dockviewLayout: unknown = null;
  if (state.expandedPaneId && state.preExpandLayout) {
    // Currently expanded — the live grid only shows a subset; use saved layout
    dockviewLayout = state.preExpandLayout;
  } else {
    try {
      if (dockviewApiRef.current)
        dockviewLayout = dockviewApiRef.current.toJSON();
    } catch {
      /* ignore */
    }
  }
  return {
    dockviewLayout,
    expansionReset: {
      expandedPaneId: null,
      level2PaneIds: [],
      preExpandLayout: null,
      level2Layout: null,
      level3PaneId: null,
      preLevel3Layout: null,
    },
  };
}

/**
 * Get the active project from state.
 * Use in component selectors: `useWorkspaceStore(getActiveProject)`
 */
export function getActiveProject(state: WorkspaceState): Project | undefined {
  return state.projects.find((p) => p.id === state.activeProjectId);
}

/** Get the active workspace from state (navigates through active project) */
function getActive(state: WorkspaceState): ProjectWorkspace | undefined {
  const project = getActiveProject(state);
  if (!project) return undefined;
  return state.workspaces[project.activeWorkspaceId];
}

/** Immutably update the active workspace in the flat map */
function updateActive(
  state: WorkspaceState,
  updater: (ws: ProjectWorkspace) => Partial<ProjectWorkspace>,
): Partial<WorkspaceState> {
  const ws = getActive(state);
  if (!ws) return {};
  const updates = updater(ws);
  return {
    workspaces: {
      ...state.workspaces,
      [ws.id]: { ...ws, ...updates, updatedAt: new Date().toISOString() },
    },
  };
}

/** Immutably update a specific workspace by ID in the flat map */
function updateWorkspaceById(
  workspaces: Record<string, ProjectWorkspace>,
  wsId: string,
  updates: Partial<ProjectWorkspace>,
): Record<string, ProjectWorkspace> {
  const ws = workspaces[wsId];
  if (!ws) return workspaces;
  return {
    ...workspaces,
    [wsId]: { ...ws, ...updates, updatedAt: new Date().toISOString() },
  };
}

/** Immutably update a project in the projects array */
function updateProject(
  projects: Project[],
  projectId: string,
  updates: Partial<Project>,
): Project[] {
  return projects.map((p) =>
    p.id === projectId
      ? { ...p, ...updates, updatedAt: new Date().toISOString() }
      : p,
  );
}

/* ── Exported compat helpers ── */

/**
 * Get the active workspace for the active project.
 * Use in component selectors: `useWorkspaceStore(getActiveWorkspace)`
 */
export function getActiveWorkspace(
  state: WorkspaceState,
): ProjectWorkspace | undefined {
  return getActive(state);
}

/**
 * Get all workspaces for the active project as an ordered array.
 * Use in tab-strip and other components that list workspace tabs.
 */
export function getProjectWorkspaceList(
  state: WorkspaceState,
): ProjectWorkspace[] {
  const project = getActiveProject(state);
  if (!project) return [];
  return project.workspaceIds
    .map((id) => state.workspaces[id])
    .filter(Boolean) as ProjectWorkspace[];
}

/**
 * Get ALL pane IDs across all workspaces (for orphan cleanup).
 */
export function getAllPaneIds(state: WorkspaceState): string[] {
  return Object.values(state.workspaces).flatMap((w) =>
    w.panes.map((p) => p.id),
  );
}

/**
 * Get the active workspace ID (for compat with consumers that
 * previously used state.activeWorkspaceId directly).
 */
export function getActiveWorkspaceId(
  state: WorkspaceState,
): string | undefined {
  const project = getActiveProject(state);
  return project?.activeWorkspaceId;
}

/* ── State interface ── */

export interface WorkspaceState {
  // Level 1 — Projects
  projects: Project[];
  activeProjectId: string | null;
  currentLevel: 1 | 2 | 3;

  // Flat workspace map (keyed by workspace ID)
  workspaces: Record<string, ProjectWorkspace>;

  // Profiles & UI
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
  /** Dockview layout saved from level 2 (for re-expansion) */
  level2Layout: unknown;
  /** Level 3 — single pane maximized within level 2 (no splits allowed) */
  level3PaneId: string | null;
  /** Dockview layout saved before entering level 3 */
  preLevel3Layout: unknown;

  // Project actions
  addProject: (name: string, path: string) => string;
  removeProject: (id: string) => void;
  setActiveProject: (id: string) => void;
  goToLevel1: () => void;
  setMainPane: (paneId: string) => void;

  // Workspace tab actions (scoped to active project)
  addWorkspace: (name: string, cwd?: string, profileId?: string) => string;
  removeWorkspace: (id: string) => void;
  setActiveWorkspace: (id: string) => void;
  renameWorkspaceTab: (id: string, name: string) => void;
  nextWorkspace: () => void;
  prevWorkspace: () => void;

  // Level 2 — expand a single pane full-screen
  expandPane: (paneId: string) => void;
  collapsePane: () => void;
  // Level 3 — maximize one terminal within level 2
  enterLevel3: (paneId: string) => void;
  exitLevel3: () => void;

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

  // Worktree
  showWorktreeDialog: boolean;
  setShowWorktreeDialog: (show: boolean) => void;
  addWorktreeWorkspace: (
    worktreePath: string,
    worktreeBranch: string,
  ) => string;

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
  projects: [],
  activeProjectId: null,
  currentLevel: (cachedStartupLayout ? 2 : 1) as 1 | 2 | 3, // Level 2 if saved layout exists, else Level 1
  workspaces: {},
  expandedPaneId: null,
  level2PaneIds: [],
  preExpandLayout: null,
  level2Layout: null,
  level3PaneId: null,
  preLevel3Layout: null,
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
  showWorktreeDialog: false,
  customLayouts: loadNamedLayouts(),

  /* ── Project actions ── */

  addProject: (name, path) => {
    const project = createProject(name, path);
    const ws = createProjectWorkspace(project.id, 'Default', path);
    project.workspaceIds = [ws.id];
    project.activeWorkspaceId = ws.id;

    set((s) => ({
      projects: [...s.projects, project],
      workspaces: { ...s.workspaces, [ws.id]: ws },
      activeProjectId: project.id,
      currentLevel: 2,
      layoutVersion: s.layoutVersion + 1,
    }));

    return project.id;
  },

  removeProject: (id) => {
    const state = get();
    const project = state.projects.find((p) => p.id === id);
    if (!project) return;

    // Destroy all terminal entries for all workspaces in this project
    for (const wsId of project.workspaceIds) {
      const ws = state.workspaces[wsId];
      if (ws) {
        for (const pane of ws.panes) {
          destroyTerminalEntry(pane.id);
        }
      }
    }

    // Remove workspaces from flat map
    const nextWorkspaces = { ...state.workspaces };
    for (const wsId of project.workspaceIds) {
      delete nextWorkspaces[wsId];
    }

    const remaining = state.projects.filter((p) => p.id !== id);
    const idx = state.projects.findIndex((p) => p.id === id);
    let nextActiveId = state.activeProjectId;
    if (nextActiveId === id) {
      nextActiveId = remaining[Math.min(idx, remaining.length - 1)]?.id ?? null;
    }

    set((s) => ({
      projects: remaining,
      workspaces: nextWorkspaces,
      activeProjectId: nextActiveId,
      currentLevel: nextActiveId ? s.currentLevel : 1,
      expandedPaneId: null,
      level2PaneIds: [],
      preExpandLayout: null,
      level2Layout: null,
      level3PaneId: null,
      preLevel3Layout: null,
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  setActiveProject: (id) => {
    const state = get();
    if (state.activeProjectId === id && state.currentLevel >= 2) return;

    // Capture outgoing workspace layout if switching projects
    if (state.activeProjectId && state.activeProjectId !== id) {
      const { dockviewLayout, expansionReset } =
        collapseAndCaptureOutgoing(state);
      const project = getActiveProject(state);
      if (project) {
        set((s) => ({
          workspaces: updateWorkspaceById(
            s.workspaces,
            project.activeWorkspaceId,
            { dockviewLayout },
          ),
          ...expansionReset,
        }));
      }
    }

    set((s) => ({
      activeProjectId: id,
      currentLevel: 2,
      layoutVersion: s.layoutVersion + 1,
    }));

    // Flush to localStorage — outgoing grid unmounts on project switch
    const s = get();
    saveLayout(s.projects, s.workspaces, s.activeProjectId);
  },

  goToLevel1: () => {
    const state = get();
    const { dockviewLayout, expansionReset } =
      collapseAndCaptureOutgoing(state);
    const project = getActiveProject(state);

    set((s) => ({
      ...(project
        ? {
            workspaces: updateWorkspaceById(
              s.workspaces,
              project.activeWorkspaceId,
              { dockviewLayout },
            ),
          }
        : {}),
      ...expansionReset,
      currentLevel: 1 as const,
      layoutVersion: s.layoutVersion + 1,
    }));

    // Flush to localStorage synchronously — the grid unmounts on level change
    // and would cancel the debounced save in TerminalGrid
    const s = get();
    saveLayout(s.projects, s.workspaces, s.activeProjectId);
  },

  setMainPane: (paneId) => {
    const state = get();
    const project = getActiveProject(state);
    if (!project) return;
    set((s) => ({
      projects: updateProject(s.projects, project.id, { mainPaneId: paneId }),
    }));
  },

  /* ── Workspace tab actions (scoped to active project) ── */

  addWorkspace: (name, cwd, profileId) => {
    const state = get();
    const project = getActiveProject(state);

    if (!project) {
      // No project — create one with a workspace
      const newProject = createProject(name, cwd ?? '');
      const ws = createProjectWorkspace(
        newProject.id,
        name,
        cwd,
        profileId ?? 'system-shell',
      );
      newProject.workspaceIds = [ws.id];
      newProject.activeWorkspaceId = ws.id;
      newProject.mainPaneId = ws.panes[0]?.id ?? null;

      set((s) => ({
        projects: [...s.projects, newProject],
        workspaces: { ...s.workspaces, [ws.id]: ws },
        activeProjectId: newProject.id,
        currentLevel: 2,
        layoutVersion: s.layoutVersion + 1,
        showProjectBrowser: false,
      }));

      return ws.id;
    }

    const ws = createProjectWorkspace(
      project.id,
      name,
      cwd,
      profileId ?? 'system-shell',
    );

    const { dockviewLayout, expansionReset } =
      collapseAndCaptureOutgoing(state);

    set((s) => ({
      workspaces: {
        ...updateWorkspaceById(s.workspaces, project.activeWorkspaceId, {
          dockviewLayout,
        }),
        [ws.id]: ws,
      },
      projects: updateProject(s.projects, project.id, {
        workspaceIds: [...project.workspaceIds, ws.id],
        activeWorkspaceId: ws.id,
      }),
      ...expansionReset,
      layoutVersion: s.layoutVersion + 1,
      showProjectBrowser: false,
    }));

    return ws.id;
  },

  removeWorkspace: (id) => {
    const state = get();
    const project = getActiveProject(state);
    if (!project) return;

    const idx = project.workspaceIds.indexOf(id);
    if (idx === -1) return;

    // Destroy all terminal entries for the removed workspace
    const ws = state.workspaces[id];
    if (ws) {
      for (const pane of ws.panes) {
        destroyTerminalEntry(pane.id);
      }
    }

    const remainingIds = project.workspaceIds.filter((wId) => wId !== id);
    let nextActiveWsId = project.activeWorkspaceId;
    if (nextActiveWsId === id) {
      nextActiveWsId =
        remainingIds[Math.min(idx, remainingIds.length - 1)] ?? '';
    }

    // Remove from flat map
    const nextWorkspaces = { ...state.workspaces };
    delete nextWorkspaces[id];

    // Clear expansion state if the removed workspace owned the expanded pane
    const needsReset =
      state.expandedPaneId &&
      ws?.panes.some((p) => p.id === state.expandedPaneId);

    set((s) => ({
      workspaces: nextWorkspaces,
      projects: updateProject(s.projects, project.id, {
        workspaceIds: remainingIds,
        activeWorkspaceId: nextActiveWsId,
      }),
      ...(needsReset
        ? {
            expandedPaneId: null,
            level2PaneIds: [],
            preExpandLayout: null,
            level2Layout: null,
            level3PaneId: null,
            preLevel3Layout: null,
          }
        : {}),
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  setActiveWorkspace: (id) => {
    const state = get();
    const project = getActiveProject(state);
    if (!project || project.activeWorkspaceId === id) return;

    const { dockviewLayout, expansionReset } =
      collapseAndCaptureOutgoing(state);

    set((s) => ({
      workspaces: updateWorkspaceById(s.workspaces, project.activeWorkspaceId, {
        dockviewLayout,
      }),
      projects: updateProject(s.projects, project.id, {
        activeWorkspaceId: id,
      }),
      ...expansionReset,
      layoutVersion: s.layoutVersion + 1,
    }));

    // Flush to localStorage — outgoing grid unmounts on workspace switch
    const s = get();
    saveLayout(s.projects, s.workspaces, s.activeProjectId);
  },

  renameWorkspaceTab: (id, name) =>
    set((s) => ({
      workspaces: updateWorkspaceById(s.workspaces, id, { name }),
    })),

  nextWorkspace: () => {
    const state = get();
    const project = getActiveProject(state);
    if (!project || project.workspaceIds.length <= 1) return;

    const { dockviewLayout, expansionReset } =
      collapseAndCaptureOutgoing(state);

    const idx = project.workspaceIds.indexOf(project.activeWorkspaceId);
    const nextIdx = (idx + 1) % project.workspaceIds.length;
    const nextWsId = project.workspaceIds[nextIdx]!;

    set((s) => ({
      workspaces: updateWorkspaceById(s.workspaces, project.activeWorkspaceId, {
        dockviewLayout,
      }),
      projects: updateProject(s.projects, project.id, {
        activeWorkspaceId: nextWsId,
      }),
      ...expansionReset,
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  prevWorkspace: () => {
    const state = get();
    const project = getActiveProject(state);
    if (!project || project.workspaceIds.length <= 1) return;

    const { dockviewLayout, expansionReset } =
      collapseAndCaptureOutgoing(state);

    const idx = project.workspaceIds.indexOf(project.activeWorkspaceId);
    const prevIdx =
      (idx - 1 + project.workspaceIds.length) % project.workspaceIds.length;
    const prevWsId = project.workspaceIds[prevIdx]!;

    set((s) => ({
      workspaces: updateWorkspaceById(s.workspaces, project.activeWorkspaceId, {
        dockviewLayout,
      }),
      projects: updateProject(s.projects, project.id, {
        activeWorkspaceId: prevWsId,
      }),
      ...expansionReset,
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  /* ── Level 2 — expand/collapse ── */

  expandPane: (paneId) => {
    // Save grid Dockview layout before expanding
    let preExpandLayout: unknown = null;
    try {
      if (dockviewApiRef.current)
        preExpandLayout = dockviewApiRef.current.toJSON();
    } catch {
      /* ignore */
    }

    const state = get();
    const ws = getActive(state);

    // If re-expanding the same pane, reuse its saved level 2 pane IDs
    const existingL2 =
      ws?.panes
        .filter((p) => p.id !== paneId)
        .filter((p) => {
          // A pane is a level 2 pane if it was previously tracked
          return state.level2PaneIds.includes(p.id);
        })
        .map((p) => p.id) ?? [];

    set((s) => ({
      expandedPaneId: paneId,
      level2PaneIds: existingL2,
      preExpandLayout,
      ...updateActive(s, () => ({ maximizedPaneId: null })),
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  collapsePane: () => {
    // Save the level 2 Dockview layout for re-expansion
    let level2Layout: unknown = null;
    try {
      if (dockviewApiRef.current)
        level2Layout = dockviewApiRef.current.toJSON();
    } catch {
      /* ignore */
    }

    set((s) => ({
      expandedPaneId: null,
      // Keep level2PaneIds so re-expand knows which panes belong to level 2
      level2Layout,
      level3PaneId: null,
      preLevel3Layout: null,
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  enterLevel3: (paneId) => {
    // Save level 2 Dockview layout, then show only this one pane
    let preLevel3Layout: unknown = null;
    try {
      if (dockviewApiRef.current)
        preLevel3Layout = dockviewApiRef.current.toJSON();
    } catch {
      /* ignore */
    }

    set((s) => ({
      level3PaneId: paneId,
      preLevel3Layout,
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  exitLevel3: () => {
    set((s) => ({
      level3PaneId: null,
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  /* ── Pane actions (scoped to active workspace) ── */

  setActivePaneId: (id) =>
    set((state) => updateActive(state, () => ({ activePaneId: id }))),

  addPane: (profileId, direction = 'right') =>
    set((state) => {
      // Block adding panes in level 3
      if (state.level3PaneId) return state;

      const ws = getActive(state);
      if (!ws) {
        // No workspace — create a project + workspace
        const newProject = createProject('New Project', '');
        const newWs = createProjectWorkspace(
          newProject.id,
          'Default',
          undefined,
          profileId,
        );
        newProject.workspaceIds = [newWs.id];
        newProject.activeWorkspaceId = newWs.id;
        newProject.mainPaneId = newWs.panes[0]?.id ?? null;

        return {
          projects: [...state.projects, newProject],
          workspaces: { ...state.workspaces, [newWs.id]: newWs },
          activeProjectId: newProject.id,
          currentLevel: 2 as const,
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
      if (state.level3PaneId) return state;
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

      // If the removed pane was the project's mainPaneId, pick a new one
      const project = getActiveProject(state);
      let projectUpdate: Partial<WorkspaceState> = {};
      if (project && project.mainPaneId === id) {
        const newMainId = nextActiveId ?? remaining[0]?.id ?? null;
        projectUpdate = {
          projects: updateProject(state.projects, project.id, {
            mainPaneId: newMainId,
          }),
        };
      }

      // Clear global expansion/level state if the removed pane is involved
      let levelReset: Partial<WorkspaceState> = {};
      if (state.expandedPaneId === id) {
        // Closing the expanded pane — collapse back to full grid
        levelReset = {
          expandedPaneId: null,
          level2PaneIds: [],
          preExpandLayout: null,
          level2Layout: null,
          level3PaneId: null,
          preLevel3Layout: null,
        };
      } else if (state.level3PaneId === id) {
        // Closing the level-3 pane — drop back to level 2
        levelReset = { level3PaneId: null };
      }
      // Remove pane from level2PaneIds if it was a level-2 ephemeral pane
      if (state.level2PaneIds.includes(id)) {
        levelReset.level2PaneIds = state.level2PaneIds.filter((p) => p !== id);
      }

      return {
        ...updateActive(state, () => ({
          panes: remaining,
          activePaneId: nextActiveId,
          activePreset: null,
          maximizedPaneId:
            ws.maximizedPaneId === id ? null : ws.maximizedPaneId,
        })),
        ...projectUpdate,
        ...levelReset,
      };
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
        expandedPaneId: null,
        level2PaneIds: [],
        level2Layout: null,
        level3PaneId: null,
        preExpandLayout: null,
        preLevel3Layout: null,
        layoutVersion: state.layoutVersion + 1,
        showProjectBrowser: false,
      };
    }),

  clearAllPanes: () => {
    const ws = getActive(get());
    if (ws) {
      for (const pane of ws.panes) {
        destroyTerminalEntry(pane.id);
      }
      usePaneStatusStore.getState().clearAll();
    }
    set((state) => {
      if (!getActive(state)) return state;
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
    });
  },

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
    if (state.level3PaneId) {
      // In level 3 — go back to level 2
      state.exitLevel3();
    } else if (state.expandedPaneId) {
      // In level 2 — enter level 3 (maximize single terminal)
      state.enterLevel3(paneId);
    } else {
      // In level 1 — enter level 2
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
  setShowWorktreeDialog: (show) => set({ showWorktreeDialog: show }),

  /* ── Worktree workspace ── */

  addWorktreeWorkspace: (worktreePath, worktreeBranch) => {
    const state = get();
    const project = getActiveProject(state);
    if (!project) return '';

    const currentWs = state.workspaces[project.activeWorkspaceId];

    // Clone panes from current workspace with new IDs and updated cwd
    const clonedPanes: Pane[] = (currentWs?.panes ?? []).map((p) => ({
      ...p,
      id: generateId(),
      cwd: worktreePath,
      dockviewPosition: undefined,
    }));

    const now = new Date().toISOString();
    const ws: ProjectWorkspace = {
      id: generateId(),
      projectId: project.id,
      name: worktreeBranch,
      worktreePath,
      worktreeBranch,
      panes: clonedPanes,
      activePaneId: clonedPanes[0]?.id ?? null,
      maximizedPaneId: null,
      activePreset: null,
      dockviewLayout: null, // Dockview rebuilds from pane positions
      createdAt: now,
      updatedAt: now,
    };

    const { dockviewLayout, expansionReset } =
      collapseAndCaptureOutgoing(state);

    set((s) => ({
      workspaces: {
        ...updateWorkspaceById(s.workspaces, project.activeWorkspaceId, {
          dockviewLayout,
        }),
        [ws.id]: ws,
      },
      projects: updateProject(s.projects, project.id, {
        workspaceIds: [...project.workspaceIds, ws.id],
        activeWorkspaceId: ws.id,
      }),
      ...expansionReset,
      showWorktreeDialog: false,
      layoutVersion: s.layoutVersion + 1,
    }));

    return ws.id;
  },

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
    const saved = cachedStartupLayout ?? loadLayout();
    cachedStartupLayout = null; // Release cached reference after first use
    if (!saved) return false;

    const profiles = get().profiles;

    // Validate workspaces and their panes
    const validWorkspaces: Record<string, ProjectWorkspace> = {};
    for (const [wsId, ws] of Object.entries(saved.workspaces)) {
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

      if (sanitizedPanes.length > 0) {
        validWorkspaces[wsId] = {
          ...ws,
          panes: sanitizedPanes,
          activePaneId:
            ws.activePaneId && validIds.has(ws.activePaneId)
              ? ws.activePaneId
              : (sanitizedPanes[0]?.id ?? null),
        };
      }
    }

    if (Object.keys(validWorkspaces).length === 0) {
      clearSavedLayout();
      return false;
    }

    // Validate projects — ensure their workspaceIds reference valid workspaces
    const validProjects = saved.projects
      .map((project) => {
        const validWsIds = project.workspaceIds.filter(
          (id) => validWorkspaces[id],
        );
        if (validWsIds.length === 0) return null;
        const activeWsId = validWsIds.includes(project.activeWorkspaceId)
          ? project.activeWorkspaceId
          : validWsIds[0]!;
        return {
          ...project,
          workspaceIds: validWsIds,
          activeWorkspaceId: activeWsId,
        };
      })
      .filter(Boolean) as Project[];

    if (validProjects.length === 0) {
      clearSavedLayout();
      return false;
    }

    const activeProjectId =
      saved.activeProjectId &&
      validProjects.some((p) => p.id === saved.activeProjectId)
        ? saved.activeProjectId
        : validProjects[0]!.id;

    set((state) => ({
      projects: validProjects,
      workspaces: validWorkspaces,
      activeProjectId,
      currentLevel: 2,
      layoutVersion: state.layoutVersion + 1,
    }));

    return true;
  },

  saveCustomLayout: (name) => {
    const state = get();
    const project = getActiveProject(state);
    if (!project) return;

    // Use canonical layout when expanded (live grid is a filtered subset)
    let dockviewLayout: unknown = null;
    if (state.expandedPaneId && state.preExpandLayout) {
      dockviewLayout = state.preExpandLayout;
    } else {
      try {
        if (dockviewApiRef.current)
          dockviewLayout = dockviewApiRef.current.toJSON();
      } catch {
        /* ignore */
      }
    }

    const updatedWorkspaces = updateWorkspaceById(
      state.workspaces,
      project.activeWorkspaceId,
      { dockviewLayout },
    );

    // Convert to V2-compat WorkspaceTab[] for named layout storage
    const workspaceTabs: WorkspaceTab[] = project.workspaceIds
      .map((id) => updatedWorkspaces[id])
      .filter(Boolean)
      .map((ws) => ({
        id: ws!.id,
        name: ws!.name,
        color: ws!.color,
        cwd: ws!.worktreePath,
        panes: ws!.panes,
        activePaneId: ws!.activePaneId,
        maximizedPaneId: ws!.maximizedPaneId,
        activePreset: ws!.activePreset,
        dockviewLayout: ws!.dockviewLayout,
        createdAt: ws!.createdAt,
        updatedAt: ws!.updatedAt,
      }));

    const layout: NamedLayout = {
      id: generateId(),
      name,
      workspaces: workspaceTabs,
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
    const state = get();
    const profiles = state.profiles;
    const project = getActiveProject(state);

    // Named layouts store WorkspaceTab[] — convert to ProjectWorkspace
    // Generate fresh IDs so importing a layout never collides with live state
    const projectId = project?.id ?? generateId();

    const convertedWorkspaces: Record<string, ProjectWorkspace> = {};
    const wsIds: string[] = [];

    for (const wsTab of layout.workspaces) {
      const validPanes = wsTab.panes.filter(
        (p) =>
          p.id && p.profileId && profiles.some((dp) => dp.id === p.profileId),
      );
      if (validPanes.length === 0) continue;

      // Build old→new pane ID map
      const paneIdMap = new Map<string, string>();
      for (const p of validPanes) {
        paneIdMap.set(p.id, generateId());
      }

      // Rekey pane IDs and remap internal references
      const rekeyedPanes: Pane[] = validPanes.map((p) => ({
        ...p,
        id: paneIdMap.get(p.id)!,
        dockviewPosition: p.dockviewPosition
          ? {
              ...p.dockviewPosition,
              referenceId: p.dockviewPosition.referenceId
                ? (paneIdMap.get(p.dockviewPosition.referenceId) ??
                  p.dockviewPosition.referenceId)
                : undefined,
            }
          : undefined,
        splitFrom: p.splitFrom
          ? {
              ...p.splitFrom,
              paneId: paneIdMap.get(p.splitFrom.paneId) ?? p.splitFrom.paneId,
            }
          : undefined,
      }));

      const newWsId = generateId();
      const pw: ProjectWorkspace = {
        id: newWsId,
        projectId,
        name: wsTab.name,
        worktreePath: wsTab.cwd,
        panes: rekeyedPanes,
        activePaneId: wsTab.activePaneId
          ? (paneIdMap.get(wsTab.activePaneId) ?? rekeyedPanes[0]?.id ?? null)
          : (rekeyedPanes[0]?.id ?? null),
        maximizedPaneId: wsTab.maximizedPaneId
          ? (paneIdMap.get(wsTab.maximizedPaneId) ?? null)
          : null,
        activePreset: wsTab.activePreset,
        // Null out dockviewLayout — embedded panel IDs no longer match
        // The grid will rebuild positioning from the pane list
        dockviewLayout: null,
        color: wsTab.color,
        createdAt: wsTab.createdAt,
        updatedAt: wsTab.updatedAt,
      };
      convertedWorkspaces[pw.id] = pw;
      wsIds.push(pw.id);
    }

    if (wsIds.length === 0) return;

    if (project) {
      // Replace workspaces in existing project
      // Remove old workspaces
      const nextWorkspaces = { ...state.workspaces };
      for (const oldId of project.workspaceIds) {
        delete nextWorkspaces[oldId];
      }
      // Add new ones
      Object.assign(nextWorkspaces, convertedWorkspaces);

      set((s) => ({
        workspaces: nextWorkspaces,
        projects: updateProject(s.projects, project.id, {
          workspaceIds: wsIds,
          activeWorkspaceId: wsIds[0]!,
        }),
        layoutVersion: s.layoutVersion + 1,
      }));
    } else {
      // Create a new project for the layout
      const newProject = createProject(layout.name, '');
      newProject.workspaceIds = wsIds;
      newProject.activeWorkspaceId = wsIds[0]!;

      set((s) => ({
        projects: [...s.projects, newProject],
        workspaces: { ...s.workspaces, ...convertedWorkspaces },
        activeProjectId: newProject.id,
        currentLevel: 2,
        layoutVersion: s.layoutVersion + 1,
      }));
    }
  },
}));
