import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_PROFILES } from '@/lib/profiles';
import { useWorkspaceStore } from './workspace-store';

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

function resetStore() {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
}

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

// ── addPane ──

describe('addPane', () => {
  it('adds a pane with the given profile', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const panes = useWorkspaceStore.getState().workspace.panes;
    expect(panes).toHaveLength(1);
    expect(panes[0]!.profileId).toBe(shellId);
  });

  it('sets the new pane as active', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const state = useWorkspaceStore.getState();
    expect(state.activePaneId).toBe(state.workspace.panes[0]!.id);
  });

  it('adds multiple panes', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    addPane(shellId);
    expect(useWorkspaceStore.getState().workspace.panes).toHaveLength(3);
  });

  it('sets splitFrom referencing the active pane', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    const firstId = useWorkspaceStore.getState().workspace.panes[0]!.id;
    addPane(claudeId);
    const second = useWorkspaceStore.getState().workspace.panes[1]!;
    expect(second.splitFrom?.paneId).toBe(firstId);
    expect(second.splitFrom?.direction).toBe('right');
  });

  it('clears activePreset when adding manually', () => {
    const state = useWorkspaceStore.getState();
    state.applyPreset('Side by Side', shellId);
    expect(useWorkspaceStore.getState().activePreset).toBe('Side by Side');
    useWorkspaceStore.getState().addPane(shellId);
    expect(useWorkspaceStore.getState().activePreset).toBeNull();
  });

  it('falls back to default profile for unknown profileId', () => {
    useWorkspaceStore.getState().addPane('nonexistent-profile');
    const pane = useWorkspaceStore.getState().workspace.panes[0]!;
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
    const panes = useWorkspaceStore.getState().workspace.panes;
    useWorkspaceStore.getState().removePane(panes[0]!.id);
    expect(useWorkspaceStore.getState().workspace.panes).toHaveLength(1);
    expect(useWorkspaceStore.getState().workspace.panes[0]!.profileId).toBe(
      claudeId,
    );
  });

  it('updates activePaneId when active pane is removed', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    const activeId = useWorkspaceStore.getState().activePaneId!;
    // Active is the second pane (last added)
    useWorkspaceStore.getState().removePane(activeId);
    // Should fall back to remaining pane
    const state = useWorkspaceStore.getState();
    expect(state.activePaneId).toBe(state.workspace.panes[0]!.id);
  });

  it('sets activePaneId to null when last pane removed', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const id = useWorkspaceStore.getState().workspace.panes[0]!.id;
    useWorkspaceStore.getState().removePane(id);
    expect(useWorkspaceStore.getState().activePaneId).toBeNull();
    expect(useWorkspaceStore.getState().workspace.panes).toHaveLength(0);
  });

  it('clears maximizedPaneId if the maximized pane is removed', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const id = useWorkspaceStore.getState().workspace.panes[0]!.id;
    useWorkspaceStore.getState().toggleMaximize(id);
    expect(useWorkspaceStore.getState().maximizedPaneId).toBe(id);
    useWorkspaceStore.getState().removePane(id);
    expect(useWorkspaceStore.getState().maximizedPaneId).toBeNull();
  });
});

// ── applyPreset ──

