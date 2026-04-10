import { useRef, useEffect } from 'react';
import { Plus, X, LayoutGrid } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace-store';
import { usePaneStatusStore, STATUS_COLORS } from '@/store/pane-status-store';
import { cn } from '@/lib/utils';
import type { Pane } from '@/types';

function TabItem({ pane, index }: { pane: Pane; index: number }) {
  const isActive = useWorkspaceStore((s) => s.activePaneId === pane.id);
  const setActivePaneId = useWorkspaceStore((s) => s.setActivePaneId);
  const removePane = useWorkspaceStore((s) => s.removePane);
  const profiles = useWorkspaceStore((s) => s.profiles);
  const paneMode = useWorkspaceStore(
    (s) => s.workspace.panes.find((p) => p.id === pane.id)?.mode ?? 'single',
  );

  const profile = profiles.find((p) => p.id === pane.profileId) ?? profiles[0]!;
  const effectiveColor = pane.colorOverride ?? profile.color ?? '#636d83';

  const status = usePaneStatusStore((s) => s.statuses[pane.id] ?? 'working');
  const statusColor = STATUS_COLORS[status];
  const showStatusDot = status !== 'working' && statusColor !== 'transparent';

  const cwdLabel = pane.cwd ? pane.cwd.split(/[\\/]/).pop() : '';

  const tabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isActive && tabRef.current) {
      tabRef.current.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [isActive]);

  return (
    <button
      ref={tabRef}
      onClick={() => setActivePaneId(pane.id)}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          removePane(pane.id);
        }
      }}
      className={cn(
        'group/tab relative flex h-full shrink-0 items-center gap-2 px-3',
        'transition-colors duration-100 select-none',
        'border-r border-white/[0.04]',
        isActive
          ? 'bg-white/[0.06] text-zinc-200'
          : 'bg-transparent text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-400',
      )}
      title={`${profile.name}${cwdLabel ? ` — ${pane.cwd}` : ''} (Pane ${index + 1})`}
    >
      {/* Active indicator — colored top border */}
      {isActive && (
        <span
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{ backgroundColor: effectiveColor }}
        />
      )}

      {/* Pane number */}
      <span
        className={cn(
          'font-mono text-[9px] font-bold',
          isActive ? 'text-zinc-500' : 'text-zinc-700',
        )}
      >
        {index + 1}
      </span>

      {/* Profile color dot with status ring */}
      <span className="relative flex shrink-0 items-center justify-center">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: effectiveColor }}
        />
        {showStatusDot && (
          <span
            className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
        )}
      </span>

      {/* Profile name */}
      <span className="max-w-[80px] truncate text-[11px] leading-none font-medium">
        {profile.name}
      </span>

      {/* Workspace badge */}
      {paneMode === 'workspace' && (
        <LayoutGrid
          size={9}
          className="shrink-0 text-zinc-600"
          strokeWidth={2}
        />
      )}

      {/* CWD folder */}
      {cwdLabel && (
        <span
          className={cn(
            'max-w-[100px] truncate text-[10px] leading-none',
            isActive ? 'text-zinc-500' : 'text-zinc-700',
          )}
        >
          {cwdLabel}
        </span>
      )}

      {/* Close button */}
      <span
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          removePane(pane.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            removePane(pane.id);
          }
        }}
        className={cn(
          'ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-sm',
          'transition-all duration-100',
          isActive
            ? 'text-zinc-600 hover:bg-white/[0.08] hover:text-zinc-300'
            : 'text-zinc-700 opacity-0 group-hover/tab:opacity-100 hover:bg-white/[0.06] hover:text-zinc-400',
        )}
      >
        <X size={10} strokeWidth={2} />
      </span>
    </button>
  );
}

export function TabStrip() {
  const panes = useWorkspaceStore((s) => s.workspace.panes);
  const profiles = useWorkspaceStore((s) => s.profiles);
  const addPane = useWorkspaceStore((s) => s.addPane);

  if (panes.length === 0) return null;

  return (
    <div
      className={cn(
        'flex h-8 shrink-0 items-stretch',
        'border-b border-white/[0.04] bg-zinc-950/80',
        'overflow-x-auto select-none',
      )}
      style={{
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      {/* Tabs */}
      {panes.map((pane, i) => (
        <TabItem key={pane.id} pane={pane} index={i} />
      ))}

      {/* Add tab button */}
      <button
        onClick={() => addPane(profiles[0]!.id)}
        className={cn(
          'flex h-full shrink-0 items-center px-2.5',
          'text-zinc-700 transition-colors duration-100',
          'hover:bg-white/[0.03] hover:text-zinc-400',
        )}
        title="New terminal (Ctrl+T)"
      >
        <Plus size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
