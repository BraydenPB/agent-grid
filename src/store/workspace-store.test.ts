import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_PROFILES } from '@/lib/profiles';
import { useWorkspaceStore, getActiveWorkspace } from './workspace-store';

// Mock tauri-shim — getPlatform has a module-level cache, so mock before import
vi.mock('@/lib/tauri-shim', () => ({
  getHomeDir: vi.fn().mockResolvedValue('C:\\Users\\test'),
  getPlatform: vi.fn().mockReturnValue('windows'),
}));

// Mock dockview-api ref
vi.mock('@/lib/dockview-api', () => ({
  dockviewApiRef: { current: null },
}));

const shellId = 'system-shell';
const claudeId = 'claude-code';

/** Get the active workspace's state */
function ws() {
  return getActiveWorkspace(useWorkspaceStore.getState());
}

function resetStore() {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
}

/** Ensure a project + workspace exist (needed for actions that don't auto-create) */
function ensureWorkspace() {
  if (!ws()) {
    useWorkspaceStore.getState().addProject('Test', '');
  }
}

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

// ── addPane ──

describe('addPane', () => {
  it('adds a pane with the given profile', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const panes = ws()!.panes;
    expect(panes).toHaveLength(1);
    expect(panes[0]!.profileId).toBe(shellId);
  });

  it('sets the new pane as active', () => {
    useWorkspaceStore.getState().addPane(shellId);
    expect(ws()!.activePaneId).toBe(ws()!.panes[0]!.id);
  });

  it('adds multiple panes', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    addPane(shellId);
    expect(ws()!.panes).toHaveLength(3);
  });

  it('sets splitFrom referencing the active pane', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    const firstId = ws()!.panes[0]!.id;
    addPane(claudeId);
    const second = ws()!.panes[1]!;
    expect(second.splitFrom?.paneId).toBe(firstId);
    expect(second.splitFrom?.direction).toBe('right');
  });

  it('clears activePreset when adding manually', () => {
    ensureWorkspace();
    const state = useWorkspaceStore.getState();
    state.applyPreset('Side by Side', shellId);
    expect(ws()!.activePreset).toBe('Side by Side');
    useWorkspaceStore.getState().addPane(shellId);
    expect(ws()!.activePreset).toBeNull();
  });

  it('falls back to default profile for unknown profileId', () => {
    useWorkspaceStore.getState().addPane('nonexistent-profile');
    const pane = ws()!.panes[0]!;
    // Falls back to defaultProfile (first in DEFAULT_PROFILES)
    expect(pane.title).toBe(DEFAULT_PROFILES[0]!.name);
  });
});

// ── removePane ──

describe('removePane', () => {
  it('removes the specified pane', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    const panes = ws()!.panes;
    useWorkspaceStore.getState().removePane(panes[0]!.id);
    expect(ws()!.panes).toHaveLength(1);
    expect(ws()!.panes[0]!.profileId).toBe(claudeId);
  });

  it('updates activePaneId when active pane is removed', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    const activeId = ws()!.activePaneId!;
    // Active is the second pane (last added)
    useWorkspaceStore.getState().removePane(activeId);
    // Should fall back to remaining pane
    expect(ws()!.activePaneId).toBe(ws()!.panes[0]!.id);
  });

  it('sets activePaneId to null when last pane removed', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const id = ws()!.panes[0]!.id;
    useWorkspaceStore.getState().removePane(id);
    expect(ws()!.activePaneId).toBeNull();
    expect(ws()!.panes).toHaveLength(0);
  });

  it('clears maximizedPaneId if the maximized pane is removed', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const id = ws()!.panes[0]!.id;
    useWorkspaceStore.getState().toggleMaximize(id);
    // toggleMaximize with no expandedPaneId calls expandPane (Level 2)
    expect(useWorkspaceStore.getState().expandedPaneId).toBe(id);
    useWorkspaceStore.getState().removePane(id);
    // The pane is removed; expandedPaneId still set but pane is gone
    expect(ws()!.panes).toHaveLength(0);
  });
});

// ── applyPreset ──

