import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorkspaceStore, getActiveWorkspace } from '@/store/workspace-store';
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

/** Get the active workspace's state */
function ws() {
  return getActiveWorkspace(useWorkspaceStore.getState());
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

// ── Ctrl+T — New shell terminal ──

describe('Ctrl+T — new terminal', () => {
  it('adds a shell pane', () => {
    setupHook();
    fireKey('t', { ctrlKey: true });
    const panes = ws()!.panes;
    expect(panes).toHaveLength(1);
    expect(panes[0]!.profileId).toBe(shellId);
  });
});

// ── Ctrl+W — Close active pane ──

describe('Ctrl+W — close pane', () => {
  it('removes the active pane', () => {
    setupHook();
    useWorkspaceStore.getState().addPane(shellId);
    expect(ws()!.panes).toHaveLength(1);

    fireKey('w', { ctrlKey: true });
    expect(ws()!.panes).toHaveLength(0);
  });

  it('does nothing when no panes exist', () => {
    setupHook();
    fireKey('w', { ctrlKey: true });
    // Should not crash — no workspace exists
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

  it('exits level 3 when command palette is closed', () => {
    setupHook();
    useWorkspaceStore.getState().addPane(shellId);
    const paneId = ws()!.panes[0]!.id;
    // Enter level 2 (expandPane)
    useWorkspaceStore.getState().expandPane(paneId);
    // Enter level 3
    useWorkspaceStore.getState().enterLevel3(paneId);
    expect(useWorkspaceStore.getState().level3PaneId).toBe(paneId);

    fireKey('Escape');
    expect(useWorkspaceStore.getState().level3PaneId).toBeNull();
  });

  it('exits level 2 when level 3 is inactive', () => {
    setupHook();
    useWorkspaceStore.getState().addPane(shellId);
    const paneId = ws()!.panes[0]!.id;
    useWorkspaceStore.getState().expandPane(paneId);
    expect(useWorkspaceStore.getState().expandedPaneId).toBe(paneId);

    fireKey('Escape');
    expect(useWorkspaceStore.getState().expandedPaneId).toBeNull();
  });

  it('closes project browser when palette and expansion are inactive', () => {
    setupHook();
    useWorkspaceStore.getState().setShowProjectBrowser(true);
    fireKey('Escape');
    expect(useWorkspaceStore.getState().showProjectBrowser).toBe(false);
  });

  it('does not navigate to Level 1 when at Level 2 with nothing else open', () => {
    setupHook();
    // Ensure we're at Level 2 with a project
    useWorkspaceStore.getState().addPane(shellId);
    expect(useWorkspaceStore.getState().currentLevel).toBe(2);

    fireKey('Escape');
    // Escape should NOT drop back to Level 1 — use breadcrumb for that
    expect(useWorkspaceStore.getState().currentLevel).toBe(2);
  });

  it('does nothing at Level 1', () => {
    setupHook();
    // Go to Level 1
    useWorkspaceStore.getState().addPane(shellId);
    useWorkspaceStore.getState().goToLevel1();
    expect(useWorkspaceStore.getState().currentLevel).toBe(1);

    fireKey('Escape');
    // Should remain at Level 1
    expect(useWorkspaceStore.getState().currentLevel).toBe(1);
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

// ── Pane focus navigation ──

describe('Ctrl+Tab / Ctrl+Shift+Tab — focus cycling', () => {
  it('Ctrl+Tab focuses next pane', () => {
    setupHook();
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(shellId);
    const panes = ws()!.panes;
    // Active is second pane (last added)
    expect(ws()!.activePaneId).toBe(panes[1]!.id);

    fireKey('Tab', { ctrlKey: true });
    expect(ws()!.activePaneId).toBe(panes[0]!.id);
  });

  it('Ctrl+Shift+Tab focuses previous pane', () => {
    setupHook();
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(shellId);
    const panes = ws()!.panes;
    // Set active to first pane
    useWorkspaceStore.getState().setActivePaneId(panes[0]!.id);

    fireKey('Tab', { ctrlKey: true, shiftKey: true });
    expect(ws()!.activePaneId).toBe(panes[1]!.id);
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
    const panes = ws()!.panes;
    // Active is third (last added)

    fireKey('1', { altKey: true });
    expect(ws()!.activePaneId).toBe(panes[0]!.id);
  });

  it('Alt+2 focuses second pane', () => {
    setupHook();
    const { addPane } = useWorkspaceStore.getState();
    addPane(shellId);
    addPane(shellId);
    const panes = ws()!.panes;

    fireKey('2', { altKey: true });
    expect(ws()!.activePaneId).toBe(panes[1]!.id);
  });
});

// ── Ctrl+Enter — Maximize ──

describe('Ctrl+Enter — expand toggle', () => {
  it('expands the active pane', () => {
    setupHook();
    useWorkspaceStore.getState().addPane(shellId);
    const paneId = ws()!.panes[0]!.id;

    fireKey('Enter', { ctrlKey: true });
    expect(useWorkspaceStore.getState().expandedPaneId).toBe(paneId);
  });

  it('does nothing when no active pane', () => {
    setupHook();
    fireKey('Enter', { ctrlKey: true });
    expect(useWorkspaceStore.getState().expandedPaneId).toBeNull();
  });
});

// ── Cleanup ──

describe('hook cleanup', () => {
  it('removes event listener on unmount', () => {
    const { unmount } = setupHook();
    unmount();
    // Fire shortcut after unmount — should have no effect
    useWorkspaceStore.getState().addPane(shellId);
    const countBefore = ws()!.panes.length;
    fireKey('t', { ctrlKey: true });
    // Count shouldn't change because the hook is unmounted
    // (but a new project+workspace was created by the first addPane above)
    expect(ws()!.panes).toHaveLength(countBefore);
  });
});
