import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorkspaceStore, getActiveWorktree } from '@/store/workspace-store';
import { useGlobalShortcuts } from './use-global-shortcuts';

// Mock tauri-shim
vi.mock('@/lib/tauri-shim', () => ({
  getHomeDir: vi.fn().mockResolvedValue('C:\\Users\\test'),
  getPlatform: vi.fn().mockReturnValue('windows'),
}));

// Mock dockview-api ref
vi.mock('@/lib/dockview-api', () => ({
  dockviewApiRef: { current: null },
}));

const shellId = 'system-shell';

/** Get the active worktree's state */
function wt() {
  return getActiveWorktree(useWorkspaceStore.getState());
}

function resetStore() {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
}

function fireKey(
  key: string,
  modifiers: Partial<
    Pick<KeyboardEvent, 'ctrlKey' | 'shiftKey' | 'altKey'>
  > = {},
) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    altKey: modifiers.altKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
}

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

function setupHook() {
  return renderHook(() => useGlobalShortcuts());
}

function enterLevel3() {
  useWorkspaceStore.getState().addProject('Test', '/repo');
  useWorkspaceStore.setState({ currentLevel: 3 });
}

// ── Ctrl+T — New shell terminal (level 3 only) ──

describe('Ctrl+T — new terminal', () => {
  it('adds a shell pane at level 3', () => {
    setupHook();
    enterLevel3();
    const before = wt()!.panes.length;
    fireKey('t', { ctrlKey: true });
    expect(wt()!.panes).toHaveLength(before + 1);
  });

  it('does not add pane at level 2', () => {
    setupHook();
    useWorkspaceStore.getState().addProject('Test', '/repo');
    useWorkspaceStore.setState({ currentLevel: 2 });
    const before = wt()!.panes.length;
    fireKey('t', { ctrlKey: true });
    expect(wt()!.panes).toHaveLength(before);
  });
});

// ── Ctrl+W — Close active pane ──

describe('Ctrl+W — close pane', () => {
  it('removes the active pane', () => {
    setupHook();
    useWorkspaceStore.getState().addPane(shellId);
    const before = wt()!.panes.length;
    fireKey('w', { ctrlKey: true });
    expect(wt()!.panes).toHaveLength(before - 1);
  });

  it('does nothing when no panes exist', () => {
    setupHook();
    fireKey('w', { ctrlKey: true });
  });
});

// ── Escape ──

describe('Escape', () => {
  it('closes command palette first', () => {
    setupHook();
    useWorkspaceStore.getState().setShowCommandPalette(true);
    fireKey('Escape');
    expect(useWorkspaceStore.getState().showCommandPalette).toBe(false);
  });

  it('closes worktree dialog', () => {
    setupHook();
    useWorkspaceStore.getState().setShowWorktreeDialog(true);
    fireKey('Escape');
    expect(useWorkspaceStore.getState().showWorktreeDialog).toBe(false);
  });

  it('goes to dashboard from level 3', () => {
    setupHook();
    enterLevel3();
    expect(useWorkspaceStore.getState().currentLevel).toBe(3);
    fireKey('Escape');
    expect(useWorkspaceStore.getState().currentLevel).toBe(2);
  });

  it('goes to folder browser from level 2', () => {
    setupHook();
    useWorkspaceStore.getState().addProject('Test', '/repo');
    useWorkspaceStore.setState({ currentLevel: 2 });
    fireKey('Escape');
    expect(useWorkspaceStore.getState().currentLevel).toBe(1);
  });

  it('closes project browser overlay', () => {
    setupHook();
    useWorkspaceStore.getState().setShowProjectBrowser(true);
    fireKey('Escape');
    expect(useWorkspaceStore.getState().showProjectBrowser).toBe(false);
  });
});

// ── Ctrl+Shift+P — Command palette ──

describe('Ctrl+Shift+P — command palette', () => {
  it('toggles command palette on', () => {
    setupHook();
    fireKey('P', { ctrlKey: true, shiftKey: true });
    expect(useWorkspaceStore.getState().showCommandPalette).toBe(true);
  });

  it('toggles command palette off', () => {
    setupHook();
    useWorkspaceStore.getState().setShowCommandPalette(true);
    fireKey('P', { ctrlKey: true, shiftKey: true });
    expect(useWorkspaceStore.getState().showCommandPalette).toBe(false);
  });
});

// ── Ctrl+K — Project browser ──

describe('Ctrl+K — project browser', () => {
  it('toggles project browser', () => {
    setupHook();
    fireKey('k', { ctrlKey: true });
    expect(useWorkspaceStore.getState().showProjectBrowser).toBe(true);
    fireKey('k', { ctrlKey: true });
    expect(useWorkspaceStore.getState().showProjectBrowser).toBe(false);
  });
});

// ── Ctrl+N — open worktree dialog (level 3) ──

describe('Ctrl+N — worktree dialog', () => {
  it('opens worktree dialog at level 3', () => {
    setupHook();
    enterLevel3();
    fireKey('n', { ctrlKey: true });
    expect(useWorkspaceStore.getState().showWorktreeDialog).toBe(true);
  });
});

// ── Pane focus navigation ──

describe('Ctrl+Tab / Ctrl+Shift+Tab — focus cycling', () => {
  it('Ctrl+Tab focuses next pane', () => {
    setupHook();
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(shellId);
    const panes = wt()!.panes;
    expect(wt()!.activePaneId).toBe(panes[1]!.id);

    fireKey('Tab', { ctrlKey: true });
    expect(wt()!.activePaneId).toBe(panes[0]!.id);
  });

  it('Ctrl+Shift+Tab focuses previous pane', () => {
    setupHook();
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(shellId);
    const panes = wt()!.panes;
    useWorkspaceStore.getState().setActivePaneId(panes[0]!.id);

    fireKey('Tab', { ctrlKey: true, shiftKey: true });
    expect(wt()!.activePaneId).toBe(panes[1]!.id);
  });
});

// ── Alt+N — Focus by index ──

describe('Alt+1–9 — focus by index', () => {
  it('Alt+1 focuses first pane', () => {
    setupHook();
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(shellId);
    addPane(shellId);
    const panes = wt()!.panes;

    fireKey('1', { altKey: true });
    expect(wt()!.activePaneId).toBe(panes[0]!.id);
  });

  it('Alt+2 focuses second pane', () => {
    setupHook();
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(shellId);
    const panes = wt()!.panes;

    fireKey('2', { altKey: true });
    expect(wt()!.activePaneId).toBe(panes[1]!.id);
  });
});

// ── Ctrl+Enter — Maximize (level 3) ──

describe('Ctrl+Enter — maximize toggle', () => {
  it('toggles maximize on active pane at level 3', () => {
    setupHook();
    useWorkspaceStore.getState().addProject('Test', '/repo');
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.setState({ currentLevel: 3 });
    const paneId = wt()!.activePaneId;

    fireKey('Enter', { ctrlKey: true });
    expect(wt()!.maximizedPaneId).toBe(paneId);
  });

  it('does nothing when no active pane', () => {
    setupHook();
    fireKey('Enter', { ctrlKey: true });
    // No worktree, should not crash
  });
});

// ── Cleanup ──

describe('hook cleanup', () => {
  it('removes event listener on unmount', () => {
    const { unmount } = setupHook();
    useWorkspaceStore.getState().addProject('Test', '/repo');
    useWorkspaceStore.setState({ currentLevel: 3 });
    unmount();
    const countBefore = wt()!.panes.length;
    fireKey('t', { ctrlKey: true });
    expect(wt()!.panes).toHaveLength(countBefore);
  });
});
