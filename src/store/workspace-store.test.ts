import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_PROFILES } from '@/lib/profiles';
import { useWorkspaceStore, getActiveWorktree } from './workspace-store';

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

/** Get the active worktree's state */
function wt() {
  return getActiveWorktree(useWorkspaceStore.getState());
}

function resetStore() {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
}

/** Ensure a project + worktree exist (needed for actions that don't auto-create) */
function ensureWorktree() {
  if (!wt()) {
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
    const panes = wt()!.panes;
    expect(panes).toHaveLength(1);
    expect(panes[0]!.profileId).toBe(shellId);
  });

  it('sets the new pane as active', () => {
    useWorkspaceStore.getState().addPane(shellId);
    expect(wt()!.activePaneId).toBe(wt()!.panes[0]!.id);
  });

  it('adds multiple panes', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    addPane(shellId);
    expect(wt()!.panes).toHaveLength(3);
  });

  it('sets splitFrom referencing the active pane', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    const firstId = wt()!.panes[0]!.id;
    addPane(claudeId);
    const second = wt()!.panes[1]!;
    expect(second.splitFrom?.paneId).toBe(firstId);
    expect(second.splitFrom?.direction).toBe('right');
  });

  it('clears activePreset when adding manually', () => {
    ensureWorktree();
    const state = useWorkspaceStore.getState();
    state.applyPreset('Side by Side', shellId);
    expect(wt()!.activePreset).toBe('Side by Side');
    useWorkspaceStore.getState().addPane(shellId);
    expect(wt()!.activePreset).toBeNull();
  });

  it('falls back to default profile for unknown profileId', () => {
    useWorkspaceStore.getState().addPane('nonexistent-profile');
    const pane = wt()!.panes[0]!;
    expect(pane.title).toBe(DEFAULT_PROFILES[0]!.name);
  });
});

// ── removePane ──

describe('removePane', () => {
  it('removes the specified pane', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    const panes = wt()!.panes;
    useWorkspaceStore.getState().removePane(panes[0]!.id);
    expect(wt()!.panes).toHaveLength(1);
    expect(wt()!.panes[0]!.profileId).toBe(claudeId);
  });

  it('updates activePaneId when active pane is removed', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    const activeId = wt()!.activePaneId!;
    useWorkspaceStore.getState().removePane(activeId);
    expect(wt()!.activePaneId).toBe(wt()!.panes[0]!.id);
  });

  it('sets activePaneId to null when last pane removed', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const id = wt()!.panes[0]!.id;
    useWorkspaceStore.getState().removePane(id);
    expect(wt()!.activePaneId).toBeNull();
    expect(wt()!.panes).toHaveLength(0);
  });

  it('clears maximizedPaneId if the maximized pane is removed', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const id = wt()!.panes[0]!.id;
    useWorkspaceStore.getState().toggleMaximize(id);
    expect(wt()!.maximizedPaneId).toBe(id);
    useWorkspaceStore.getState().removePane(id);
    expect(wt()!.panes).toHaveLength(0);
  });
});

// ── applyPreset ──

