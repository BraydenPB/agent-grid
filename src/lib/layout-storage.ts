/**
 * Layout persistence — save/restore projects + worktrees to localStorage.
 */

import type { Pane, Project, WorktreeTab } from '@/types';
import { generateId } from '@/lib/utils';

const STORAGE_KEY = 'agent-grid:layout';
const NAMED_LAYOUTS_KEY = 'agent-grid:named-layouts';

/* ── V4 format (projects + worktree tabs + dashboard) ── */

interface SavedLayoutV4 {
  version: 4;
  projects: Project[];
  worktrees: Record<string, WorktreeTab>;
  openProjectIds: string[];
  activeProjectId: string | null;
  currentLevel: 1 | 2 | 3;
  dashboardLayout: unknown;
  /** Name of the grid preset currently applied to the dashboard (level 2). */
  activeDashboardPreset?: string | null;
  /** Global default terminal profile used when opening projects from L1. */
  defaultProfileId?: string;
  rootFolderPath: string | null;
  savedAt: string;
}

/* ── V3 format (projects + flat workspace map) ── */

// Legacy V3 types for migration only
interface LegacyProjectV3 {
  id: string;
  name: string;
  path: string;
  mainPaneId: string | null;
  workspaceIds: string[];
  activeWorkspaceId: string;
  parentProjectId?: string;
  worktreeBranch?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

interface LegacyWorkspaceV3 {
  id: string;
  projectId: string;
  name: string;
  cwd?: string;
  panes: Pane[];
  activePaneId: string | null;
  maximizedPaneId: string | null;
  activePreset: string | null;
  dockviewLayout: unknown;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

interface SavedLayoutV3 {
  version: 3;
  projects: LegacyProjectV3[];
  workspaces: Record<string, LegacyWorkspaceV3>;
  activeProjectId: string | null;
  savedAt: string;
}

/* ── V2 format (workspace tabs) ── */

interface LegacyWorkspaceTab {
  id: string;
  name: string;
  color?: string;
  cwd?: string;
  panes: Pane[];
  activePaneId: string | null;
  maximizedPaneId: string | null;
  activePreset: string | null;
  dockviewLayout: unknown;
  createdAt: string;
  updatedAt: string;
}

interface SavedLayoutV2 {
  version: 2;
  workspaces: LegacyWorkspaceTab[];
  activeWorkspaceId: string | null;
  savedAt: string;
}

/* ── V1 format (legacy flat panes) ── */

interface SavedLayoutV1 {
  panes: Pane[];
  activePaneId: string | null;
  activePreset: string | null;
  dockviewLayout: unknown;
  paneWorkspaces?: Record<string, unknown>;
  savedAt: string;
}

/* ── Migrations ── */

function migrateV1toV2(v1: SavedLayoutV1): SavedLayoutV2 {
  const panes: Pane[] = v1.panes.map((p: any) => {
    const { mode: _, ...rest } = p as Pane & { mode?: string };
    return rest;
  });

  const ws: LegacyWorkspaceTab = {
    id: generateId(),
    name: 'Default',
    panes,
    activePaneId: v1.activePaneId ?? panes[0]?.id ?? null,
    maximizedPaneId: null,
    activePreset: v1.activePreset,
    dockviewLayout: v1.dockviewLayout,
    createdAt: v1.savedAt ?? new Date().toISOString(),
    updatedAt: v1.savedAt ?? new Date().toISOString(),
  };

  return {
    version: 2,
    workspaces: [ws],
    activeWorkspaceId: ws.id,
    savedAt: v1.savedAt ?? new Date().toISOString(),
  };
}

function migrateV2toV3(v2: SavedLayoutV2): SavedLayoutV3 {
  const projectId = generateId();
  const now = new Date().toISOString();

  const workspaces: Record<string, LegacyWorkspaceV3> = {};
  const wsIds: string[] = [];

  for (const wsTab of v2.workspaces) {
    const pw: LegacyWorkspaceV3 = {
      id: wsTab.id,
      projectId,
      name: wsTab.name,
      cwd: wsTab.cwd,
      panes: wsTab.panes,
      activePaneId: wsTab.activePaneId,
      maximizedPaneId: wsTab.maximizedPaneId,
      activePreset: wsTab.activePreset,
      dockviewLayout: wsTab.dockviewLayout,
      color: wsTab.color,
      createdAt: wsTab.createdAt,
      updatedAt: wsTab.updatedAt,
    };
    workspaces[pw.id] = pw;
    wsIds.push(pw.id);
  }

  const activeWsId =
    v2.activeWorkspaceId && wsIds.includes(v2.activeWorkspaceId)
      ? v2.activeWorkspaceId
      : (wsIds[0] ?? '');

  const activeWs = workspaces[activeWsId];
  const mainPaneId = activeWs?.activePaneId ?? null;

  const project: LegacyProjectV3 = {
    id: projectId,
    name: 'Default',
    path: '',
    mainPaneId,
    workspaceIds: wsIds,
    activeWorkspaceId: activeWsId,
    createdAt: now,
    updatedAt: now,
  };

  return {
    version: 3,
    projects: [project],
    workspaces,
    activeProjectId: projectId,
    savedAt: v2.savedAt ?? now,
  };
}

function migrateV3toV4(v3: SavedLayoutV3): SavedLayoutV4 {
  const now = new Date().toISOString();
  const worktrees: Record<string, WorktreeTab> = {};
  const projects: Project[] = [];
  const openProjectIds: string[] = [];

  // Separate parent projects from worktree child projects
  const parentProjects = v3.projects.filter((p) => !p.parentProjectId);
  const childProjects = v3.projects.filter((p) => p.parentProjectId);

  for (const oldProject of parentProjects) {
    // Convert this project's workspaces to worktree tabs
    const wtIds: string[] = [];

    for (const wsId of oldProject.workspaceIds) {
      const ws = v3.workspaces[wsId];
      if (!ws || ws.panes.length === 0) continue;

      const wt: WorktreeTab = {
        id: ws.id,
        projectId: oldProject.id,
        name: ws.name === 'Default' ? 'main' : ws.name,
        branch: 'main',
        cwd: ws.cwd ?? oldProject.path ?? '',
        panes: ws.panes,
        activePaneId: ws.activePaneId,
        maximizedPaneId: ws.maximizedPaneId,
        activePreset: ws.activePreset,
        dockviewLayout: ws.dockviewLayout,
        createdAt: ws.createdAt,
        updatedAt: ws.updatedAt,
      };
      worktrees[wt.id] = wt;
      wtIds.push(wt.id);
    }

    // Convert child worktree projects into worktree tabs under this parent
    const children = childProjects.filter(
      (c) => c.parentProjectId === oldProject.id,
    );
    for (const child of children) {
      for (const wsId of child.workspaceIds) {
        const ws = v3.workspaces[wsId];
        if (!ws || ws.panes.length === 0) continue;

        const wt: WorktreeTab = {
          id: ws.id,
          projectId: oldProject.id,
          name: child.worktreeBranch ?? child.name,
          branch: child.worktreeBranch ?? child.name,
          cwd: child.path ?? ws.cwd ?? '',
          panes: ws.panes,
          activePaneId: ws.activePaneId,
          maximizedPaneId: ws.maximizedPaneId,
          activePreset: ws.activePreset,
          dockviewLayout: ws.dockviewLayout,
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt,
        };
        worktrees[wt.id] = wt;
        wtIds.push(wt.id);
      }
    }

    if (wtIds.length === 0) continue;

    const activeWtId = wtIds.includes(oldProject.activeWorkspaceId)
      ? oldProject.activeWorkspaceId
      : wtIds[0]!;

    const newProject: Project = {
      id: oldProject.id,
      name: oldProject.name,
      path: oldProject.path,
      mainPaneId: oldProject.mainPaneId,
      defaultProfileId: 'system-shell',
      worktreeIds: wtIds,
      activeWorktreeId: activeWtId,
      color: oldProject.color,
      createdAt: oldProject.createdAt,
      updatedAt: now,
    };
    projects.push(newProject);

    // If project had panes, consider it open
    const hasPanes = wtIds.some(
      (id) => worktrees[id] && worktrees[id].panes.length > 0,
    );
    if (hasPanes) {
      openProjectIds.push(newProject.id);
    }
  }

  // Handle orphaned worktree projects (parent deleted) — make standalone
  const migratedChildIds = new Set(
    childProjects
      .filter((c) => parentProjects.some((p) => p.id === c.parentProjectId))
      .map((c) => c.id),
  );
  const orphanedChildren = childProjects.filter(
    (c) => !migratedChildIds.has(c.id),
  );
  for (const orphan of orphanedChildren) {
    const wtIds: string[] = [];
    for (const wsId of orphan.workspaceIds) {
      const ws = v3.workspaces[wsId];
      if (!ws || ws.panes.length === 0) continue;

      const wt: WorktreeTab = {
        id: ws.id,
        projectId: orphan.id,
        name: 'main',
        branch: orphan.worktreeBranch ?? 'main',
        cwd: orphan.path ?? ws.cwd ?? '',
        panes: ws.panes,
        activePaneId: ws.activePaneId,
        maximizedPaneId: ws.maximizedPaneId,
        activePreset: ws.activePreset,
        dockviewLayout: ws.dockviewLayout,
        createdAt: ws.createdAt,
        updatedAt: ws.updatedAt,
      };
      worktrees[wt.id] = wt;
      wtIds.push(wt.id);
    }

    if (wtIds.length === 0) continue;

    const newProject: Project = {
      id: orphan.id,
      name: orphan.name,
      path: orphan.path,
      mainPaneId: orphan.mainPaneId,
      defaultProfileId: 'system-shell',
      worktreeIds: wtIds,
      activeWorktreeId: wtIds[0]!,
      createdAt: orphan.createdAt,
      updatedAt: now,
    };
    projects.push(newProject);
    openProjectIds.push(newProject.id);
  }

  const activeProjectId =
    v3.activeProjectId && projects.some((p) => p.id === v3.activeProjectId)
      ? v3.activeProjectId
      : (projects[0]?.id ?? null);

  return {
    version: 4,
    projects,
    worktrees,
    openProjectIds,
    activeProjectId,
    currentLevel: openProjectIds.length > 0 ? 2 : 1,
    dashboardLayout: null,
    rootFolderPath: null,
    savedAt: now,
  };
}

/* ── Save / Load ── */

export function saveLayout(state: {
  projects: Project[];
  worktrees: Record<string, WorktreeTab>;
  openProjectIds: string[];
  activeProjectId: string | null;
  currentLevel: 1 | 2 | 3;
  dashboardLayout: unknown;
  activeDashboardPreset?: string | null;
  defaultProfileId?: string;
  rootFolderPath: string | null;
}): void {
  const data: SavedLayoutV4 = {
    version: 4,
    projects: state.projects,
    worktrees: state.worktrees,
    openProjectIds: state.openProjectIds,
    activeProjectId: state.activeProjectId,
    currentLevel: state.currentLevel,
    dashboardLayout: state.dashboardLayout,
    activeDashboardPreset: state.activeDashboardPreset ?? null,
    defaultProfileId: state.defaultProfileId,
    rootFolderPath: state.rootFolderPath,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }
}

/** Validate internal shape of V4 data to catch corruption */
function isValidV4(data: unknown): data is SavedLayoutV4 {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (d.version !== 4) return false;
  if (!Array.isArray(d.projects)) return false;
  if (
    typeof d.worktrees !== 'object' ||
    d.worktrees === null ||
    Array.isArray(d.worktrees)
  )
    return false;
  if (!Array.isArray(d.openProjectIds)) return false;

  // Validate each project has required string fields
  for (const p of d.projects as unknown[]) {
    if (typeof p !== 'object' || p === null) return false;
    const proj = p as Record<string, unknown>;
    if (typeof proj.id !== 'string' || typeof proj.name !== 'string')
      return false;
    if (!Array.isArray(proj.worktreeIds)) return false;
  }

  // Validate each worktree has panes array
  for (const wt of Object.values(d.worktrees as Record<string, unknown>)) {
    if (typeof wt !== 'object' || wt === null) return false;
    const w = wt as Record<string, unknown>;
    if (typeof w.id !== 'string') return false;
    if (!Array.isArray(w.panes)) return false;
    for (const pane of w.panes as unknown[]) {
      if (typeof pane !== 'object' || pane === null) return false;
      const pa = pane as Record<string, unknown>;
      if (typeof pa.id !== 'string' || typeof pa.profileId !== 'string')
        return false;
    }
  }

  return true;
}

/** Validate internal shape of V3 data */
function isValidV3(data: unknown): data is SavedLayoutV3 {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (d.version !== 3) return false;
  if (!Array.isArray(d.projects)) return false;
  if (
    typeof d.workspaces !== 'object' ||
    d.workspaces === null ||
    Array.isArray(d.workspaces)
  )
    return false;

  for (const p of d.projects as unknown[]) {
    if (typeof p !== 'object' || p === null) return false;
    const proj = p as Record<string, unknown>;
    if (typeof proj.id !== 'string' || typeof proj.name !== 'string')
      return false;
    if (!Array.isArray(proj.workspaceIds)) return false;
  }

  for (const ws of Object.values(d.workspaces as Record<string, unknown>)) {
    if (typeof ws !== 'object' || ws === null) return false;
    const w = ws as Record<string, unknown>;
    if (typeof w.id !== 'string') return false;
    if (!Array.isArray(w.panes)) return false;
    for (const pane of w.panes as unknown[]) {
      if (typeof pane !== 'object' || pane === null) return false;
      const pa = pane as Record<string, unknown>;
      if (typeof pa.id !== 'string' || typeof pa.profileId !== 'string')
        return false;
    }
  }

  return true;
}

export function loadLayout(): SavedLayoutV4 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    // V4 format
    if (data.version === 4) {
      if (!isValidV4(data)) return null;
      return data;
    }

