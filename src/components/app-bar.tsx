import { useWorkspaceStore } from "@/store/workspace-store";

export function AppBar() {
  const { workspace } = useWorkspaceStore();

  return (
    <header className="h-11 flex items-center justify-between px-4 bg-zinc-900 border-b border-zinc-800 select-none shrink-0"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-zinc-100 tracking-tight">Agent Grid</span>
        <span className="text-xs text-zinc-500">|</span>
        <span className="text-xs text-zinc-400">{workspace.name}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">
          {workspace.panes.length} {workspace.panes.length === 1 ? "pane" : "panes"}
        </span>
      </div>
    </header>
  );
}
