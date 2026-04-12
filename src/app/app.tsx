import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';
import { Titlebar } from '@/components/titlebar';
import { WorktreeTabStrip } from '@/components/tab-strip';
import { BreadcrumbBar } from '@/components/breadcrumb-bar';
import { TerminalGrid } from '@/features/terminals/terminal-grid';
import { FolderBrowser } from '@/features/projects/folder-browser';
import { DashboardGrid } from '@/features/dashboard/dashboard-grid';
import { CommandPalette } from '@/features/command-palette/command-palette';
import { WorktreeDialog } from '@/features/worktrees/worktree-dialog';
import { useGlobalShortcuts } from '@/lib/use-global-shortcuts';
import { useWorkspaceStore } from '@/store/workspace-store';

export function App() {
  useGlobalShortcuts();

  const currentLevel = useWorkspaceStore((s) => s.currentLevel);
  const showCommandPalette = useWorkspaceStore((s) => s.showCommandPalette);
  const setShowCommandPalette = useWorkspaceStore(
    (s) => s.setShowCommandPalette,
  );
  const showWorktreeDialog = useWorkspaceStore((s) => s.showWorktreeDialog);
  const setShowWorktreeDialog = useWorkspaceStore(
    (s) => s.setShowWorktreeDialog,
  );

  useEffect(() => {
    const store = useWorkspaceStore.getState();
    void store.initProjectsPath();
    store.restoreLayout();
  }, []);

  return (
    <ErrorBoundary>
      <div className="mesh-bg flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
        <Titlebar />
        {currentLevel === 3 && (
          <>
            <BreadcrumbBar />
            <WorktreeTabStrip />
          </>
        )}
        <main className="relative flex min-h-0 flex-1 flex-col">
          {currentLevel === 1 && <FolderBrowser />}
          {currentLevel === 2 && <DashboardGrid />}
          {currentLevel === 3 && <TerminalGrid />}
          <AnimatePresence>
            {showCommandPalette && (
              <CommandPalette onClose={() => setShowCommandPalette(false)} />
            )}
            {showWorktreeDialog && (
              <WorktreeDialog onClose={() => setShowWorktreeDialog(false)} />
            )}
          </AnimatePresence>
        </main>
      </div>
    </ErrorBoundary>
  );
}
