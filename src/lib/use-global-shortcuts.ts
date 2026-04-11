import { useEffect } from 'react';
import { useWorkspaceStore, getActiveWorkspace } from '@/store/workspace-store';

/**
 * Global keyboard shortcuts.
 *
 * Ctrl+T           — New shell terminal
 * Ctrl+N           — New workspace tab
 * Ctrl+W           — Close active pane
 * Ctrl+K           — Toggle project browser
 * Ctrl+Tab / Ctrl+] — Focus next pane
 * Ctrl+Shift+Tab / Ctrl+[ — Focus previous pane
 * Ctrl+PgDown      — Next workspace tab
 * Ctrl+PgUp        — Previous workspace tab
 * Alt+1-9          — Focus pane by index
 * Ctrl+Enter       — Maximize/restore active pane
 * Ctrl+Shift+P     — Toggle command palette
 * Escape           — Exit maximized mode, close palette, close project browser
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const store = useWorkspaceStore.getState();
      const ws = getActiveWorkspace(store);

      // Ctrl+Shift+Delete — Reset layout (clear localStorage and reload)
      if (e.ctrlKey && e.shiftKey && e.key === 'Delete') {
        e.preventDefault();
        localStorage.removeItem('agent-grid:layout');
        localStorage.removeItem('agent-grid:named-layouts');
        window.location.reload();
        return;
      }

      // Escape — close command palette, exit maximize, or close project browser
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (store.showCommandPalette) {
          e.preventDefault();
          store.setShowCommandPalette(false);
          return;
        }
        if (store.level3PaneId) {
          e.preventDefault();
          store.exitLevel3();
          return;
        }
        if (store.expandedPaneId) {
          e.preventDefault();
          store.collapsePane();
          return;
        }
        if (store.showProjectBrowser) {
          e.preventDefault();
          store.setShowProjectBrowser(false);
          return;
        }
        if (store.currentLevel >= 2) {
          e.preventDefault();
          store.goToLevel1();
          return;
        }
      }

      // Ctrl+Shift+P — Toggle command palette
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === 'P') {
        e.preventDefault();
        store.setShowCommandPalette(!store.showCommandPalette);
        return;
      }

      // Ctrl+T — New shell terminal (in active workspace)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 't') {
        e.preventDefault();
        store.addPane('system-shell', 'right');
        return;
      }

      // Ctrl+N — New workspace tab
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'n') {
        e.preventDefault();
        store.addWorkspace('Workspace');
        return;
      }

      // Ctrl+W — Close active pane
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'w') {
        if (ws && ws.panes.length > 0 && ws.activePaneId) {
          e.preventDefault();
          store.removePane(ws.activePaneId);
          return;
        }
      }

      // Ctrl+K — Open project browser overlay
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'k') {
        e.preventDefault();
        store.setShowProjectBrowser(!store.showProjectBrowser);
        return;
      }

      // Ctrl+Tab or Ctrl+] — Focus next pane
      if (e.ctrlKey && !e.shiftKey && (e.key === 'Tab' || e.key === ']')) {
        e.preventDefault();
        store.focusNextPane();
        return;
      }

      // Ctrl+Shift+Tab or Ctrl+[ — Focus previous pane
      if (
        e.ctrlKey &&
        ((e.shiftKey && e.key === 'Tab') || (!e.shiftKey && e.key === '['))
      ) {
        e.preventDefault();
        store.focusPrevPane();
        return;
      }

      // Ctrl+PgDown — Next workspace tab
      if (e.ctrlKey && !e.shiftKey && e.key === 'PageDown') {
        e.preventDefault();
        store.nextWorkspace();
        return;
      }

      // Ctrl+PgUp — Previous workspace tab
      if (e.ctrlKey && !e.shiftKey && e.key === 'PageUp') {
        e.preventDefault();
        store.prevWorkspace();
        return;
      }

      // Alt+1-9 — Focus pane by index
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          store.focusPaneByIndex(num - 1);
          return;
        }
      }

      // Ctrl+Alt+Arrow — Directional pane navigation
      if (
        e.ctrlKey &&
        e.altKey &&
        !e.shiftKey &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        e.preventDefault();
        const dirMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
          ArrowUp: 'up',
          ArrowDown: 'down',
          ArrowLeft: 'left',
          ArrowRight: 'right',
        };
        const dir = dirMap[e.key];
        if (dir) store.focusDirection(dir);
        return;
      }

      // Ctrl+Enter — Maximize/restore active pane
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (ws?.activePaneId) {
          store.toggleMaximize(ws.activePaneId);
        }
        return;
      }
    }

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
}