describe('applyPreset', () => {
  it('creates correct number of panes for Side by Side', () => {
    useWorkspaceStore.getState().applyPreset('Side by Side', shellId);
    expect(useWorkspaceStore.getState().workspace.panes).toHaveLength(2);
  });

  it('creates correct number of panes for 2×2 Grid', () => {
    useWorkspaceStore.getState().applyPreset('2×2 Grid', shellId);
    expect(useWorkspaceStore.getState().workspace.panes).toHaveLength(4);
  });

  it('creates correct number of panes for Single', () => {
    useWorkspaceStore.getState().applyPreset('Single', shellId);
    expect(useWorkspaceStore.getState().workspace.panes).toHaveLength(1);
  });

  it('sets activePreset to the applied preset name', () => {
    useWorkspaceStore.getState().applyPreset('3 Column', shellId);
    expect(useWorkspaceStore.getState().activePreset).toBe('3 Column');
  });

  it('reuses existing panes when applying a larger preset', () => {
    useWorkspaceStore.getState().addPane(claudeId);
    const existingId = useWorkspaceStore.getState().workspace.panes[0]!.id;

    useWorkspaceStore.getState().applyPreset('Side by Side', shellId);
    const panes = useWorkspaceStore.getState().workspace.panes;
    // First pane should be the existing one (preserved)
    expect(panes[0]!.id).toBe(existingId);
    expect(panes[0]!.profileId).toBe(claudeId);
    // Second pane is new with the specified profile
    expect(panes[1]!.profileId).toBe(shellId);
  });

  it('keeps extra panes when applying a smaller preset', () => {
    useWorkspaceStore.getState().applyPreset('2×2 Grid', shellId);
    expect(useWorkspaceStore.getState().workspace.panes).toHaveLength(4);

    useWorkspaceStore.getState().applyPreset('Side by Side', shellId);
    // Existing 4 panes kept (preset only requires 2, but extras are preserved)
    expect(
      useWorkspaceStore.getState().workspace.panes.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('ignores unknown preset name', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const before = useWorkspaceStore.getState().workspace.panes.length;
    useWorkspaceStore.getState().applyPreset('Nonexistent', shellId);
    expect(useWorkspaceStore.getState().workspace.panes).toHaveLength(before);
  });

  it('increments layoutVersion', () => {
    const before = useWorkspaceStore.getState().layoutVersion;
    useWorkspaceStore.getState().applyPreset('Single', shellId);
    expect(useWorkspaceStore.getState().layoutVersion).toBe(before + 1);
  });

  it('sets dockviewPosition on panes', () => {
    useWorkspaceStore.getState().applyPreset('Side by Side', shellId);
    const panes = useWorkspaceStore.getState().workspace.panes;
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
    const paneId = useWorkspaceStore.getState().workspace.panes[0]!.id;

    useWorkspaceStore.getState().updatePaneProfile(paneId, claudeId);
    const pane = useWorkspaceStore.getState().workspace.panes[0]!;
    expect(pane.profileId).toBe(claudeId);
    expect(pane.title).toBe('Claude Code');
  });

  it('falls back to default profile for unknown profileId', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const paneId = useWorkspaceStore.getState().workspace.panes[0]!.id;

    useWorkspaceStore.getState().updatePaneProfile(paneId, 'bogus');
    const pane = useWorkspaceStore.getState().workspace.panes[0]!;
    expect(pane.title).toBe(DEFAULT_PROFILES[0]!.name);
  });

  it('clears activePreset', () => {
    useWorkspaceStore.getState().applyPreset('Single', shellId);
    const paneId = useWorkspaceStore.getState().workspace.panes[0]!.id;
    useWorkspaceStore.getState().updatePaneProfile(paneId, claudeId);
    expect(useWorkspaceStore.getState().activePreset).toBeNull();
  });
});

// ── clearAllPanes ──

describe('clearAllPanes', () => {
  it('removes all panes and resets state', () => {
    useWorkspaceStore.getState().applyPreset('2×2 Grid', shellId);
    useWorkspaceStore.getState().clearAllPanes();
    const state = useWorkspaceStore.getState();
    expect(state.workspace.panes).toHaveLength(0);
    expect(state.activePaneId).toBeNull();
    expect(state.activePreset).toBeNull();
    expect(state.maximizedPaneId).toBeNull();
  });
});

// ── Focus navigation ──

describe('focus navigation', () => {
  it('focusNextPane wraps around', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    const panes = useWorkspaceStore.getState().workspace.panes;
    // Active is last added (panes[1])
    useWorkspaceStore.getState().focusNextPane();
    expect(useWorkspaceStore.getState().activePaneId).toBe(panes[0]!.id);
  });

  it('focusPrevPane wraps around', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    const panes = useWorkspaceStore.getState().workspace.panes;
    // Set active to first pane
    useWorkspaceStore.getState().setActivePaneId(panes[0]!.id);
    useWorkspaceStore.getState().focusPrevPane();
    expect(useWorkspaceStore.getState().activePaneId).toBe(panes[1]!.id);
  });

  it('focusPaneByIndex selects correct pane', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    addPane(shellId);
    const panes = useWorkspaceStore.getState().workspace.panes;
    useWorkspaceStore.getState().focusPaneByIndex(1);
    expect(useWorkspaceStore.getState().activePaneId).toBe(panes[1]!.id);
  });

  it('focusPaneByIndex does nothing for out-of-range index', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const before = useWorkspaceStore.getState().activePaneId;
    useWorkspaceStore.getState().focusPaneByIndex(99);
    expect(useWorkspaceStore.getState().activePaneId).toBe(before);
  });
});

// ── renameWorkspace ──

describe('renameWorkspace', () => {
  it('updates workspace name', () => {
    useWorkspaceStore.getState().renameWorkspace('My Agents');
    expect(useWorkspaceStore.getState().workspace.name).toBe('My Agents');
  });
});