describe('applyPreset', () => {
  it('creates correct number of panes for Side by Side', () => {
    ensureWorktree();
    useWorkspaceStore.getState().applyPreset('Side by Side', shellId);
    expect(wt()!.panes).toHaveLength(2);
  });

  it('creates correct number of panes for 2×2 Grid', () => {
    ensureWorktree();
    useWorkspaceStore.getState().applyPreset('2×2 Grid', shellId);
    expect(wt()!.panes).toHaveLength(4);
  });

  it('creates correct number of panes for Single', () => {
    ensureWorktree();
    useWorkspaceStore.getState().applyPreset('Single', shellId);
    expect(wt()!.panes).toHaveLength(1);
  });

  it('sets activePreset to the applied preset name', () => {
    ensureWorktree();
    useWorkspaceStore.getState().applyPreset('3 Column', shellId);
    expect(wt()!.activePreset).toBe('3 Column');
  });

  it('reuses existing panes when applying a larger preset', () => {
    useWorkspaceStore.getState().addPane(claudeId);
    const existingId = wt()!.panes[0]!.id;

    useWorkspaceStore.getState().applyPreset('Side by Side', shellId);
    const panes = wt()!.panes;
    expect(panes[0]!.id).toBe(existingId);
    expect(panes[0]!.profileId).toBe(claudeId);
    expect(panes[1]!.profileId).toBe(shellId);
  });

  it('keeps extra panes when applying a smaller preset', () => {
    ensureWorktree();
    useWorkspaceStore.getState().applyPreset('2×2 Grid', shellId);
    expect(wt()!.panes).toHaveLength(4);

    useWorkspaceStore.getState().applyPreset('Side by Side', shellId);
    expect(wt()!.panes.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores unknown preset name', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const before = wt()!.panes.length;
    useWorkspaceStore.getState().applyPreset('Nonexistent', shellId);
    expect(wt()!.panes).toHaveLength(before);
  });

  it('increments layoutVersion', () => {
    ensureWorktree();
    const before = useWorkspaceStore.getState().layoutVersion;
    useWorkspaceStore.getState().applyPreset('Single', shellId);
    expect(useWorkspaceStore.getState().layoutVersion).toBe(before + 1);
  });

  it('sets dockviewPosition on panes', () => {
    ensureWorktree();
    useWorkspaceStore.getState().applyPreset('Side by Side', shellId);
    const panes = wt()!.panes;
    expect(panes[0]!.dockviewPosition).toBeDefined();
    expect(panes[1]!.dockviewPosition?.referenceId).toBe(panes[0]!.id);
    expect(panes[1]!.dockviewPosition?.direction).toBe('right');
  });
});

// ── updatePaneProfile ──

describe('updatePaneProfile', () => {
  it('changes profile and title', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const paneId = wt()!.panes[0]!.id;

    useWorkspaceStore.getState().updatePaneProfile(paneId, claudeId);
    const pane = wt()!.panes[0]!;
    expect(pane.profileId).toBe(claudeId);
    expect(pane.title).toBe('Claude Code');
  });

  it('falls back to default profile for unknown profileId', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const paneId = wt()!.panes[0]!.id;

    useWorkspaceStore.getState().updatePaneProfile(paneId, 'bogus');
    const pane = wt()!.panes[0]!;
    expect(pane.title).toBe(DEFAULT_PROFILES[0]!.name);
  });

  it('clears activePreset', () => {
    ensureWorktree();
    useWorkspaceStore.getState().applyPreset('Single', shellId);
    const paneId = wt()!.panes[0]!.id;
    useWorkspaceStore.getState().updatePaneProfile(paneId, claudeId);
    expect(wt()!.activePreset).toBeNull();
  });
});

// ── clearAllPanes ──

describe('clearAllPanes', () => {
  it('removes all panes and resets state', () => {
    ensureWorktree();
    useWorkspaceStore.getState().applyPreset('2×2 Grid', shellId);
    useWorkspaceStore.getState().clearAllPanes();
    expect(wt()!.panes).toHaveLength(0);
    expect(wt()!.activePaneId).toBeNull();
    expect(wt()!.activePreset).toBeNull();
    expect(wt()!.maximizedPaneId).toBeNull();
  });
});

// ── Focus navigation ──

