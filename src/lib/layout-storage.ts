/**
 * Layout persistence — save/restore workspace pane state + Dockview layout to localStorage.
 */

import type { Pane } from '@/types';

const STORAGE_KEY = 'agent-grid:layout';
const NAMED_LAYOUTS_KEY = 'agent-grid:named-layouts';

interface SavedLayout {
  /** Pane metadata (profileId, cwd, positioning) */
  panes: Pane[];
  /** Active pane ID */
  activePaneId: string | null;
  /** Active preset name */
  activePreset: string | null;
  /** Dockview toJSON() result for restoring panel sizes/groups */
  dockviewLayout: unknown;
  /** Timestamp for staleness detection */
  savedAt: string;
}

export function saveLayout(
  panes: Pane[],
  activePaneId: string | null,
  activePreset: string | null,
  dockviewLayout: unknown,
): void {
  const data: SavedLayout = {
    panes,
    activePaneId,
    activePreset,
    dockviewLayout,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }
}

export function loadLayout(): SavedLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedLayout;
    // Basic validation
    if (!Array.isArray(data.panes)) return null;
    return data;
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
  panes: Pane[];
  dockviewLayout: unknown;
  savedAt: string;
}

export function loadNamedLayouts(): NamedLayout[] {
  try {
    const raw = localStorage.getItem(NAMED_LAYOUTS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data as NamedLayout[];
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
