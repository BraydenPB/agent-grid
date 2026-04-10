import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';
import { Titlebar } from '@/components/titlebar';
import { TabStrip } from '@/components/tab-strip';
import { TerminalGrid } from '@/features/terminals/terminal-grid';
import { CommandPalette } from '@/features/command-palette/command-palette';
import { useGlobalShortcuts } from '@/lib/use-global-shortcuts';
import { useWorkspaceStore } from '@/store/workspace-store';

export function App() {
  useGlobalShortcuts();

  const showCommandPalette = useWorkspaceStore((s) => s.showCommandPalette);
  const setShowCommandPalette = useWorkspaceStore(
    (s) => s.setShowCommandPalette,
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
        <TabStrip />
        <main className="relative flex min-h-0 flex-1 flex-col">
          <TerminalGrid />
          <AnimatePresence>
            {showCommandPalette && (
              <CommandPalette onClose={() => setShowCommandPalette(false)} />
            )}
          </AnimatePresence>
        </main>
      </div>
    </ErrorBoundary>
  );
}