    // V3 format — migrate
    if (
      data.version === 3 &&
      Array.isArray(data.projects) &&
      typeof data.workspaces === 'object' &&
      !Array.isArray(data.workspaces)
    ) {
      if (!isValidV3(data)) return null;
      // Compat: rename worktreePath → cwd on workspaces saved before the rename
      for (const ws of Object.values(data.workspaces as Record<string, any>)) {
        if (ws.worktreePath !== undefined && ws.cwd === undefined) {
          ws.cwd = ws.worktreePath;
        }
        delete ws.worktreePath;
        delete ws.worktreeBranch;
      }
      return migrateV3toV4(data);
    }

    // V2 format — migrate V2 → V3 → V4
    if (data.version === 2 && Array.isArray(data.workspaces)) {
      return migrateV3toV4(migrateV2toV3(data as SavedLayoutV2));
    }

    // V1 format — migrate V1 → V2 → V3 → V4
    if (Array.isArray(data.panes)) {
      return migrateV3toV4(migrateV2toV3(migrateV1toV2(data as SavedLayoutV1)));
    }

    return null;
  } catch {
    return null;
  }
}

export function clearSavedLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/* ── Named layouts ── */

// Named layouts still use the old WorkspaceTab format for backwards compat
interface NamedLayoutWorkspaceTab {
  id: string;
  name: string;
  color?: string;
  cwd?: string;
  panes: Pane[];
  activePaneId: string | null;
  maximizedPaneId: string | null;
  activePreset: string | null;
  dockviewLayout: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface NamedLayout {
  id: string;
  name: string;
  workspaces: NamedLayoutWorkspaceTab[];
  savedAt: string;
}

// Legacy named layout format
interface NamedLayoutV1 {
  id: string;
  name: string;
  panes: Pane[];
  dockviewLayout: unknown;
  paneWorkspaces?: Record<string, unknown>;
  savedAt: string;
}

function migrateNamedLayoutV1(v1: NamedLayoutV1): NamedLayout {
  const panes: Pane[] = v1.panes.map((p: any) => {
    const { mode: _, ...rest } = p as Pane & { mode?: string };
    return rest;
  });

  const ws: NamedLayoutWorkspaceTab = {
    id: generateId(),
    name: 'Default',
    panes,
    activePaneId: panes[0]?.id ?? null,
    maximizedPaneId: null,
    activePreset: null,
    dockviewLayout: v1.dockviewLayout,
    createdAt: v1.savedAt,
    updatedAt: v1.savedAt,
  };

  return {
    id: v1.id,
    name: v1.name,
    workspaces: [ws],
    savedAt: v1.savedAt,
  };
}

export function loadNamedLayouts(): NamedLayout[] {
  try {
    const raw = localStorage.getItem(NAMED_LAYOUTS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => {
      if (Array.isArray(item.workspaces)) return item as NamedLayout;
      if (Array.isArray(item.panes))
        return migrateNamedLayoutV1(item as NamedLayoutV1);
      return item as NamedLayout;
    });
  } catch {
    return [];
  }
}

export function saveNamedLayout(layout: Omit<NamedLayout, 'savedAt'>): void {
  try {
    const existing = loadNamedLayouts().filter((l) => l.id !== layout.id);
    const next: NamedLayout[] = [
      ...existing,
      { ...layout, savedAt: new Date().toISOString() },
    ];
    localStorage.setItem(NAMED_LAYOUTS_KEY, JSON.stringify(next));
  } catch {
    // localStorage full or unavailable
  }
}

export function deleteNamedLayout(id: string): void {
  try {
    const next = loadNamedLayouts().filter((l) => l.id !== id);
    localStorage.setItem(NAMED_LAYOUTS_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
}

/* ── Profile color overrides ── */

const PROFILE_COLORS_KEY = 'agent-grid:profile-colors';

export function loadProfileColors(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PROFILE_COLORS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveProfileColors(colors: Record<string, string>): void {
  try {
    localStorage.setItem(PROFILE_COLORS_KEY, JSON.stringify(colors));
  } catch {
    // localStorage full or unavailable
  }
}
