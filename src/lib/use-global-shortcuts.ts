import { useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * Global keyboard shortcuts for pane management.
 *
 * Ctrl+T           — New shell terminal
 * Ctrl+W           — Close active pane (when no selection in terminal)
 * Ctrl+K           — Toggle project browser (command palette)
 * Ctrl+Tab / Ctrl+] — Focus next pane
 * Ctrl+Shift+Tab / Ctrl+[ — Focus previous pane
 * Alt+1–9          — Focus pane by index
 * Ctrl+Enter       — Maximize/restore active pane
 * Ctrl+Shift+P     — Toggle command palette
 * Escape           — Exit maximized mode, close palette, or close project browser
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const store = useWorkspaceStore.getState();

      // Escape — close command palette, exit maximize, or close project browser
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (store.showCommandPalette) {
          e.preventDefault();
          store.setShowCommandPalette(false);
          return;
        }
        if (store.maximizedPaneId) {
          e.preventDefault();
          store.toggleMaximize(store.maximizedPaneId);
          return;
        }
        if (store.showProjectBrowser) {
          e.preventDefault();
          store.setShowProjectBrowser(false);
          return;
        }
      }

      // Ctrl+Shift+P — Toggle command palette
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === 'P') {
        e.preventDefault();
        store.setShowCommandPalette(!store.showCommandPalette);
        return;
      }

      // Ctrl+T — New shell terminal
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 't') {
        e.preventDefault();
        store.addPane('system-shell', 'right');
        return;
      }

      // Ctrl+W — Close active pane
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'w') {
        // Only intercept if we have panes
        if (store.workspace.panes.length > 0 && store.activePaneId) {
          e.preventDefault();
          store.removePane(store.activePaneId);
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

      // Alt+1–9 — Focus pane by index
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

      // Ctrl+Enter or Ctrl+Shift+Enter — Maximize/restore active pane
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (store.activePaneId) {
          store.toggleMaximize(store.activePaneId);
        }
        return;
      }
    }

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
}
