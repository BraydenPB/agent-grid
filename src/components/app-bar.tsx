import { useWorkspaceStore } from '@/store/workspace-store';

export function AppBar() {
  const { workspace } = useWorkspaceStore();

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
        <span className="text-xs text-zinc-400">{workspace.name}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">
          {workspace.panes.length}{' '}
          {workspace.panes.length === 1 ? 'pane' : 'panes'}
        </span>
      </div>
    </header>
  );
}