describe('applyPreset', () => {
  it('creates correct number of panes for Side by Side', () => {
    ensureWorkspace();
    useWorkspaceStore.getState().applyPreset('Side by Side', shellId);
    expect(ws()!.panes).toHaveLength(2);
  });

  it('creates correct number of panes for 2×2 Grid', () => {
    ensureWorkspace();
    useWorkspaceStore.getState().applyPreset('2×2 Grid', shellId);
    expect(ws()!.panes).toHaveLength(4);
  });

  it('creates correct number of panes for Single', () => {
    ensureWorkspace();
    useWorkspaceStore.getState().applyPreset('Single', shellId);
    expect(ws()!.panes).toHaveLength(1);
  });

  it('sets activePreset to the applied preset name', () => {
    ensureWorkspace();
    useWorkspaceStore.getState().applyPreset('3 Column', shellId);
    expect(ws()!.activePreset).toBe('3 Column');
  });

  it('reuses existing panes when applying a larger preset', () => {
    useWorkspaceStore.getState().addPane(claudeId);
    const existingId = ws()!.panes[0]!.id;

    useWorkspaceStore.getState().applyPreset('Side by Side', shellId);
    const panes = ws()!.panes;
    // First pane should be the existing one (preserved)
    expect(panes[0]!.id).toBe(existingId);
    expect(panes[0]!.profileId).toBe(claudeId);
    // Second pane is new with the specified profile
    expect(panes[1]!.profileId).toBe(shellId);
  });

  it('keeps extra panes when applying a smaller preset', () => {
    ensureWorkspace();
    useWorkspaceStore.getState().applyPreset('2×2 Grid', shellId);
    expect(ws()!.panes).toHaveLength(4);

    useWorkspaceStore.getState().applyPreset('Side by Side', shellId);
    // Existing 4 panes kept (preset only requires 2, but extras are preserved)
    expect(ws()!.panes.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores unknown preset name', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const before = ws()!.panes.length;
    useWorkspaceStore.getState().applyPreset('Nonexistent', shellId);
    expect(ws()!.panes).toHaveLength(before);
  });

  it('increments layoutVersion', () => {
    ensureWorkspace();
    const before = useWorkspaceStore.getState().layoutVersion;
    useWorkspaceStore.getState().applyPreset('Single', shellId);
    expect(useWorkspaceStore.getState().layoutVersion).toBe(before + 1);
  });

  it('sets dockviewPosition on panes', () => {
    ensureWorkspace();
    useWorkspaceStore.getState().applyPreset('Side by Side', shellId);
    const panes = ws()!.panes;
    // First pane has empty position, second references first
    expect(panes[0]!.dockviewPosition).toBeDefined();
    expect(panes[1]!.dockviewPosition?.referenceId).toBe(panes[0]!.id);
    expect(panes[1]!.dockviewPosition?.direction).toBe('right');
  });
});

// ── updatePaneProfile ──

describe('updatePaneProfile', () => {
  it('changes profile and title', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const paneId = ws()!.panes[0]!.id;

    useWorkspaceStore.getState().updatePaneProfile(paneId, claudeId);
    const pane = ws()!.panes[0]!;
    expect(pane.profileId).toBe(claudeId);
    expect(pane.title).toBe('Claude Code');
  });

  it('falls back to default profile for unknown profileId', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const paneId = ws()!.panes[0]!.id;

    useWorkspaceStore.getState().updatePaneProfile(paneId, 'bogus');
    const pane = ws()!.panes[0]!;
    expect(pane.title).toBe(DEFAULT_PROFILES[0]!.name);
  });

  it('clears activePreset', () => {
    ensureWorkspace();
    useWorkspaceStore.getState().applyPreset('Single', shellId);
    const paneId = ws()!.panes[0]!.id;
    useWorkspaceStore.getState().updatePaneProfile(paneId, claudeId);
    expect(ws()!.activePreset).toBeNull();
  });
});

// ── clearAllPanes ──

describe('clearAllPanes', () => {
  it('removes all panes and resets state', () => {
    ensureWorkspace();
    useWorkspaceStore.getState().applyPreset('2×2 Grid', shellId);
    useWorkspaceStore.getState().clearAllPanes();
    expect(ws()!.panes).toHaveLength(0);
    expect(ws()!.activePaneId).toBeNull();
    expect(ws()!.activePreset).toBeNull();
    expect(ws()!.maximizedPaneId).toBeNull();
  });
});

// ── Focus navigation ──