describe('focus navigation', () => {
  it('focusNextPane wraps around', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    const panes = wt()!.panes;
    useWorkspaceStore.getState().focusNextPane();
    expect(wt()!.activePaneId).toBe(panes[0]!.id);
  });

  it('focusPrevPane wraps around', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    const panes = wt()!.panes;
    useWorkspaceStore.getState().setActivePaneId(panes[0]!.id);
    useWorkspaceStore.getState().focusPrevPane();
    expect(wt()!.activePaneId).toBe(panes[1]!.id);
  });

  it('focusPaneByIndex selects correct pane', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    addPane(shellId);
    const panes = wt()!.panes;
    useWorkspaceStore.getState().focusPaneByIndex(1);
    expect(wt()!.activePaneId).toBe(panes[1]!.id);
  });

  it('focusPaneByIndex does nothing for out-of-range index', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const before = wt()!.activePaneId;
    useWorkspaceStore.getState().focusPaneByIndex(99);
    expect(wt()!.activePaneId).toBe(before);
  });
});

// ── renameWorktreeTab ──

describe('renameWorktreeTab', () => {
  it('updates worktree name', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const wtId = wt()!.id;
    useWorkspaceStore.getState().renameWorktreeTab(wtId, 'My Agents');
    expect(wt()!.name).toBe('My Agents');
  });
});

// ── toggleMaximize ──

describe('toggleMaximize', () => {
  it('sets maximizedPaneId on first toggle, clears on second', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const id = wt()!.panes[0]!.id;

    useWorkspaceStore.getState().toggleMaximize(id);
    expect(wt()!.maximizedPaneId).toBe(id);

    useWorkspaceStore.getState().toggleMaximize(id);
    expect(wt()!.maximizedPaneId).toBeNull();
  });
});

// ── addPaneWithCwd ──

describe('addPaneWithCwd', () => {
  it('adds a pane with the specified cwd', () => {
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.getState().addPaneWithCwd(shellId, 'C:\\Projects\\app');
    const pane = wt()!.panes[1]!;
    expect(pane.profileId).toBe(shellId);
    expect(pane.cwd).toBe('C:\\Projects\\app');
  });

  it('sets splitFrom referencing the active pane', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const firstId = wt()!.panes[0]!.id;
    useWorkspaceStore
      .getState()
      .addPaneWithCwd(claudeId, '/home/user', 'below');
    const second = wt()!.panes[1]!;
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
    const id = wt()!.panes[0]!.id;
    useWorkspaceStore.getState().updatePaneColor(id, '#ff0000');
    expect(wt()!.panes[0]!.colorOverride).toBe('#ff0000');
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
  it('addProject creates a project with a default worktree', () => {
    useWorkspaceStore.getState().addProject('My Project', '/path/to/project');
    const state = useWorkspaceStore.getState();
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0]!.name).toBe('My Project');
    expect(state.projects[0]!.path).toBe('/path/to/project');
    expect(Object.keys(state.worktrees)).toHaveLength(1);
    expect(state.activeProjectId).toBe(state.projects[0]!.id);
    expect(state.openProjectIds).toContain(state.projects[0]!.id);
    expect(state.currentLevel).toBe(2);
  });

  it('setMainPane sets the main pane for the active project', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const paneId = wt()!.panes[0]!.id;
    useWorkspaceStore.getState().setMainPane(paneId);
    const project = useWorkspaceStore
      .getState()
      .projects.find(
        (p) => p.id === useWorkspaceStore.getState().activeProjectId,
      );
    expect(project?.mainPaneId).toBe(paneId);
  });
});

// ── focusProjectPane — cross-project state corruption prevention ──

describe('focusProjectPane', () => {
  it('sets activeProjectId and the target worktrees activePaneId atomically', () => {
    const idA = useWorkspaceStore.getState().addProject('A', '/a');
    const paneAId = wt()!.panes[0]!.id;

    const idB = useWorkspaceStore.getState().addProject('B', '/b');
    const paneBId = wt()!.panes[0]!.id;

    // Now A is not active (B is). Focus A's tile on dashboard.
    useWorkspaceStore.getState().focusProjectPane(idA, paneAId);

    const state = useWorkspaceStore.getState();
    expect(state.activeProjectId).toBe(idA);
    const projectA = state.projects.find((p) => p.id === idA)!;
    const projectB = state.projects.find((p) => p.id === idB)!;
    expect(state.worktrees[projectA.activeWorktreeId]!.activePaneId).toBe(
      paneAId,
    );
    // Critically: B's activePaneId was NOT corrupted by A's pane ID
    expect(state.worktrees[projectB.activeWorktreeId]!.activePaneId).toBe(
      paneBId,
    );
  });

  it('does nothing for a non-existent project', () => {
    const idA = useWorkspaceStore.getState().addProject('A', '/a');
    const before = useWorkspaceStore.getState().activeProjectId;
    useWorkspaceStore.getState().focusProjectPane('nonexistent', 'x');
    expect(useWorkspaceStore.getState().activeProjectId).toBe(before);
    expect(idA).toBe(before); // sanity
  });
});

