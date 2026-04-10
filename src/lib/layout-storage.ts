/**
 * Layout persistence — save/restore workspace tabs to localStorage.
 */

import type { Pane, WorkspaceTab } from '@/types';
import { generateId } from '@/lib/utils';

const STORAGE_KEY = 'agent-grid:layout';
const NAMED_LAYOUTS_KEY = 'agent-grid:named-layouts';

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

export function saveLayout(
  workspaces: WorkspaceTab[],
  activeWorkspaceId: string | null,
): void {
  const data: SavedLayoutV2 = {
    version: 2,
    workspaces,
    activeWorkspaceId,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }
}

export function loadLayout(): SavedLayoutV2 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    // V2 format
    if (data.version === 2 && Array.isArray(data.workspaces)) {
      return data as SavedLayoutV2;
    }

    // V1 format — migrate
    if (Array.isArray(data.panes)) {
      return migrateV1toV2(data as SavedLayoutV1);
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