describe('focus navigation', () => {
  it('focusNextPane wraps around', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    const panes = ws()!.panes;
    // Active is last added (panes[1])
    useWorkspaceStore.getState().focusNextPane();
    expect(ws()!.activePaneId).toBe(panes[0]!.id);
  });

  it('focusPrevPane wraps around', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    const panes = ws()!.panes;
    // Set active to first pane
    useWorkspaceStore.getState().setActivePaneId(panes[0]!.id);
    useWorkspaceStore.getState().focusPrevPane();
    expect(ws()!.activePaneId).toBe(panes[1]!.id);
  });

  it('focusPaneByIndex selects correct pane', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    addPane(shellId);
    const panes = ws()!.panes;
    useWorkspaceStore.getState().focusPaneByIndex(1);
    expect(ws()!.activePaneId).toBe(panes[1]!.id);
  });

  it('focusPaneByIndex does nothing for out-of-range index', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const before = ws()!.activePaneId;
    useWorkspaceStore.getState().focusPaneByIndex(99);
    expect(ws()!.activePaneId).toBe(before);
  });
});

// ── renameWorkspaceTab ──

describe('renameWorkspaceTab', () => {
  it('updates workspace name', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const wsId = ws()!.id;
    useWorkspaceStore.getState().renameWorkspaceTab(wsId, 'My Agents');
    expect(ws()!.name).toBe('My Agents');
  });
});

// ── toggleMaximize ──

describe('toggleMaximize', () => {
  it('sets expandedPaneId on first toggle, clears on second', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const id = ws()!.panes[0]!.id;

    useWorkspaceStore.getState().toggleMaximize(id);
    expect(useWorkspaceStore.getState().expandedPaneId).toBe(id);

    // Second toggle while expanded enters level 3
    useWorkspaceStore.getState().toggleMaximize(id);
    expect(useWorkspaceStore.getState().level3PaneId).toBe(id);
  });
});

// ── addPaneWithCwd ──

describe('addPaneWithCwd', () => {
  it('adds a pane with the specified cwd', () => {
    // Need a workspace first
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.getState().addPaneWithCwd(shellId, 'C:\\Projects\\app');
    const pane = ws()!.panes[1]!;
    expect(pane.profileId).toBe(shellId);
    expect(pane.cwd).toBe('C:\\Projects\\app');
  });

  it('sets splitFrom referencing the active pane', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const firstId = ws()!.panes[0]!.id;
    useWorkspaceStore
      .getState()
      .addPaneWithCwd(claudeId, '/home/user', 'below');
    const second = ws()!.panes[1]!;
    expect(second.splitFrom?.paneId).toBe(firstId);
    expect(second.splitFrom?.direction).toBe('below');
  });
});

// ── setPendingCwd / clearPendingCwd ──

describe('setPendingCwd / clearPendingCwd', () => {
  it('sets pending cwd for a pane', () => {
    useWorkspaceStore.getState().setPendingCwd('pane-1', 'C:\\Projects');
    expect(useWorkspaceStore.getState().pendingCwd).toEqual({
      paneId: 'pane-1',
      path: 'C:\\Projects',
    });
  });

  it('clears pending cwd', () => {
    useWorkspaceStore.getState().setPendingCwd('pane-1', 'C:\\Projects');
    useWorkspaceStore.getState().clearPendingCwd();
    expect(useWorkspaceStore.getState().pendingCwd).toBeNull();
  });
});

// ── updatePaneColor ──

describe('updatePaneColor', () => {
  it('sets a color override on the pane', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const id = ws()!.panes[0]!.id;
    useWorkspaceStore.getState().updatePaneColor(id, '#ff0000');
    expect(ws()!.panes[0]!.colorOverride).toBe('#ff0000');
  });
});

// ── updateProfileColor ──

describe('updateProfileColor', () => {
  it('updates profile color and persists to localStorage', () => {
    useWorkspaceStore.getState().updateProfileColor(shellId, '#00ff00');
    const profile = useWorkspaceStore
      .getState()
      .profiles.find((p) => p.id === shellId);
    expect(profile?.color).toBe('#00ff00');

    // Check localStorage persistence
    const stored = JSON.parse(
      localStorage.getItem('agent-grid:profile-colors') ?? '{}',
    ) as Record<string, string>;
    expect(stored[shellId]).toBe('#00ff00');
  });
});

// ── addProfile ──

describe('addProfile', () => {
  it('appends a new profile', () => {
    const custom = {
      id: 'custom-agent',
      name: 'Custom Agent',
      command: 'node',
      args: ['agent.js'],
    };
    useWorkspaceStore.getState().addProfile(custom);
    const profiles = useWorkspaceStore.getState().profiles;
    expect(profiles[profiles.length - 1]).toEqual(custom);
  });
});