// ── Worktree tab creation ──

describe('createWorktreeFromGit', () => {
  it('creates a new worktree tab with cloned panes', () => {
    useWorkspaceStore.getState().addProject('My Project', '/repo');
    // addProject creates 1 initial pane; add 2 more for 3 total
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.getState().addPane(shellId);
    const originalPanes = wt()!.panes;
    expect(originalPanes).toHaveLength(3);

    const wtId = useWorkspaceStore
      .getState()
      .createWorktreeFromGit('/repo-wt', 'feat/branch');

    const state = useWorkspaceStore.getState();

    // Should create a new worktree tab
    const newWt = state.worktrees[wtId];
    expect(newWt).toBeDefined();
    expect(newWt!.branch).toBe('feat/branch');
    expect(newWt!.cwd).toBe('/repo-wt');
    expect(newWt!.panes).toHaveLength(3);

    // Panes should have new IDs but same profiles
    for (let i = 0; i < newWt!.panes.length; i++) {
      expect(newWt!.panes[i]!.id).not.toBe(originalPanes[i]!.id);
      expect(newWt!.panes[i]!.profileId).toBe(originalPanes[i]!.profileId);
      expect(newWt!.panes[i]!.cwd).toBe('/repo-wt');
    }
  });

  it('returns empty string when no project exists', () => {
    const result = useWorkspaceStore
      .getState()
      .createWorktreeFromGit('/repo-wt', 'branch');
    expect(result).toBe('');
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
    expect(wt()!.panes).toHaveLength(2);
    expect(wt()!.activePaneId).toBe('p2');
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
    const panes = wt()!.panes;
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
    useWorkspaceStore.getState().setRootFolderPath('/already/set');
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
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.getState().addPane(claudeId);
    useWorkspaceStore.getState().saveCustomLayout('Saved');
    const layout = useWorkspaceStore.getState().customLayouts[0]!;

    useWorkspaceStore.getState().clearAllPanes();
    expect(wt()!.panes).toHaveLength(0);

    useWorkspaceStore.getState().applyCustomLayout(layout);
    expect(wt()!.panes).toHaveLength(2);
  });

  it('applyCustomLayout skips panes with invalid profiles', () => {
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
    expect(wt()!.panes).toHaveLength(1);
  });
});

// ── Focus navigation edge cases ──

describe('focus navigation — edge cases', () => {
  it('focusNextPane does nothing with no panes', () => {
    useWorkspaceStore.getState().focusNextPane();
  });

  it('focusPrevPane does nothing with no panes', () => {
    useWorkspaceStore.getState().focusPrevPane();
  });

  it('focusNextPane selects first pane when activePaneId is stale', () => {
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.getState().setActivePaneId('deleted-id');
    useWorkspaceStore.getState().focusNextPane();
    expect(wt()!.activePaneId).toBe(wt()!.panes[0]!.id);
  });

  it('focusPrevPane selects last pane when activePaneId is stale', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    useWorkspaceStore.getState().setActivePaneId('deleted-id');
    useWorkspaceStore.getState().focusPrevPane();
    const panes = wt()!.panes;
    expect(wt()!.activePaneId).toBe(panes[panes.length - 1]!.id);
  });
});