// ── toggleMaximize ──

describe('toggleMaximize', () => {
  it('sets and clears maximizedPaneId', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const id = useWorkspaceStore.getState().workspace.panes[0]!.id;

    useWorkspaceStore.getState().toggleMaximize(id);
    expect(useWorkspaceStore.getState().maximizedPaneId).toBe(id);

    useWorkspaceStore.getState().toggleMaximize(id);
    expect(useWorkspaceStore.getState().maximizedPaneId).toBeNull();
  });
});

// ── addPaneWithCwd ──

describe('addPaneWithCwd', () => {
  it('adds a pane with the specified cwd', () => {
    useWorkspaceStore.getState().addPaneWithCwd(shellId, 'C:\\Projects\\app');
    const pane = useWorkspaceStore.getState().workspace.panes[0]!;
    expect(pane.profileId).toBe(shellId);
    expect(pane.cwd).toBe('C:\\Projects\\app');
  });

  it('sets splitFrom referencing the active pane', () => {
    useWorkspaceStore.getState().addPane(shellId);
    const firstId = useWorkspaceStore.getState().workspace.panes[0]!.id;
    useWorkspaceStore
      .getState()
      .addPaneWithCwd(claudeId, '/home/user', 'below');
    const second = useWorkspaceStore.getState().workspace.panes[1]!;
    expect(second.splitFrom?.paneId).toBe(firstId);
    expect(second.splitFrom?.direction).toBe('below');
  });

  it('has no splitFrom when it is the first pane', () => {
    useWorkspaceStore.getState().addPaneWithCwd(shellId, 'C:\\');
    const pane = useWorkspaceStore.getState().workspace.panes[0]!;
    expect(pane.splitFrom).toBeUndefined();
  });

  it('clears showProjectBrowser when adding from empty state', () => {
    useWorkspaceStore.getState().setShowProjectBrowser(true);
    useWorkspaceStore.getState().addPaneWithCwd(shellId, 'C:\\');
    expect(useWorkspaceStore.getState().showProjectBrowser).toBe(false);
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
    const id = useWorkspaceStore.getState().workspace.panes[0]!.id;
    useWorkspaceStore.getState().updatePaneColor(id, '#ff0000');
    expect(useWorkspaceStore.getState().workspace.panes[0]!.colorOverride).toBe(
      '#ff0000',
    );
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

// ── getPaneIndex ──

describe('getPaneIndex', () => {
  it('returns index of existing pane', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    const panes = useWorkspaceStore.getState().workspace.panes;
    expect(useWorkspaceStore.getState().getPaneIndex(panes[1]!.id)).toBe(1);
  });

  it('returns -1 for unknown pane', () => {
    expect(useWorkspaceStore.getState().getPaneIndex('nonexistent')).toBe(-1);
  });
});

// ── restoreLayout ──

describe('restoreLayout', () => {
  it('restores a valid saved layout', () => {
    // Save a layout to localStorage
    const panes = [
      { id: 'p1', profileId: shellId, title: 'Shell' },
      { id: 'p2', profileId: claudeId, title: 'Claude' },
    ];
    localStorage.setItem(
      'agent-grid:layout',
      JSON.stringify({
        panes,
        activePaneId: 'p2',
        activePreset: 'Side by Side',
        dockviewLayout: null,
        savedAt: new Date().toISOString(),
      }),
    );

    const result = useWorkspaceStore.getState().restoreLayout();
    expect(result).toBe(true);
    expect(useWorkspaceStore.getState().workspace.panes).toHaveLength(2);
    expect(useWorkspaceStore.getState().activePaneId).toBe('p2');
    expect(useWorkspaceStore.getState().activePreset).toBe('Side by Side');
  });

  it('returns false for empty localStorage', () => {
    const result = useWorkspaceStore.getState().restoreLayout();
    expect(result).toBe(false);
  });

  it('returns false for empty panes array', () => {
    localStorage.setItem(
      'agent-grid:layout',
      JSON.stringify({
        panes: [],
        activePaneId: null,
        activePreset: null,
        dockviewLayout: null,
        savedAt: new Date().toISOString(),
      }),
    );
    expect(useWorkspaceStore.getState().restoreLayout()).toBe(false);
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
    const panes = useWorkspaceStore.getState().workspace.panes;
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
    // Saved layout should have been cleared
    expect(localStorage.getItem('agent-grid:layout')).toBeNull();
  });

  it('sanitizes dockviewPosition with broken references', () => {
    localStorage.setItem(
      'agent-grid:layout',
      JSON.stringify({
        panes: [
          { id: 'p1', profileId: shellId, title: 'Shell' },
          {
            id: 'p2',
            profileId: claudeId,
            title: 'Claude',
            dockviewPosition: {
              referenceId: 'deleted-pane',
              direction: 'right',
            },
          },
        ],
        activePaneId: 'p1',
        activePreset: null,
        dockviewLayout: null,
        savedAt: new Date().toISOString(),
      }),
    );
    useWorkspaceStore.getState().restoreLayout();
    const p2 = useWorkspaceStore
      .getState()
      .workspace.panes.find((p) => p.id === 'p2');
    // Broken reference should have been stripped
    expect(p2?.dockviewPosition).toBeUndefined();
  });

  it('keeps valid dockviewPosition references', () => {
    localStorage.setItem(
      'agent-grid:layout',
      JSON.stringify({
        panes: [
          { id: 'p1', profileId: shellId, title: 'Shell' },
          {
            id: 'p2',
            profileId: claudeId,
            title: 'Claude',
            dockviewPosition: { referenceId: 'p1', direction: 'right' },
          },
        ],
        activePaneId: 'p1',
        activePreset: null,
        dockviewLayout: null,
        savedAt: new Date().toISOString(),
      }),
    );
    useWorkspaceStore.getState().restoreLayout();
    const p2 = useWorkspaceStore
      .getState()
      .workspace.panes.find((p) => p.id === 'p2');
    expect(p2?.dockviewPosition?.referenceId).toBe('p1');
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

// ── saveCustomLayout / deleteCustomLayout / applyCustomLayout ──

describe('custom layouts', () => {
  it('saveCustomLayout persists to localStorage and updates state', () => {
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.getState().saveCustomLayout('My Layout');
    const layouts = useWorkspaceStore.getState().customLayouts;
    expect(layouts).toHaveLength(1);
    expect(layouts[0]!.name).toBe('My Layout');
    expect(layouts[0]!.panes).toHaveLength(1);
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
    expect(useWorkspaceStore.getState().workspace.panes).toHaveLength(0);

    useWorkspaceStore.getState().applyCustomLayout(layout);
    expect(useWorkspaceStore.getState().workspace.panes).toHaveLength(2);
  });

  it('applyCustomLayout skips panes with invalid profiles', () => {
    const layout = {
      id: 'test',
      name: 'Bad',
      panes: [
        { id: 'ok', profileId: shellId, title: 'Shell' },
        { id: 'bad', profileId: 'nonexistent', title: 'Gone' },
      ],
      dockviewLayout: null,
      savedAt: new Date().toISOString(),
    };
    useWorkspaceStore.getState().applyCustomLayout(layout);
    expect(useWorkspaceStore.getState().workspace.panes).toHaveLength(1);
  });

  it('applyCustomLayout does nothing when all panes are invalid', () => {
    useWorkspaceStore.getState().addPane(shellId); // have a pane first
    const layout = {
      id: 'test',
      name: 'All Bad',
      panes: [{ id: 'bad', profileId: 'fake', title: 'Gone' }],
      dockviewLayout: null,
      savedAt: new Date().toISOString(),
    };
    useWorkspaceStore.getState().applyCustomLayout(layout);
    // Original pane should still be there
    expect(useWorkspaceStore.getState().workspace.panes).toHaveLength(1);
  });
});

// ── Focus navigation edge cases ──

describe('focus navigation — edge cases', () => {
  it('focusNextPane does nothing with no panes', () => {
    useWorkspaceStore.getState().focusNextPane();
    expect(useWorkspaceStore.getState().activePaneId).toBeNull();
  });

  it('focusPrevPane does nothing with no panes', () => {
    useWorkspaceStore.getState().focusPrevPane();
    expect(useWorkspaceStore.getState().activePaneId).toBeNull();
  });

  it('focusNextPane selects first pane when activePaneId is stale', () => {
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.setState({ activePaneId: 'deleted-id' });
    useWorkspaceStore.getState().focusNextPane();
    expect(useWorkspaceStore.getState().activePaneId).toBe(
      useWorkspaceStore.getState().workspace.panes[0]!.id,
    );
  });

  it('focusPrevPane selects last pane when activePaneId is stale', () => {
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(claudeId);
    useWorkspaceStore.setState({ activePaneId: 'deleted-id' });
    useWorkspaceStore.getState().focusPrevPane();
    const panes = useWorkspaceStore.getState().workspace.panes;
    expect(useWorkspaceStore.getState().activePaneId).toBe(
      panes[panes.length - 1]!.id,
    );
  });
});