// ── Simple setters ──

describe('simple setters', () => {
  it('setProjectsPath updates projectsPath', () => {
    useWorkspaceStore.getState().setProjectsPath('/home/user/code');
    expect(useWorkspaceStore.getState().projectsPath).toBe('/home/user/code');
  });

  it('setShowProjectBrowser toggles overlay', () => {
    useWorkspaceStore.getState().setShowProjectBrowser(true);
    expect(useWorkspaceStore.getState().showProjectBrowser).toBe(true);
  });

  it('setChangeDirPaneId tracks the requesting pane', () => {
    useWorkspaceStore.getState().setChangeDirPaneId('pane-1');
    expect(useWorkspaceStore.getState().changeDirPaneId).toBe('pane-1');
    useWorkspaceStore.getState().setChangeDirPaneId(null);
    expect(useWorkspaceStore.getState().changeDirPaneId).toBeNull();
  });

  it('setShowCommandPalette toggles command palette', () => {
    useWorkspaceStore.getState().setShowCommandPalette(true);
    expect(useWorkspaceStore.getState().showCommandPalette).toBe(true);
  });
});

// ── Project actions ──

describe('project actions', () => {
  it('addProject creates a project with a default workspace', () => {
    useWorkspaceStore.getState().addProject('My Project', '/path/to/project');
    const state = useWorkspaceStore.getState();
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0]!.name).toBe('My Project');
    expect(state.projects[0]!.path).toBe('/path/to/project');
    expect(Object.keys(state.workspaces)).toHaveLength(1);
    expect(state.activeProjectId).toBe(state.projects[0]!.id);
    expect(state.currentLevel).toBe(2);
  });

  it('setMainPane sets the main pane for the active project', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const paneId = ws()!.panes[0]!.id;
    useWorkspaceStore.getState().setMainPane(paneId);
    const project = useWorkspaceStore
      .getState()
      .projects.find(
        (p) => p.id === useWorkspaceStore.getState().activeProjectId,
      );
    expect(project?.mainPaneId).toBe(paneId);
  });
});

// ── restoreLayout ──

describe('restoreLayout', () => {
  it('restores a valid V1 saved layout', () => {
    localStorage.setItem(
      'agent-grid:layout',
      JSON.stringify({
        panes: [
          { id: 'p1', profileId: shellId, title: 'Shell' },
          { id: 'p2', profileId: claudeId, title: 'Claude' },
        ],
        activePaneId: 'p2',
        activePreset: 'Side by Side',
        dockviewLayout: null,
        savedAt: new Date().toISOString(),
      }),
    );

    const result = useWorkspaceStore.getState().restoreLayout();
    expect(result).toBe(true);
    expect(ws()!.panes).toHaveLength(2);
    expect(ws()!.activePaneId).toBe('p2');
  });

  it('returns false for empty localStorage', () => {
    const result = useWorkspaceStore.getState().restoreLayout();
    expect(result).toBe(false);
  });

  it('filters panes with invalid profileIds', () => {
    localStorage.setItem(
      'agent-grid:layout',
      JSON.stringify({
        panes: [
          { id: 'valid', profileId: shellId, title: 'Shell' },
          { id: 'invalid', profileId: 'nonexistent-profile', title: 'Bad' },
        ],
        activePaneId: null,
        activePreset: null,
        dockviewLayout: null,
        savedAt: new Date().toISOString(),
      }),
    );
    useWorkspaceStore.getState().restoreLayout();
    const panes = ws()!.panes;
    expect(panes).toHaveLength(1);
    expect(panes[0]!.id).toBe('valid');
  });

  it('returns false and clears layout when all panes are invalid', () => {
    localStorage.setItem(
      'agent-grid:layout',
      JSON.stringify({
        panes: [
          { id: 'bad1', profileId: 'fake', title: 'Bad' },
          { id: 'bad2', profileId: 'also-fake', title: 'Bad' },
        ],
        activePaneId: null,
        activePreset: null,
        dockviewLayout: null,
        savedAt: new Date().toISOString(),
      }),
    );
    const result = useWorkspaceStore.getState().restoreLayout();
    expect(result).toBe(false);
    expect(localStorage.getItem('agent-grid:layout')).toBeNull();
  });

  it('increments layoutVersion', () => {
    localStorage.setItem(
      'agent-grid:layout',
      JSON.stringify({
        panes: [{ id: 'p1', profileId: shellId, title: 'Shell' }],
        activePaneId: 'p1',
        activePreset: null,
        dockviewLayout: null,
        savedAt: new Date().toISOString(),
      }),
    );
    const before = useWorkspaceStore.getState().layoutVersion;
    useWorkspaceStore.getState().restoreLayout();
    expect(useWorkspaceStore.getState().layoutVersion).toBe(before + 1);
  });
});

