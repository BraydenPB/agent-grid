import { useWorkspaceStore, getActiveWorkspace } from '@/store/workspace-store';

export function AppBar() {
  const activeWorkspace = useWorkspaceStore(getActiveWorkspace);
  const name = activeWorkspace?.name ?? 'Agent Grid';
  const paneCount = activeWorkspace?.panes.length ?? 0;

  return (
    <header
      className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 select-none"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold tracking-tight text-zinc-100">
          Agent Grid
        </span>
        <span className="text-xs text-zinc-500">|</span>
        <span className="text-xs text-zinc-400">{name}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">
          {paneCount} {paneCount === 1 ? 'pane' : 'panes'}
        </span>
      </div>
    </header>
  );
}
