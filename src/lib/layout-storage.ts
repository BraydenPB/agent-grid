/**
 * Layout persistence — save/restore projects + workspaces to localStorage.
 */

import type { Pane, Project, ProjectWorkspace, WorkspaceTab } from '@/types';
import { generateId } from '@/lib/utils';

const STORAGE_KEY = 'agent-grid:layout';
const NAMED_LAYOUTS_KEY = 'agent-grid:named-layouts';

/* ── V3 format (projects + flat workspace map) ── */

interface SavedLayoutV3 {
  version: 3;
  projects: Project[];
  workspaces: Record<string, ProjectWorkspace>;
  activeProjectId: string | null;
  savedAt: string;
}

/* ── V2 format (workspace tabs) ── */

interface SavedLayoutV2 {
  version: 2;
  workspaces: WorkspaceTab[];
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

function migrateV1toV2(v1: SavedLayoutV1): SavedLayoutV2 {
  // Strip any 'mode' field from panes (v1 had PaneMode)
  const panes: Pane[] = v1.panes.map((p: any) => {
    const { mode: _, ...rest } = p as Pane & { mode?: string };
    return rest;
  });

  const ws: WorkspaceTab = {
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

  const workspaces: Record<string, ProjectWorkspace> = {};
  const wsIds: string[] = [];

  for (const wsTab of v2.workspaces) {
    const pw: ProjectWorkspace = {
      id: wsTab.id,
      projectId,
      name: wsTab.name,
      worktreePath: wsTab.cwd,
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

  // Find a main pane — use the active pane of the active workspace
  const activeWs = workspaces[activeWsId];
  const mainPaneId = activeWs?.activePaneId ?? null;

  const project: Project = {
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

export function saveLayout(
  projects: Project[],
  workspaces: Record<string, ProjectWorkspace>,
  activeProjectId: string | null,
): void {
  const data: SavedLayoutV3 = {
    version: 3,
    projects,
    workspaces,
    activeProjectId,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }
}

/** Validate internal shape of V3 data to catch corruption */
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

  // Validate each project has required string fields
  for (const p of d.projects as unknown[]) {
    if (typeof p !== 'object' || p === null) return false;
    const proj = p as Record<string, unknown>;
    if (typeof proj.id !== 'string' || typeof proj.name !== 'string')
      return false;
    if (!Array.isArray(proj.workspaceIds)) return false;
  }

  // Validate each workspace has panes array
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

export function loadLayout(): SavedLayoutV3 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    // V3 format — validate internal shape
    if (
      data.version === 3 &&
      Array.isArray(data.projects) &&
      typeof data.workspaces === 'object' &&
      !Array.isArray(data.workspaces)
    ) {
      return isValidV3(data) ? data : null;
    }

    // V2 format — migrate
    if (data.version === 2 && Array.isArray(data.workspaces)) {
      return migrateV2toV3(data as SavedLayoutV2);
    }

    // V1 format — migrate V1 → V2 → V3
    if (Array.isArray(data.panes)) {
      return migrateV2toV3(migrateV1toV2(data as SavedLayoutV1));
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

export interface NamedLayout {
  id: string;
  name: string;
  workspaces: WorkspaceTab[];
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

  const ws: WorkspaceTab = {
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
      // V2 format has 'workspaces' array
      if (Array.isArray(item.workspaces)) return item as NamedLayout;
      // V1 format has 'panes' array
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