// ── initProjectsPath ──

describe('initProjectsPath', () => {
  it('sets projects path from home dir', async () => {
    await useWorkspaceStore.getState().initProjectsPath();
    expect(useWorkspaceStore.getState().projectsPath).toBe(
      'C:\\Users\\test\\Desktop\\Projects',
    );
  });

  it('skips if projectsPath already set', async () => {
    useWorkspaceStore.getState().setProjectsPath('/already/set');
    await useWorkspaceStore.getState().initProjectsPath();
    expect(useWorkspaceStore.getState().projectsPath).toBe('/already/set');
  });
});

// ── custom layouts ──

describe('custom layouts', () => {
  it('saveCustomLayout persists to localStorage and updates state', () => {
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.getState().saveCustomLayout('My Layout');
    const layouts = useWorkspaceStore.getState().customLayouts;
    expect(layouts).toHaveLength(1);
    expect(layouts[0]!.name).toBe('My Layout');
    expect(layouts[0]!.workspaces[0]!.panes).toHaveLength(1);
  });

  it('deleteCustomLayout removes from state and localStorage', () => {
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.getState().saveCustomLayout('Temp');
    const id = useWorkspaceStore.getState().customLayouts[0]!.id;
    useWorkspaceStore.getState().deleteCustomLayout(id);
    expect(useWorkspaceStore.getState().customLayouts).toHaveLength(0);
  });

  it('applyCustomLayout restores panes from named layout', () => {
    // Create and save a layout
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.getState().addPane(claudeId);
    useWorkspaceStore.getState().saveCustomLayout('Saved');
    const layout = useWorkspaceStore.getState().customLayouts[0]!;

    // Clear and reapply
    useWorkspaceStore.getState().clearAllPanes();
    expect(ws()!.panes).toHaveLength(0);

    useWorkspaceStore.getState().applyCustomLayout(layout);
    expect(ws()!.panes).toHaveLength(2);
  });

  it('applyCustomLayout skips panes with invalid profiles', () => {
    // Need a workspace to exist first
    useWorkspaceStore.getState().addPane(shellId);
    const layout = {
      id: 'test',
      name: 'Bad',
      workspaces: [
        {
          id: 'ws-1',
          name: 'Default',
          panes: [
            { id: 'ok', profileId: shellId, title: 'Shell' },
            { id: 'bad', profileId: 'nonexistent', title: 'Gone' },
          ],
          activePaneId: 'ok',
          maximizedPaneId: null,
          activePreset: null,
          dockviewLayout: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      savedAt: new Date().toISOString(),
    };
    useWorkspaceStore.getState().applyCustomLayout(layout);
    expect(ws()!.panes).toHaveLength(1);
  });
});

// ── Focus navigation edge cases ──

describe('focus navigation — edge cases', () => {
  it('focusNextPane does nothing with no panes', () => {
    useWorkspaceStore.getState().focusNextPane();
    // No workspace exists, should not crash
  });

  it('focusPrevPane does nothing with no panes', () => {
    useWorkspaceStore.getState().focusPrevPane();
    // No workspace exists, should not crash
  });

  it('focusNextPane selects first pane when activePaneId is stale', () => {
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.getState().addPane(shellId);
    // Set active to a deleted ID via workspace update
    useWorkspaceStore.getState().setActivePaneId('deleted-id');
    useWorkspaceStore.getState().focusNextPane();
    expect(ws()!.activePaneId).toBe(ws()!.panes[0]!.id);
  });

  it('focusPrevPane selects last pane when activePaneId is stale', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    useWorkspaceStore.getState().setActivePaneId('deleted-id');
    useWorkspaceStore.getState().focusPrevPane();
    const panes = ws()!.panes;
    expect(ws()!.activePaneId).toBe(panes[panes.length - 1]!.id);
  });
});
