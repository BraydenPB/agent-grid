import { useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspace-store';

/**
 * Global keyboard shortcuts.
 *
 * Ctrl+T           — New shell terminal (in layer 2: add to expanded project)
 * Ctrl+N           — New project (workspace)
 * Ctrl+W           — Close active pane
 * Ctrl+K           — Toggle project browser
 * Ctrl+Tab / Ctrl+] — Focus next pane
 * Ctrl+Shift+Tab / Ctrl+[ — Focus previous pane
 * Ctrl+PgDown      — Next project in grid
 * Ctrl+PgUp        — Previous project in grid
 * Alt+1-9          — Focus pane by index
 * Ctrl+Enter       — Expand project (layer 1→2) or collapse (layer 2→1)
 * Ctrl+Shift+P     — Toggle command palette
 * Escape           — Collapse from layer 2, close palette, close project browser
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const store = useWorkspaceStore.getState();
      const isExpanded = store.expandedWorkspaceId !== null;
      const ws = store.workspaces.find((w) => w.id === store.activeWorkspaceId);

      // Ctrl+Shift+Delete — Reset layout (clear localStorage and reload)
      if (e.ctrlKey && e.shiftKey && e.key === 'Delete') {
        e.preventDefault();
        localStorage.removeItem('agent-grid:layout');
        localStorage.removeItem('agent-grid:named-layouts');
        window.location.reload();
        return;
      }

      // Escape — collapse from layer 2, close command palette, or close project browser
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (store.showCommandPalette) {
          e.preventDefault();
          store.setShowCommandPalette(false);
          return;
        }
        if (isExpanded) {
          // In layer 2: first exit maximize, then collapse
          const expandedWs = store.workspaces.find(
            (w) => w.id === store.expandedWorkspaceId,
          );
          if (expandedWs?.maximizedPaneId) {
            e.preventDefault();
            store.toggleMaximize(expandedWs.maximizedPaneId);
            return;
          }
          e.preventDefault();
          store.collapseWorkspace();
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
        if (isExpanded) {
          // In layer 2: add terminal to expanded project
          store.addPane('system-shell', 'right');
        } else {
          // In layer 1: create new project
          store.addWorkspace('Project');
        }
        return;
      }

      // Ctrl+N — New project
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'n') {
        e.preventDefault();
        store.addWorkspace('Project');
        return;
      }

      // Ctrl+W — Close active pane
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'w') {
        if (isExpanded) {
          const expandedWs = store.workspaces.find(
            (w) => w.id === store.expandedWorkspaceId,
          );
          if (
            expandedWs &&
            expandedWs.panes.length > 0 &&
            expandedWs.activePaneId
          ) {
            e.preventDefault();
            // If closing the last pane, collapse back to grid
            if (expandedWs.panes.length === 1) {
              store.removePane(expandedWs.activePaneId);
              store.collapseWorkspace();
            } else {
              store.removePane(expandedWs.activePaneId);
            }
            return;
          }
        } else if (ws && ws.panes.length > 0 && ws.activePaneId) {
          e.preventDefault();
          store.removeWorkspace(ws.id);
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
        if (isExpanded) {
          store.focusNextPane();
        } else {
          store.nextWorkspace();
        }
        return;
      }

      // Ctrl+Shift+Tab or Ctrl+[ — Focus previous pane
      if (
        e.ctrlKey &&
        ((e.shiftKey && e.key === 'Tab') || (!e.shiftKey && e.key === '['))
      ) {
        e.preventDefault();
        if (isExpanded) {
          store.focusPrevPane();
        } else {
          store.prevWorkspace();
        }
        return;
      }

      // Ctrl+PgDown — Next project in grid
      if (e.ctrlKey && !e.shiftKey && e.key === 'PageDown') {
        e.preventDefault();
        store.nextWorkspace();
        return;
      }

      // Ctrl+PgUp — Previous project in grid
      if (e.ctrlKey && !e.shiftKey && e.key === 'PageUp') {
        e.preventDefault();
        store.prevWorkspace();
        return;
      }

      // Alt+1-9 — Focus pane by index (in layer 2) or project by index (layer 1)
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          if (isExpanded) {
            store.focusPaneByIndex(num - 1);
          } else {
            const targetWs = store.workspaces[num - 1];
            if (targetWs) store.setActiveWorkspace(targetWs.id);
          }
          return;
        }
      }

      // Ctrl+Alt+Arrow — Directional pane navigation (layer 2 only)
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

      // Ctrl+Enter — Expand project (layer 1→2) or collapse (layer 2→1)
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (isExpanded) {
          store.collapseWorkspace();
        } else if (store.activeWorkspaceId) {
          store.expandWorkspace(store.activeWorkspaceId);
        }
        return;
      }
    }

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
}
