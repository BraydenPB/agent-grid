import { describe, it, expect, beforeEach } from 'vitest';
import type { Pane, Project, ProjectWorkspace } from '@/types';
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

function makeProjectAndWorkspace(panes: Pane[]) {
  const wsId = 'ws-1';
  const projectId = 'project-1';
  const workspace: ProjectWorkspace = {
    id: wsId,
    projectId,
    name: 'Default',
    panes,
    activePaneId: panes[0]?.id ?? null,
    maximizedPaneId: null,
    activePreset: null,
    dockviewLayout: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const project: Project = {
    id: projectId,
    name: 'Default',
    path: '',
    mainPaneId: panes[0]?.id ?? null,
    workspaceIds: [wsId],
    activeWorkspaceId: wsId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return {
    projects: [project],
    workspaces: { [wsId]: workspace },
    activeProjectId: projectId,
  };
}

beforeEach(() => {
  localStorage.clear();
});

// ── saveLayout + loadLayout round-trip ──

describe('saveLayout / loadLayout', () => {
  it('round-trips valid V3 layout data', () => {
    const panes = makePanes(2);
    const { projects, workspaces, activeProjectId } =
      makeProjectAndWorkspace(panes);
    saveLayout(projects, workspaces, activeProjectId);

    const loaded = loadLayout();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.projects).toHaveLength(1);
    const ws = loaded!.workspaces[loaded!.projects[0]!.activeWorkspaceId];
    expect(ws!.panes).toEqual(panes);
    expect(loaded!.savedAt).toBeTruthy();
  });

  it('returns null when nothing saved', () => {
    expect(loadLayout()).toBeNull();
  });

  it('saves a timestamp', () => {
    const { projects, workspaces, activeProjectId } = makeProjectAndWorkspace(
      makePanes(1),
    );
    saveLayout(projects, workspaces, activeProjectId);
    const loaded = loadLayout();
    expect(loaded!.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ── V1 migration ──

describe('loadLayout — V1 migration', () => {
  it('migrates V1 format to V3', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        panes: makePanes(2),
        activePaneId: 'pane-0',
        activePreset: null,
        dockviewLayout: null,
        savedAt: new Date().toISOString(),
      }),
    );
    const loaded = loadLayout();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.projects).toHaveLength(1);
    const wsId = loaded!.projects[0]!.activeWorkspaceId;
    const ws = loaded!.workspaces[wsId];
    expect(ws!.panes).toHaveLength(2);
    expect(ws!.activePaneId).toBe('pane-0');
  });
});

// ── V2 migration ──

describe('loadLayout — V2 migration', () => {
  it('migrates V2 format to V3', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        workspaces: [
          {
            id: 'ws-old',
            name: 'Old Workspace',
            panes: makePanes(3),
            activePaneId: 'pane-1',
            maximizedPaneId: null,
            activePreset: null,
            dockviewLayout: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        activeWorkspaceId: 'ws-old',
        savedAt: new Date().toISOString(),
      }),
    );
    const loaded = loadLayout();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.projects).toHaveLength(1);
    const ws = loaded!.workspaces['ws-old'];
    expect(ws!.panes).toHaveLength(3);
    expect(ws!.activePaneId).toBe('pane-1');
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
});

// ── clearSavedLayout ──

describe('clearSavedLayout', () => {
  it('removes saved layout', () => {
    const { projects, workspaces, activeProjectId } = makeProjectAndWorkspace(
      makePanes(1),
    );
    saveLayout(projects, workspaces, activeProjectId);
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
      workspaces: [
        {
          id: 'ws-1',
          name: 'Default',
          panes: makePanes(2),
          activePaneId: 'pane-0',
          maximizedPaneId: null,
          activePreset: null,
          dockviewLayout: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const loaded = loadNamedLayouts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.name).toBe('My Layout');
    expect(loaded[0]!.savedAt).toBeTruthy();
  });

  it('overwrites layout with same ID', () => {
    const wsBase = {
      id: 'ws-1',
      name: 'Default',
      activePaneId: null,
      maximizedPaneId: null,
      activePreset: null,
      dockviewLayout: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveNamedLayout({
      id: 'layout-1',
      name: 'V1',
      workspaces: [{ ...wsBase, panes: makePanes(1) }],
    });
    saveNamedLayout({
      id: 'layout-1',
      name: 'V2',
      workspaces: [{ ...wsBase, panes: makePanes(2) }],
    });

    const loaded = loadNamedLayouts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.name).toBe('V2');
  });

  it('stores multiple layouts with different IDs', () => {
    const wsBase = {
      id: 'ws-1',
      name: 'Default',
      panes: [],
      activePaneId: null,
      maximizedPaneId: null,
      activePreset: null,
      dockviewLayout: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveNamedLayout({ id: 'a', name: 'A', workspaces: [wsBase] });
    saveNamedLayout({ id: 'b', name: 'B', workspaces: [wsBase] });

    expect(loadNamedLayouts()).toHaveLength(2);
  });

  it('deletes a named layout by ID', () => {
    const wsBase = {
      id: 'ws-1',
      name: 'Default',
      panes: [],
      activePaneId: null,
      maximizedPaneId: null,
      activePreset: null,
      dockviewLayout: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveNamedLayout({ id: 'x', name: 'X', workspaces: [wsBase] });
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
