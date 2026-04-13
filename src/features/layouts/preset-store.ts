/**
 * Zustand store for user-defined layout presets.
 *
 * Built-in presets come from `builtin-presets.ts` and are immutable.
 * User presets live here and persist to localStorage under a dedicated key.
 *
 * The store exposes a unified `allPresets` accessor that merges both lists
 * so UI code never has to think about the distinction.
 */

import { create } from 'zustand';
import { generateId } from '@/lib/utils';
import { BUILTIN_PRESETS } from './builtin-presets';
import type { LayoutNode, LayoutPreset, LayoutScope } from './types';

const STORAGE_KEY = 'agent-grid:layout-presets';

interface StoredPreset {
  id: string;
  name: string;
  description?: string;
  tree: LayoutNode;
  scope: LayoutScope;
  createdAt: string;
  updatedAt: string;
}

function loadUserPresets(): StoredPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((p: unknown): p is StoredPreset => {
      if (typeof p !== 'object' || p === null) return false;
      const candidate = p as Record<string, unknown>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.name === 'string' &&
        typeof candidate.tree === 'object' &&
        candidate.tree !== null
      );
    });
  } catch {
    return [];
  }
}

function persist(presets: StoredPreset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // localStorage unavailable or full
  }
}

function stored(preset: StoredPreset): LayoutPreset {
  return { ...preset, builtin: false };
}

interface PresetStoreState {
  userPresets: LayoutPreset[];
  /** Read-only: all presets in one list (builtins first). */
  allPresets: () => LayoutPreset[];
  /** Filter by scope — dashboard, worktree, or both. */
  presetsForScope: (scope: 'dashboard' | 'worktree') => LayoutPreset[];
  /** Look up a preset by id (builtin:* or user:*). */
  findPreset: (id: string) => LayoutPreset | undefined;
  /** Save the given tree as a new user preset. Returns the new preset. */
  createUserPreset: (
    name: string,
    tree: LayoutNode,
    scope?: LayoutScope,
    description?: string,
  ) => LayoutPreset;
  /** Rename a user preset. Silently no-ops for builtin ids. */
  renameUserPreset: (id: string, name: string) => void;
  /** Delete a user preset. Silently no-ops for builtin ids. */
  deleteUserPreset: (id: string) => void;
  /** Replace a user preset's tree (e.g. "overwrite with current layout"). */
  updateUserPresetTree: (id: string, tree: LayoutNode) => void;
}

export const useLayoutPresets = create<PresetStoreState>((set, get) => ({
  userPresets: loadUserPresets().map(stored),

  allPresets: () => [...BUILTIN_PRESETS, ...get().userPresets],

  presetsForScope: (scope) =>
    get()
      .allPresets()
      .filter((p) => p.scope === scope || p.scope === 'both'),

  findPreset: (id) =>
    get()
      .allPresets()
      .find((p) => p.id === id),

  createUserPreset: (name, tree, scope = 'both', description) => {
    const now = new Date().toISOString();
    const preset: LayoutPreset = {
      id: `user:${generateId()}`,
      name,
      description,
      tree,
      builtin: false,
      scope,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => {
      const next = [...s.userPresets, preset];
      persist(next.map(({ builtin: _, ...rest }) => rest as StoredPreset));
      return { userPresets: next };
    });
    return preset;
  },

  renameUserPreset: (id, name) => {
    if (id.startsWith('builtin:')) return;
    const now = new Date().toISOString();
    set((s) => {
      const next = s.userPresets.map((p) =>
        p.id === id ? { ...p, name, updatedAt: now } : p,
      );
      persist(next.map(({ builtin: _, ...rest }) => rest as StoredPreset));
      return { userPresets: next };
    });
  },

  deleteUserPreset: (id) => {
    if (id.startsWith('builtin:')) return;
    set((s) => {
      const next = s.userPresets.filter((p) => p.id !== id);
      persist(next.map(({ builtin: _, ...rest }) => rest as StoredPreset));
      return { userPresets: next };
    });
  },

  updateUserPresetTree: (id, tree) => {
    if (id.startsWith('builtin:')) return;
    const now = new Date().toISOString();
    set((s) => {
      const next = s.userPresets.map((p) =>
        p.id === id ? { ...p, tree, updatedAt: now } : p,
      );
      persist(next.map(({ builtin: _, ...rest }) => rest as StoredPreset));
      return { userPresets: next };
    });
  },
}));
