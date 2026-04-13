import { useEffect } from 'react';
import { useWorkspaceStore, getActiveWorktree } from '@/store/workspace-store';
import { zoomTerminalFont, resetTerminalFont } from '@/lib/terminal-registry';

/**
 * Global keyboard shortcuts.
 *
 * Ctrl+T           — New shell terminal
 * Ctrl+N           — Open worktree dialog (level 3)
 * Ctrl+W           — Close active pane
 * Ctrl+K           — Toggle project browser
 * Ctrl+Tab / Ctrl+] — Focus next pane
 * Ctrl+Shift+Tab / Ctrl+[ — Focus previous pane
 * Ctrl+PgDown      — Next worktree tab
 * Ctrl+PgUp        — Previous worktree tab
 * Alt+1-9          — Focus pane by index
 * Ctrl+Enter       — Maximize/restore active pane (level 3), drill into project (level 2)
 * Ctrl+Shift+P     — Toggle command palette
 * Ctrl+= / Ctrl++  — Zoom active terminal in
 * Ctrl+-           — Zoom active terminal out
 * Ctrl+0           — Reset active terminal font size
 * Escape           — Go to dashboard (level 3), go to folder browser (level 2), close overlays
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const store = useWorkspaceStore.getState();
      const wt = getActiveWorktree(store);

      // Ctrl+= / Ctrl++ — Zoom active terminal in
      // Ctrl+-           — Zoom active terminal out
      // Ctrl+0           — Reset active terminal font
      // preventDefault blocks WebView2's default page-zoom accelerator.
      if (e.ctrlKey && !e.altKey && !e.shiftKey && wt?.activePaneId) {
        if (e.key === '=' || e.key === '+') {
          if (zoomTerminalFont(wt.activePaneId, 1)) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        if (e.key === '-') {
          if (zoomTerminalFont(wt.activePaneId, -1)) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        if (e.key === '0') {
          if (resetTerminalFont(wt.activePaneId)) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
      }

      // Ctrl+Shift+Delete — Reset layout (clear localStorage and reload)
      if (e.ctrlKey && e.shiftKey && e.key === 'Delete') {
        e.preventDefault();
        localStorage.removeItem('agent-grid:layout');
        localStorage.removeItem('agent-grid:named-layouts');
        window.location.reload();
        return;
      }

      // Escape — close overlays, navigate back through levels
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (store.showCommandPalette) {
          e.preventDefault();
          store.setShowCommandPalette(false);
          return;
        }
        if (store.showWorktreeDialog) {
          e.preventDefault();
          store.setShowWorktreeDialog(false);
          return;
        }
        if (store.showProjectBrowser) {
          e.preventDefault();
          store.setShowProjectBrowser(false);
          return;
        }
        if (store.currentLevel === 3) {
          e.preventDefault();
          store.goToDashboard();
          return;
        }
        if (store.currentLevel === 2) {
          e.preventDefault();
          store.goToFolderBrowser();
          return;
        }
      }

      // Ctrl+Shift+P — Toggle command palette
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === 'P') {
        e.preventDefault();
        store.setShowCommandPalette(!store.showCommandPalette);
        return;
      }

      // Ctrl+T — New shell terminal (in active worktree, level 3 only)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 't') {
        if (store.currentLevel === 3) {
          e.preventDefault();
          store.addPane('system-shell', 'right');
          return;
        }
      }

      // Ctrl+N — Open worktree dialog (level 3 only)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'n') {
        if (store.currentLevel === 3) {
          e.preventDefault();
          store.setShowWorktreeDialog(true);
          return;
        }
      }

      // Ctrl+W — Close active pane
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'w') {
        if (wt && wt.panes.length > 0 && wt.activePaneId) {
          e.preventDefault();
          store.removePane(wt.activePaneId);
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

      // Ctrl+PgDown — Next worktree tab
      if (e.ctrlKey && !e.shiftKey && e.key === 'PageDown') {
        e.preventDefault();
        store.nextWorktree();
        return;
      }

      // Ctrl+PgUp — Previous worktree tab
      if (e.ctrlKey && !e.shiftKey && e.key === 'PageUp') {
        e.preventDefault();
        store.prevWorktree();
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

      // Ctrl+Enter — Maximize/restore (level 3), focus project (level 2)
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (store.currentLevel === 3 && wt?.activePaneId) {
          store.toggleMaximize(wt.activePaneId);
        }
        return;
      }
    }

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
}
