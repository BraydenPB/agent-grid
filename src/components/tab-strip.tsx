import { useRef, useEffect, useState, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace-store';
import { usePaneStatusStore, STATUS_COLORS } from '@/store/pane-status-store';
import { cn } from '@/lib/utils';
import type { WorkspaceTab } from '@/types';

function WorkspaceTabItem({ ws }: { ws: WorkspaceTab }) {
  const isActive = useWorkspaceStore((s) => s.activeWorkspaceId === ws.id);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);
  const renameWorkspaceTab = useWorkspaceStore((s) => s.renameWorkspaceTab);
  const workspaceCount = useWorkspaceStore((s) => s.workspaces.length);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(ws.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);

  // Aggregate pane status — show worst status across all panes
  const worstStatus = usePaneStatusStore((s) => {
    const statusPriority = {
      error: 4,
      attention: 3,
      done: 2,
      idle: 1,
      working: 0,
    };
    let worst: keyof typeof statusPriority = 'working';
    for (const pane of ws.panes) {
      const status = s.statuses[pane.id] ?? 'working';
      if (statusPriority[status] > statusPriority[worst]) worst = status;
    }
    return worst;
  });

  const statusColor = STATUS_COLORS[worstStatus];
  const showStatus = worstStatus !== 'working' && statusColor !== 'transparent';

  const accentColor = ws.color || '#3b82f6';
  const cwdLabel = ws.cwd?.split(/[\\/]/).pop() || '';

  useEffect(() => {
    if (isActive && tabRef.current) {
      tabRef.current.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [isActive]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== ws.name) {
      renameWorkspaceTab(ws.id, trimmed);
    } else {
      setEditName(ws.name);
    }
    setEditing(false);
  }, [editName, ws.id, ws.name, renameWorkspaceTab]);

  return (
    <button
      ref={tabRef}
      onClick={() => setActiveWorkspace(ws.id)}
      onDoubleClick={() => {
        setEditName(ws.name);
        setEditing(true);
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          if (
            ws.panes.length === 0 ||
            window.confirm(
              `Close "${ws.name}" with ${ws.panes.length} terminal${ws.panes.length !== 1 ? 's' : ''}?`,
            )
          ) {
            removeWorkspace(ws.id);
          }
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
      title={`${ws.name}${cwdLabel ? ` — ${ws.cwd}` : ''} (${ws.panes.length} pane${ws.panes.length !== 1 ? 's' : ''})`}
    >
      {/* Active indicator — colored top border */}
      {isActive && (
        <span
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{ backgroundColor: accentColor }}
        />
      )}

      {/* Status dot */}
      {showStatus && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
      )}

      {/* Workspace name (editable) */}
      {editing ? (
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setEditName(ws.name);
              setEditing(false);
            }
          }}
          className="w-[80px] border-none bg-transparent text-[11px] font-medium text-zinc-200 outline-none"
          spellCheck={false}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="max-w-[100px] truncate text-[11px] leading-none font-medium">
          {ws.name}
        </span>
      )}

      {/* Pane count badge */}
      {ws.panes.length > 0 && (
        <span
          className={cn(
            'rounded-full px-1.5 text-[9px] leading-none font-medium tabular-nums',
            isActive
              ? 'bg-white/[0.08] text-zinc-400'
              : 'bg-white/[0.04] text-zinc-600',
          )}
        >
          {ws.panes.length}
        </span>
      )}

      {/* Close button */}
      {workspaceCount > 1 && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            if (
              ws.panes.length === 0 ||
              window.confirm(
                `Close "${ws.name}" with ${ws.panes.length} terminal${ws.panes.length !== 1 ? 's' : ''}?`,
              )
            ) {
              removeWorkspace(ws.id);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              removeWorkspace(ws.id);
            }
          }}
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm',
            'transition-all duration-100',
            isActive
              ? 'text-zinc-600 hover:bg-white/[0.08] hover:text-zinc-300'
              : 'text-zinc-700 opacity-0 group-hover/tab:opacity-100 hover:bg-white/[0.06] hover:text-zinc-400',
          )}
        >
          <X size={10} strokeWidth={2} />
        </span>
      )}
    </button>
  );
}

export function TabStrip() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);

  if (workspaces.length === 0) return null;

  return (
    <div
      className={cn(
        'flex h-8 shrink-0 items-stretch',
        'border-b border-white/[0.04] bg-zinc-950/80',
        'overflow-x-auto select-none',
      )}
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {workspaces.map((ws) => (
        <WorkspaceTabItem key={ws.id} ws={ws} />
      ))}

      {/* Add workspace button */}
      <button
        onClick={() => addWorkspace('Workspace')}
        className={cn(
          'flex h-full shrink-0 items-center px-2.5',
          'text-zinc-700 transition-colors duration-100',
          'hover:bg-white/[0.03] hover:text-zinc-400',
        )}
        title="New workspace (Ctrl+N)"
      >
        <Plus size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
