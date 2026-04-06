import { useWorkspaceStore } from "@/store/workspace-store";
import { GRID_PRESETS } from "@/lib/grid-presets";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { profiles, addPane, applyPreset } = useWorkspaceStore();

  return (
    <aside className="w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0 select-none overflow-y-auto">
      {/* Profiles section */}
      <div className="p-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
          Add Terminal
        </h2>
        <div className="flex flex-col gap-1">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => addPane(profile.id)}
              className={cn(
                "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left",
                "text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
                "transition-colors"
              )}
            >
              {profile.color && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: profile.color }}
                />
              )}
              <span className="truncate">{profile.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mx-3 border-t border-zinc-800" />

      {/* Layout presets */}
      <div className="p-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
          Quick Layouts
        </h2>
        <div className="flex flex-col gap-1">
          {GRID_PRESETS.slice(0, 6).map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset.name, "system-shell")}
              className={cn(
                "flex items-center justify-between px-2.5 py-1.5 rounded-md",
                "text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                "transition-colors"
              )}
            >
              <span>{preset.name}</span>
              <span className="text-xs text-zinc-600">{preset.layouts.length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto p-3 border-t border-zinc-800">
        <p className="text-[10px] text-zinc-600 text-center">
          Agent Grid v0.1.0
        </p>
      </div>
    </aside>
  );
}
