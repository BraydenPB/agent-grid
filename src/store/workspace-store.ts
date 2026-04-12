import { create } from 'zustand';
import type { Pane, Project, WorktreeTab, TerminalProfile } from '@/types';
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

function createWorktreeTab(
  projectId: string,
  name: string,
  branch: string,
  cwd: string,
  initialPaneProfileId?: string,
): WorktreeTab {
  const now = new Date().toISOString();
  const panes: Pane[] = [];
  if (initialPaneProfileId) {
    const pane = createPane(initialPaneProfileId);
    pane.cwd = cwd;
    panes.push(pane);
  }
  return {
    id: generateId(),
    projectId,
    name,
    branch,
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

function createProject(name: string, path: string): Project {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    path,
    mainPaneId: null,
    defaultProfileId: 'system-shell',
    worktreeIds: [],
    activeWorktreeId: '',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Capture the current Dockview layout JSON.
 * Call before any level/worktree transition that unmounts the grid.
 */
function captureOutgoingLayout(): unknown {
  try {
    if (dockviewApiRef.current) return dockviewApiRef.current.toJSON();
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Get the active project from state.
 * Use in component selectors: `useWorkspaceStore(getActiveProject)`
 */
export function getActiveProject(state: WorkspaceState): Project | undefined {
  return state.projects.find((p) => p.id === state.activeProjectId);
}

/** Get the active worktree from state (navigates through active project) */
function getActive(state: WorkspaceState): WorktreeTab | undefined {
  const project = getActiveProject(state);
  if (!project) return undefined;
  return state.worktrees[project.activeWorktreeId];
}

/** Immutably update the active worktree in the flat map */
function updateActive(
  state: WorkspaceState,
  updater: (wt: WorktreeTab) => Partial<WorktreeTab>,
): Partial<WorkspaceState> {
  const wt = getActive(state);
  if (!wt) return {};
  const updates = updater(wt);
  return {
    worktrees: {
      ...state.worktrees,
      [wt.id]: { ...wt, ...updates, updatedAt: new Date().toISOString() },
    },
  };
}

/** Immutably update a specific worktree by ID in the flat map */
function updateWorktreeById(
  worktrees: Record<string, WorktreeTab>,
  wtId: string,
  updates: Partial<WorktreeTab>,
): Record<string, WorktreeTab> {
  const wt = worktrees[wtId];
  if (!wt) return worktrees;
  return {
    ...worktrees,
    [wtId]: { ...wt, ...updates, updatedAt: new Date().toISOString() },
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

/* ── Exported selectors ── */

/**
 * Get the active worktree for the active project.
 * Use in component selectors: `useWorkspaceStore(getActiveWorktree)`
 */
export function getActiveWorktree(
  state: WorkspaceState,
): WorktreeTab | undefined {
  return getActive(state);
}

/**
 * Get all worktree tabs for the active project as an ordered array.
 * Use in tab-strip and other components that list worktree tabs.
 */
export function getProjectWorktreeList(state: WorkspaceState): WorktreeTab[] {
  const project = getActiveProject(state);
  if (!project) return [];
  return project.worktreeIds
    .map((id) => state.worktrees[id])
    .filter(Boolean) as WorktreeTab[];
}

/**
 * Get ALL pane IDs across all worktrees (for orphan cleanup).
 */
export function getAllPaneIds(state: WorkspaceState): string[] {
  return Object.values(state.worktrees).flatMap((w) =>
    w.panes.map((p) => p.id),
  );
}

/**
 * Get the active worktree ID (for compat with consumers that
 * need the active worktree ID directly).
 */
export function getActiveWorktreeId(state: WorkspaceState): string | undefined {
  const project = getActiveProject(state);
  return project?.activeWorktreeId;
}

/**
 * Get all projects that are currently open on the dashboard.
 */
export function getOpenProjects(state: WorkspaceState): Project[] {
  return state.openProjectIds
    .map((id) => state.projects.find((p) => p.id === id))
    .filter(Boolean) as Project[];
}

/**
 * Get the main pane for each open project (one per project, for dashboard).
 */
export function getDashboardPanes(state: WorkspaceState): Pane[] {
  return getOpenProjects(state)
    .map((project) => {
      if (!project.mainPaneId) return undefined;
      const wt = state.worktrees[project.activeWorktreeId];
      return wt?.panes.find((p) => p.id === project.mainPaneId);
    })
    .filter(Boolean) as Pane[];
}

/* ── State interface ── */

export interface WorkspaceState {
  // Level system
  projects: Project[];
  activeProjectId: string | null;
  currentLevel: 1 | 2 | 3;

  // Dashboard (level 2)
  openProjectIds: string[];
  dashboardLayout: unknown;

  // Flat worktree map (keyed by worktree ID)
  worktrees: Record<string, WorktreeTab>;

  // Profiles & UI
  profiles: TerminalProfile[];
  layoutVersion: number;
  projectsPath: string;
  rootFolderPath: string | null;
  showProjectBrowser: boolean;
  changeDirPaneId: string | null;
  pendingCwd: { paneId: string; path: string } | null;
  showCommandPalette: boolean;
  customLayouts: NamedLayout[];

  // Project actions
  addProject: (name: string, path: string) => string;
  removeProject: (id: string) => void;
  openProject: (id: string) => void;
  closeProject: (id: string) => void;
  focusProject: (id: string) => void;
  goToFolderBrowser: () => void;
  goToDashboard: () => void;
  setMainPane: (paneId: string) => void;

  // Worktree tab actions (scoped to active project)
  addWorktreeTab: (branch: string, cwd: string, profileId?: string) => string;
  removeWorktreeTab: (id: string) => void;
  setActiveWorktree: (id: string) => void;
  renameWorktreeTab: (id: string, name: string) => void;
  nextWorktree: () => void;
  prevWorktree: () => void;

  // Pane actions (scoped to active worktree)
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

  // Worktree creation (git worktree + new tab)
  showWorktreeDialog: boolean;
  setShowWorktreeDialog: (show: boolean) => void;
  createWorktreeFromGit: (
    worktreePath: string,
    worktreeBranch: string,
  ) => string;

  // UI actions
  setProjectsPath: (path: string) => void;
  setRootFolderPath: (path: string) => void;
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
  currentLevel: (cachedStartupLayout ? 2 : 1) as 1 | 2 | 3,
  openProjectIds: [],
  dashboardLayout: null,
  worktrees: {},
  profiles: (() => {
    const saved = loadProfileColors();
    return DEFAULT_PROFILES.map((p) => ({
      ...p,
      ...(saved[p.id] ? { color: saved[p.id] } : {}),
    }));
  })(),
  layoutVersion: 0,
  projectsPath: '',
  rootFolderPath: null,
  showProjectBrowser: false,
  changeDirPaneId: null,
  pendingCwd: null,
  showCommandPalette: false,
  showWorktreeDialog: false,
  customLayouts: loadNamedLayouts(),

  /* ── Project actions ── */

  addProject: (name, path) => {
    const project = createProject(name, path);
    const wt = createWorktreeTab(
      project.id,
      'main',
      'main',
      path,
      project.defaultProfileId,
    );
    project.worktreeIds = [wt.id];
    project.activeWorktreeId = wt.id;
    project.mainPaneId = wt.panes[0]?.id ?? null;

    set((s) => ({
      projects: [...s.projects, project],
      worktrees: { ...s.worktrees, [wt.id]: wt },
      openProjectIds: [...s.openProjectIds, project.id],
      activeProjectId: project.id,
      currentLevel: 2,
      dashboardLayout: null,
      layoutVersion: s.layoutVersion + 1,
    }));

    // Flush to localStorage — new project should persist
    saveLayout(get());

    return project.id;
  },

  removeProject: (id) => {
    const state = get();
    const project = state.projects.find((p) => p.id === id);
    if (!project) return;

    // Destroy all terminal entries for all worktrees in this project
    for (const wtId of project.worktreeIds) {
      const wt = state.worktrees[wtId];
      if (wt) {
        for (const pane of wt.panes) {
          destroyTerminalEntry(pane.id);
        }
      }
    }

    // Remove worktrees from flat map
    const nextWorktrees = { ...state.worktrees };
    for (const wtId of project.worktreeIds) {
      delete nextWorktrees[wtId];
    }

    const remaining = state.projects.filter((p) => p.id !== id);
    const nextOpenIds = state.openProjectIds.filter((pid) => pid !== id);

    let nextActiveId = state.activeProjectId;
    if (nextActiveId === id) {
      nextActiveId = nextOpenIds[0] ?? null;
    }

    set((s) => ({
      projects: remaining,
      worktrees: nextWorktrees,
      openProjectIds: nextOpenIds,
      activeProjectId: nextActiveId,
      currentLevel: nextOpenIds.length > 0 ? s.currentLevel : 1,
      dashboardLayout: null,
      layoutVersion: s.layoutVersion + 1,
    }));

    // Flush to localStorage — project deletion should persist
    saveLayout(get());
  },

  openProject: (id) => {
    const state = get();
    if (state.openProjectIds.includes(id)) {
      // Already open — go to dashboard
      set({ currentLevel: 2 });
      return;
    }

    const project = state.projects.find((p) => p.id === id);
    if (!project) return;

    // Ensure project has a main worktree tab with at least one pane
    let worktrees = state.worktrees;
    let projects = state.projects;
    if (project.worktreeIds.length === 0) {
      const wt = createWorktreeTab(
        project.id,
        'main',
        'main',
        project.path,
        project.defaultProfileId,
      );
      worktrees = { ...worktrees, [wt.id]: wt };
      const updated = {
        ...project,
        worktreeIds: [wt.id],
        activeWorktreeId: wt.id,
        mainPaneId: wt.panes[0]?.id ?? null,
        updatedAt: new Date().toISOString(),
      };
      projects = projects.map((p) => (p.id === id ? updated : p));
    } else {
      // Ensure mainPaneId exists
      const activeWt = worktrees[project.activeWorktreeId];
      if (!project.mainPaneId && activeWt && activeWt.panes.length > 0) {
        projects = updateProject(projects, id, {
          mainPaneId: activeWt.panes[0]!.id,
        });
      } else if (!project.mainPaneId && activeWt) {
        // No panes — create one
        const pane = createPane(project.defaultProfileId);
        pane.cwd = activeWt.cwd;
        const updatedWt = {
          ...activeWt,
          panes: [...activeWt.panes, pane],
          activePaneId: pane.id,
          updatedAt: new Date().toISOString(),
        };
        worktrees = { ...worktrees, [activeWt.id]: updatedWt };
        projects = updateProject(projects, id, { mainPaneId: pane.id });
      }
    }

    set((s) => ({
      projects,
      worktrees,
      openProjectIds: [...s.openProjectIds, id],
      currentLevel: 2,
      dashboardLayout: null,
      layoutVersion: s.layoutVersion + 1,
    }));

    // Flush to localStorage — openProjectIds changed
    saveLayout(get());
  },

  closeProject: (id) => {
    const state = get();
    if (!state.openProjectIds.includes(id)) return;

    // Destroy all terminal entries for this project
    const project = state.projects.find((p) => p.id === id);
    if (project) {
      for (const wtId of project.worktreeIds) {
        const wt = state.worktrees[wtId];
        if (wt) {
          for (const pane of wt.panes) {
            destroyTerminalEntry(pane.id);
            usePaneStatusStore.getState().removeStatus(pane.id);
          }
        }
      }
    }

    const nextOpenIds = state.openProjectIds.filter((pid) => pid !== id);
    let nextActiveId = state.activeProjectId;
    const closedActive = nextActiveId === id;
    if (closedActive) {
      nextActiveId = nextOpenIds[0] ?? null;
    }

    // Preserve currentLevel when closing a non-active project.
    // If closing active project at level 3, drop to dashboard.
    // If no projects remain, drop to folder browser.
    let nextLevel = state.currentLevel;
    if (nextOpenIds.length === 0) {
      nextLevel = 1;
    } else if (closedActive && state.currentLevel === 3) {
      nextLevel = 2;
    }

    set((s) => ({
      openProjectIds: nextOpenIds,
      activeProjectId: nextActiveId,
      currentLevel: nextLevel,
      dashboardLayout: null,
      layoutVersion: s.layoutVersion + 1,
    }));

    // Flush to localStorage — terminals destroyed, state change should persist
    const s = get();
    saveLayout(s);
  },

  focusProject: (id) => {
    const state = get();
    if (state.activeProjectId === id && state.currentLevel === 3) return;

    // Capture outgoing layout (dashboard or previous focused project's worktree)
    const dockviewLayout = captureOutgoingLayout();

    if (state.currentLevel === 2) {
      // Save dashboard layout
      set({ dashboardLayout: dockviewLayout });
    } else if (state.currentLevel === 3 && state.activeProjectId) {
      // Save outgoing project's active worktree layout
      const outProject = getActiveProject(state);
      if (outProject) {
        set((s) => ({
          worktrees: updateWorktreeById(
            s.worktrees,
            outProject.activeWorktreeId,
            { dockviewLayout },
          ),
        }));
      }
    }

    // Ensure project is open on dashboard
    const nextOpenIds = state.openProjectIds.includes(id)
      ? state.openProjectIds
      : [...state.openProjectIds, id];

    set((s) => ({
      activeProjectId: id,
      openProjectIds: nextOpenIds,
      currentLevel: 3,
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  goToFolderBrowser: () => {
    const state = get();
    const dockviewLayout = captureOutgoingLayout();

    if (state.currentLevel === 2) {
      set({ dashboardLayout: dockviewLayout });
    } else if (state.currentLevel === 3) {
      const project = getActiveProject(state);
      if (project) {
        set((s) => ({
          worktrees: updateWorktreeById(s.worktrees, project.activeWorktreeId, {
            dockviewLayout,
          }),
        }));
      }
    }

    set((s) => ({
      currentLevel: 1 as const,
      layoutVersion: s.layoutVersion + 1,
    }));

    // Flush to localStorage
    const s = get();
    saveLayout(s);
  },

  goToDashboard: () => {
    const state = get();

    if (state.currentLevel === 3) {
      const dockviewLayout = captureOutgoingLayout();
      const project = getActiveProject(state);
      if (project) {
        set((s) => ({
          worktrees: updateWorktreeById(s.worktrees, project.activeWorktreeId, {
            dockviewLayout,
          }),
        }));
      }
    }

    set((s) => ({
      currentLevel: 2 as const,
      layoutVersion: s.layoutVersion + 1,
    }));

    // Flush to localStorage
    const s = get();
    saveLayout(s);
  },

  setMainPane: (paneId) => {
    const state = get();
    const project = getActiveProject(state);
    if (!project) return;
    set((s) => ({
      projects: updateProject(s.projects, project.id, { mainPaneId: paneId }),
    }));
  },

  /* ── Worktree tab actions (scoped to active project) ── */

  addWorktreeTab: (branch, cwd, profileId) => {
    const state = get();
    const project = getActiveProject(state);

    if (!project) {
      // No project — create one with a worktree tab
      const newProject = createProject(branch, cwd);
      const wt = createWorktreeTab(
        newProject.id,
        branch,
        branch,
        cwd,
        profileId ?? 'system-shell',
      );
      newProject.worktreeIds = [wt.id];
      newProject.activeWorktreeId = wt.id;
      newProject.mainPaneId = wt.panes[0]?.id ?? null;

      set((s) => ({
        projects: [...s.projects, newProject],
        worktrees: { ...s.worktrees, [wt.id]: wt },
        openProjectIds: [...s.openProjectIds, newProject.id],
        activeProjectId: newProject.id,
        currentLevel: 3,
        dashboardLayout: null,
        layoutVersion: s.layoutVersion + 1,
        showProjectBrowser: false,
      }));

      return wt.id;
    }

    const wt = createWorktreeTab(
      project.id,
      branch,
      branch,
      cwd,
      profileId ?? 'system-shell',
    );

    // Capture outgoing worktree layout
    const dockviewLayout = captureOutgoingLayout();

    set((s) => ({
      worktrees: {
        ...updateWorktreeById(s.worktrees, project.activeWorktreeId, {
          dockviewLayout,
        }),
        [wt.id]: wt,
      },
      projects: updateProject(s.projects, project.id, {
        worktreeIds: [...project.worktreeIds, wt.id],
        activeWorktreeId: wt.id,
      }),
      layoutVersion: s.layoutVersion + 1,
      showProjectBrowser: false,
    }));

    return wt.id;
  },

  removeWorktreeTab: (id) => {
    const state = get();
    const project = getActiveProject(state);
    if (!project) return;

    const idx = project.worktreeIds.indexOf(id);
    if (idx === -1) return;

    // Destroy all terminal entries for the removed worktree
    const wt = state.worktrees[id];
    if (wt) {
      for (const pane of wt.panes) {
        destroyTerminalEntry(pane.id);
      }
    }

    const remainingIds = project.worktreeIds.filter((wId) => wId !== id);
    let nextActiveWtId = project.activeWorktreeId;
    if (nextActiveWtId === id) {
      nextActiveWtId =
        remainingIds[Math.min(idx, remainingIds.length - 1)] ?? '';
    }

    // Remove from flat map
    const nextWorktrees = { ...state.worktrees };
    delete nextWorktrees[id];

    // Update mainPaneId if it was in the removed worktree
    let mainPaneId = project.mainPaneId;
    if (wt && mainPaneId && wt.panes.some((p) => p.id === mainPaneId)) {
      const nextWt = nextWorktrees[nextActiveWtId];
      mainPaneId = nextWt?.panes[0]?.id ?? null;
    }

    set((s) => ({
      worktrees: nextWorktrees,
      projects: updateProject(s.projects, project.id, {
        worktreeIds: remainingIds,
        activeWorktreeId: nextActiveWtId,
        mainPaneId,
      }),
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  setActiveWorktree: (id) => {
    const state = get();
    const project = getActiveProject(state);
    if (!project || project.activeWorktreeId === id) return;

    const dockviewLayout = captureOutgoingLayout();

    set((s) => ({
      worktrees: updateWorktreeById(s.worktrees, project.activeWorktreeId, {
        dockviewLayout,
      }),
      projects: updateProject(s.projects, project.id, {
        activeWorktreeId: id,
      }),
      layoutVersion: s.layoutVersion + 1,
    }));

    // Flush to localStorage
    const s = get();
    saveLayout(s);
  },

  renameWorktreeTab: (id, name) =>
    set((s) => ({
      worktrees: updateWorktreeById(s.worktrees, id, { name }),
    })),

  nextWorktree: () => {
    const state = get();
    const project = getActiveProject(state);
    if (!project || project.worktreeIds.length <= 1) return;

    const dockviewLayout = captureOutgoingLayout();

    const idx = project.worktreeIds.indexOf(project.activeWorktreeId);
    const nextIdx = (idx + 1) % project.worktreeIds.length;
    const nextWtId = project.worktreeIds[nextIdx]!;

    set((s) => ({
      worktrees: updateWorktreeById(s.worktrees, project.activeWorktreeId, {
        dockviewLayout,
      }),
      projects: updateProject(s.projects, project.id, {
        activeWorktreeId: nextWtId,
      }),
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  prevWorktree: () => {
    const state = get();
    const project = getActiveProject(state);
    if (!project || project.worktreeIds.length <= 1) return;

    const dockviewLayout = captureOutgoingLayout();

    const idx = project.worktreeIds.indexOf(project.activeWorktreeId);
    const prevIdx =
      (idx - 1 + project.worktreeIds.length) % project.worktreeIds.length;
    const prevWtId = project.worktreeIds[prevIdx]!;

    set((s) => ({
      worktrees: updateWorktreeById(s.worktrees, project.activeWorktreeId, {
        dockviewLayout,
      }),
      projects: updateProject(s.projects, project.id, {
        activeWorktreeId: prevWtId,
      }),
      layoutVersion: s.layoutVersion + 1,
    }));
  },

  /* ── Pane actions (scoped to active worktree) ── */

  setActivePaneId: (id) =>
    set((state) => updateActive(state, () => ({ activePaneId: id }))),

  addPane: (profileId, direction = 'right') =>
    set((state) => {
      const wt = getActive(state);
      if (!wt) {
        // No worktree — create a project + worktree
        const newProject = createProject('New Project', '');
        const newWt = createWorktreeTab(
          newProject.id,
          'main',
          'main',
          '',
          profileId,
        );
        newProject.worktreeIds = [newWt.id];
        newProject.activeWorktreeId = newWt.id;
        newProject.mainPaneId = newWt.panes[0]?.id ?? null;

        return {
          projects: [...state.projects, newProject],
          worktrees: { ...state.worktrees, [newWt.id]: newWt },
          openProjectIds: [...state.openProjectIds, newProject.id],
          activeProjectId: newProject.id,
          currentLevel: 3 as const,
          dashboardLayout: null,
          layoutVersion: state.layoutVersion + 1,
          showProjectBrowser: false,
        };
      }

      const pane = createPane(profileId);
      const refPaneId =
        wt.activePaneId ?? wt.panes[wt.panes.length - 1]?.id ?? null;
      const paneWithSplit: Pane = refPaneId
        ? { ...pane, splitFrom: { paneId: refPaneId, direction } }
        : pane;

      return {
        ...updateActive(state, () => ({
          panes: [...wt.panes, paneWithSplit],
          activePaneId: paneWithSplit.id,
          activePreset: null,
        })),
        showProjectBrowser:
          wt.panes.length === 0 ? false : state.showProjectBrowser,
      };
    }),

  addPaneWithCwd: (profileId, cwd, direction = 'right') =>
    set((state) => {
      const wt = getActive(state);
      if (!wt) return state;

      const pane = createPane(profileId);
      const refPaneId =
        wt.activePaneId ?? wt.panes[wt.panes.length - 1]?.id ?? null;
      const paneWithMeta: Pane = {
        ...pane,
        cwd,
        ...(refPaneId ? { splitFrom: { paneId: refPaneId, direction } } : {}),
      };

      return {
        ...updateActive(state, () => ({
          panes: [...wt.panes, paneWithMeta],
          activePaneId: paneWithMeta.id,
          activePreset: null,
        })),
        showProjectBrowser:
          wt.panes.length === 0 ? false : state.showProjectBrowser,
      };
    }),

  removePane: (id) =>
    set((state) => {
      const wt = getActive(state);
      if (!wt) return state;

      const remaining = wt.panes.filter((p) => p.id !== id);
      let nextActiveId = wt.activePaneId;
      if (nextActiveId === id) {
        const oldIndex = wt.panes.findIndex((p) => p.id === id);
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

      return {
        ...updateActive(state, () => ({
          panes: remaining,
          activePaneId: nextActiveId,
          activePreset: null,
          maximizedPaneId:
            wt.maximizedPaneId === id ? null : wt.maximizedPaneId,
        })),
        ...projectUpdate,
      };
    }),

  applyPreset: (presetName, profileId) =>
    set((state) => {
      const wt = getActive(state);
      if (!wt) return state;

      const preset = GRID_PRESETS.find((p) => p.name === presetName);
      if (!preset) return state;

      const existingPanes = [...wt.panes];
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

  clearAllPanes: () => {
    const wt = getActive(get());
    if (wt) {
      for (const pane of wt.panes) {
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
      const wt = getActive(state);
      if (!wt) return state;
      const profile =
        state.profiles.find((p) => p.id === profileId) ?? defaultProfile;
      return updateActive(state, () => ({
        panes: wt.panes.map((p) =>
          p.id === paneId ? { ...p, profileId, title: profile.name } : p,
        ),
        activePreset: null,
      }));
    }),

  updatePaneColor: (paneId, color) =>
    set((state) => {
      const wt = getActive(state);
      if (!wt) return state;
      return updateActive(state, () => ({
        panes: wt.panes.map((p) =>
          p.id === paneId ? { ...p, colorOverride: color } : p,
        ),
      }));
    }),

  updatePaneCwd: (paneId, cwd) =>
    set((state) => {
      const wt = getActive(state);
      if (!wt) return state;
      return updateActive(state, () => ({
        panes: wt.panes.map((p) => (p.id === paneId ? { ...p, cwd } : p)),
      }));
    }),

  toggleMaximize: (paneId) => {
    set((state) => {
      const wt = getActive(state);
      if (!wt) return state;
      const newMaximizedId = wt.maximizedPaneId === paneId ? null : paneId;
      return updateActive(state, () => ({ maximizedPaneId: newMaximizedId }));
    });
  },

  focusNextPane: () =>
    set((state) => {
      const wt = getActive(state);
      if (!wt || wt.panes.length === 0) return state;
      const idx = wt.panes.findIndex((p) => p.id === wt.activePaneId);
      if (idx === -1)
        return updateActive(state, () => ({ activePaneId: wt.panes[0]!.id }));
      const next = wt.panes[(idx + 1) % wt.panes.length]!;
      return updateActive(state, () => ({ activePaneId: next.id }));
    }),

  focusPrevPane: () =>
    set((state) => {
      const wt = getActive(state);
      if (!wt || wt.panes.length === 0) return state;
      const idx = wt.panes.findIndex((p) => p.id === wt.activePaneId);
      if (idx === -1)
        return updateActive(state, () => ({
          activePaneId: wt.panes[wt.panes.length - 1]!.id,
        }));
      const prev = wt.panes[(idx - 1 + wt.panes.length) % wt.panes.length]!;
      return updateActive(state, () => ({ activePaneId: prev.id }));
    }),

  focusPaneByIndex: (index) =>
    set((state) => {
      const wt = getActive(state);
      if (!wt) return state;
      const pane = wt.panes[index];
      if (!pane) return state;
      return updateActive(state, () => ({ activePaneId: pane.id }));
    }),

  focusDirection: (direction) => {
    const state = get();
    const wt = getActive(state);
    if (!wt?.activePaneId) return;

    const elements = document.querySelectorAll<HTMLElement>('[data-pane-id]');
    const rects = new Map<string, DOMRect>();
    elements.forEach((el) => {
      const id = el.dataset.paneId;
      if (id) rects.set(id, el.getBoundingClientRect());
    });

    const activeRect = rects.get(wt.activePaneId);
    if (!activeRect) return;

    const activeCx = activeRect.left + activeRect.width / 2;
    const activeCy = activeRect.top + activeRect.height / 2;

    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const [id, rect] of rects) {
      if (id === wt.activePaneId) continue;
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
  setRootFolderPath: (path) => set({ rootFolderPath: path }),
  setShowProjectBrowser: (show) => set({ showProjectBrowser: show }),
  setChangeDirPaneId: (paneId) => set({ changeDirPaneId: paneId }),
  setPendingCwd: (paneId, path) => set({ pendingCwd: { paneId, path } }),
  clearPendingCwd: () => set({ pendingCwd: null }),
  setShowCommandPalette: (show) => set({ showCommandPalette: show }),
  setShowWorktreeDialog: (show) => set({ showWorktreeDialog: show }),

  /* ── Worktree creation (git worktree + new tab) ── */

  createWorktreeFromGit: (worktreePath, worktreeBranch) => {
    const state = get();
    const project = getActiveProject(state);
    if (!project) return '';

    const currentWt = state.worktrees[project.activeWorktreeId];

    // Clone panes from current worktree with new IDs and updated cwd
    const clonedPanes: Pane[] = (currentWt?.panes ?? []).map((p) => ({
      ...p,
      id: generateId(),
      cwd: worktreePath,
      dockviewPosition: undefined,
    }));

    // Create a new worktree tab
    const wt = createWorktreeTab(
      project.id,
      worktreeBranch,
      worktreeBranch,
      worktreePath,
    );
    wt.panes = clonedPanes;
    wt.activePaneId = clonedPanes[0]?.id ?? null;

    // Capture outgoing layout from current worktree
    const dockviewLayout = captureOutgoingLayout();

    set((s) => ({
      worktrees: {
        ...updateWorktreeById(s.worktrees, project.activeWorktreeId, {
          dockviewLayout,
        }),
        [wt.id]: wt,
      },
      projects: updateProject(s.projects, project.id, {
        worktreeIds: [...project.worktreeIds, wt.id],
        activeWorktreeId: wt.id,
      }),
      showWorktreeDialog: false,
      layoutVersion: s.layoutVersion + 1,
    }));

    // Flush to localStorage
    const s = get();
    saveLayout(s);

    return wt.id;
  },

  /* ── Layout persistence ── */

  initProjectsPath: async () => {
    const state = get();
    if (state.projectsPath && state.rootFolderPath) return;
    try {
      const home = await getHomeDir();
      const sep = getPlatform() === 'windows' ? '\\' : '/';
      const defaultPath = home + sep + 'Desktop' + sep + 'Projects';
      set({
        projectsPath: state.projectsPath || defaultPath,
        rootFolderPath: state.rootFolderPath ?? defaultPath,
      });
    } catch {
      const fallback = getPlatform() === 'windows' ? 'C:\\Users' : '/home';
      set({
        projectsPath: state.projectsPath || fallback,
        rootFolderPath: state.rootFolderPath ?? fallback,
      });
    }
  },

  restoreLayout: () => {
    const saved = cachedStartupLayout ?? loadLayout();
    cachedStartupLayout = null;
    if (!saved) return false;

    const profiles = get().profiles;

    // Validate worktrees and their panes
    const validWorktrees: Record<string, WorktreeTab> = {};
    for (const [wtId, wt] of Object.entries(saved.worktrees)) {
      const validPanes = wt.panes.filter(
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
        validWorktrees[wtId] = {
          ...wt,
          panes: sanitizedPanes,
          activePaneId:
            wt.activePaneId && validIds.has(wt.activePaneId)
              ? wt.activePaneId
              : (sanitizedPanes[0]?.id ?? null),
        };
      }
    }

    if (Object.keys(validWorktrees).length === 0) {
      clearSavedLayout();
      return false;
    }

    // Validate projects — ensure their worktreeIds reference valid worktrees
    const validProjects = saved.projects
      .map((project) => {
        const validWtIds = project.worktreeIds.filter(
          (id) => validWorktrees[id],
        );
        if (validWtIds.length === 0) return null;
        const activeWtId = validWtIds.includes(project.activeWorktreeId)
          ? project.activeWorktreeId
          : validWtIds[0]!;
        return {
          ...project,
          worktreeIds: validWtIds,
          activeWorktreeId: activeWtId,
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

    const openProjectIds = saved.openProjectIds.filter((id) =>
      validProjects.some((p) => p.id === id),
    );

    set((state) => ({
      projects: validProjects,
      worktrees: validWorktrees,
      openProjectIds,
      activeProjectId,
      dashboardLayout: saved.dashboardLayout ?? null,
      rootFolderPath: saved.rootFolderPath ?? state.rootFolderPath,
      currentLevel: saved.currentLevel ?? (openProjectIds.length > 0 ? 2 : 1),
      layoutVersion: state.layoutVersion + 1,
    }));

    return true;
  },

  saveCustomLayout: (name) => {
    const state = get();
    const project = getActiveProject(state);
    if (!project) return;

    let dockviewLayout: unknown = null;
    try {
      if (dockviewApiRef.current)
        dockviewLayout = dockviewApiRef.current.toJSON();
    } catch {
      /* ignore */
    }

    const updatedWorktrees = updateWorktreeById(
      state.worktrees,
      project.activeWorktreeId,
      { dockviewLayout },
    );

    // Convert to compat WorkspaceTab[] for named layout storage
    const workspaceTabs = project.worktreeIds
      .map((id) => updatedWorktrees[id])
      .filter(Boolean)
      .map((wt) => ({
        id: wt!.id,
        name: wt!.name,
        color: undefined,
        cwd: wt!.cwd,
        panes: wt!.panes,
        activePaneId: wt!.activePaneId,
        maximizedPaneId: wt!.maximizedPaneId,
        activePreset: wt!.activePreset,
        dockviewLayout: wt!.dockviewLayout,
        createdAt: wt!.createdAt,
        updatedAt: wt!.updatedAt,
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

    const projectId = project?.id ?? generateId();

    const convertedWorktrees: Record<string, WorktreeTab> = {};
    const wtIds: string[] = [];

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

      const newWtId = generateId();
      const wt: WorktreeTab = {
        id: newWtId,
        projectId,
        name: wsTab.name,
        branch: wsTab.name === 'Default' ? 'main' : wsTab.name,
        cwd: wsTab.cwd ?? '',
        panes: rekeyedPanes,
        activePaneId: wsTab.activePaneId
          ? (paneIdMap.get(wsTab.activePaneId) ?? rekeyedPanes[0]?.id ?? null)
          : (rekeyedPanes[0]?.id ?? null),
        maximizedPaneId: wsTab.maximizedPaneId
          ? (paneIdMap.get(wsTab.maximizedPaneId) ?? null)
          : null,
        activePreset: wsTab.activePreset,
        dockviewLayout: null,
        createdAt: wsTab.createdAt,
        updatedAt: wsTab.updatedAt,
      };
      convertedWorktrees[wt.id] = wt;
      wtIds.push(wt.id);
    }

    if (wtIds.length === 0) return;

    if (project) {
      // Replace worktrees in existing project
      const nextWorktrees = { ...state.worktrees };
      for (const oldId of project.worktreeIds) {
        delete nextWorktrees[oldId];
      }
      Object.assign(nextWorktrees, convertedWorktrees);

      set((s) => ({
        worktrees: nextWorktrees,
        projects: updateProject(s.projects, project.id, {
          worktreeIds: wtIds,
          activeWorktreeId: wtIds[0]!,
        }),
        layoutVersion: s.layoutVersion + 1,
      }));
    } else {
      // Create a new project for the layout
      const newProject = createProject(layout.name, '');
      newProject.worktreeIds = wtIds;
      newProject.activeWorktreeId = wtIds[0]!;

      set((s) => ({
        projects: [...s.projects, newProject],
        worktrees: { ...s.worktrees, ...convertedWorktrees },
        openProjectIds: [...s.openProjectIds, newProject.id],
        activeProjectId: newProject.id,
        currentLevel: 3,
        dashboardLayout: null,
        layoutVersion: s.layoutVersion + 1,
      }));
    }
  },
}));
