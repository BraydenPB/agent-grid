import { describe, it, expect, beforeEach } from 'vitest';
import type { Pane } from '@/types';
import {
  saveLayout,
  loadLayout,
  clearSavedLayout,
  loadNamedLayouts,
  saveNamedLayout,
  deleteNamedLayout,
  loadProfileColors,
  saveProfileColors,
} from './layout-storage';

const STORAGE_KEY = 'agent-grid:layout';
const NAMED_KEY = 'agent-grid:named-layouts';
const COLORS_KEY = 'agent-grid:profile-colors';

function makePanes(count: number): Pane[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `pane-${i}`,
    profileId: 'system-shell',
    title: `Pane ${i}`,
  }));
}

beforeEach(() => {
  localStorage.clear();
});

// ── saveLayout + loadLayout round-trip ──

describe('saveLayout / loadLayout', () => {
  it('round-trips valid layout data', () => {
    const panes = makePanes(2);
    saveLayout(panes, 'pane-0', '2×2 Grid', { some: 'data' });

    const loaded = loadLayout();
    expect(loaded).not.toBeNull();
    expect(loaded!.panes).toEqual(panes);
    expect(loaded!.activePaneId).toBe('pane-0');
    expect(loaded!.activePreset).toBe('2×2 Grid');
    expect(loaded!.dockviewLayout).toEqual({ some: 'data' });
    expect(loaded!.savedAt).toBeTruthy();
  });

  it('returns null when nothing saved', () => {
    expect(loadLayout()).toBeNull();
  });

  it('saves a timestamp', () => {
    saveLayout(makePanes(1), null, null, null);
    const loaded = loadLayout();
    expect(loaded!.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ── loadLayout — corrupted / invalid data ──

describe('loadLayout — invalid data', () => {
  it('returns null for non-JSON string', () => {
    localStorage.setItem(STORAGE_KEY, 'not json at all');
    expect(loadLayout()).toBeNull();
  });

  it('returns null for JSON number', () => {
    localStorage.setItem(STORAGE_KEY, '42');
    expect(loadLayout()).toBeNull();
  });

  it('returns null for JSON string', () => {
    localStorage.setItem(STORAGE_KEY, '"hello"');
    expect(loadLayout()).toBeNull();
  });

  it('returns null when panes is not an array', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ panes: 'not-array', activePaneId: null }),
    );
    expect(loadLayout()).toBeNull();
  });

  it('returns null when panes is null', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ panes: null, activePaneId: null }),
    );
    expect(loadLayout()).toBeNull();
  });

  it('returns valid data even with missing optional fields', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ panes: [] }));
    const loaded = loadLayout();
    expect(loaded).not.toBeNull();
    expect(loaded!.panes).toEqual([]);
  });

  it('returns data even with extra unexpected fields', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ panes: [], extra: true, nested: { a: 1 } }),
    );
    const loaded = loadLayout();
    expect(loaded).not.toBeNull();
  });

  it('handles empty panes array', () => {
    saveLayout([], null, null, null);
    const loaded = loadLayout();
    expect(loaded!.panes).toEqual([]);
  });
});

// ── clearSavedLayout ──

describe('clearSavedLayout', () => {
  it('removes saved layout', () => {
    saveLayout(makePanes(1), null, null, null);
    expect(loadLayout()).not.toBeNull();
    clearSavedLayout();
    expect(loadLayout()).toBeNull();
  });

  it('does not throw when nothing to clear', () => {
    expect(() => clearSavedLayout()).not.toThrow();
  });
});

// ── Named layouts ──

describe('named layouts', () => {
  it('returns empty array when nothing saved', () => {
    expect(loadNamedLayouts()).toEqual([]);
  });

  it('saves and loads a named layout', () => {
    saveNamedLayout({
      id: 'layout-1',
      name: 'My Layout',
      panes: makePanes(2),
      dockviewLayout: null,
    });

    const loaded = loadNamedLayouts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.name).toBe('My Layout');
    expect(loaded[0]!.savedAt).toBeTruthy();
  });

  it('overwrites layout with same ID', () => {
    saveNamedLayout({
      id: 'layout-1',
      name: 'V1',
      panes: makePanes(1),
      dockviewLayout: null,
    });
    saveNamedLayout({
      id: 'layout-1',
      name: 'V2',
      panes: makePanes(2),
      dockviewLayout: null,
    });

    const loaded = loadNamedLayouts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.name).toBe('V2');
  });

  it('stores multiple layouts with different IDs', () => {
    saveNamedLayout({
      id: 'a',
      name: 'A',
      panes: [],
      dockviewLayout: null,
    });
    saveNamedLayout({
      id: 'b',
      name: 'B',
      panes: [],
      dockviewLayout: null,
    });

    expect(loadNamedLayouts()).toHaveLength(2);
  });

  it('deletes a named layout by ID', () => {
    saveNamedLayout({
      id: 'x',
      name: 'X',
      panes: [],
      dockviewLayout: null,
    });
    deleteNamedLayout('x');
    expect(loadNamedLayouts()).toHaveLength(0);
  });

  it('handles corrupted named layouts JSON', () => {
    localStorage.setItem(NAMED_KEY, 'broken{json');
    expect(loadNamedLayouts()).toEqual([]);
  });

  it('handles non-array named layouts JSON', () => {
    localStorage.setItem(NAMED_KEY, JSON.stringify({ not: 'array' }));
    expect(loadNamedLayouts()).toEqual([]);
  });
});

// ── Profile colors ──

describe('profile colors', () => {
  it('returns empty object when nothing saved', () => {
    expect(loadProfileColors()).toEqual({});
  });

  it('round-trips color map', () => {
    const colors = { shell: '#ff0000', claude: '#00ff00' };
    saveProfileColors(colors);
    expect(loadProfileColors()).toEqual(colors);
  });

  it('handles corrupted JSON', () => {
    localStorage.setItem(COLORS_KEY, 'not-json');
    expect(loadProfileColors()).toEqual({});
  });
});
