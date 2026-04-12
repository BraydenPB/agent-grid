import { useRef, useEffect, useState, useCallback } from 'react';
import { GitBranch, Plus, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  useWorkspaceStore,
  getProjectWorktreeList,
  getActiveWorktreeId,
  getActiveProject,
} from '@/store/workspace-store';
import { usePaneStatusStore, STATUS_COLORS } from '@/store/pane-status-store';
import { cn } from '@/lib/utils';
import type { WorktreeTab } from '@/types';

function WorktreeTabItem({ wt }: { wt: WorktreeTab }) {
  const isActive = useWorkspaceStore((s) => getActiveWorktreeId(s) === wt.id);
  const setActiveWorktree = useWorkspaceStore((s) => s.setActiveWorktree);
  const removeWorktreeTab = useWorkspaceStore((s) => s.removeWorktreeTab);
  const renameWorktreeTab = useWorkspaceStore((s) => s.renameWorktreeTab);
  const worktreeCount = useWorkspaceStore((s) => {
    const project = getActiveProject(s);
    return project?.worktreeIds.length ?? 0;
  });

  const isMainBranch = wt.branch === 'main' || wt.branch === 'master';

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(wt.name);
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
    for (const pane of wt.panes) {
      const status = s.statuses[pane.id] ?? 'working';
      if (statusPriority[status] > statusPriority[worst]) worst = status;
    }
    return worst;
  });

  const statusColor = STATUS_COLORS[worstStatus];
  const showStatus = worstStatus !== 'working' && statusColor !== 'transparent';

  const accentColor = '#3b82f6';
  const cwdLabel = wt.cwd?.split(/[\\/]/).pop() || '';

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
    if (trimmed && trimmed !== wt.name) {
      renameWorktreeTab(wt.id, trimmed);
    } else {
      setEditName(wt.name);
    }
    setEditing(false);
  }, [editName, wt.id, wt.name, renameWorktreeTab]);

  return (
    <button
      ref={tabRef}
      onClick={() => setActiveWorktree(wt.id)}
      onDoubleClick={() => {
        setEditName(wt.name);
        setEditing(true);
      }}
      onAuxClick={(e) => {
        if (e.button === 1 && !isMainBranch) {
          e.preventDefault();
          if (
            wt.panes.length === 0 ||
            window.confirm(
              `Close "${wt.name}" with ${wt.panes.length} terminal${wt.panes.length !== 1 ? 's' : ''}?`,
            )
          ) {
            removeWorktreeTab(wt.id);
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
      title={`${wt.name}${cwdLabel ? ` — ${wt.cwd}` : ''} (${wt.panes.length} pane${wt.panes.length !== 1 ? 's' : ''})`}
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

      {/* Branch icon */}
      <GitBranch size={10} strokeWidth={2} className="shrink-0 text-zinc-600" />

      {/* Worktree name (editable) */}
      {editing ? (
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setEditName(wt.name);
              setEditing(false);
            }
          }}
          className="w-[80px] border-none bg-transparent text-[11px] font-medium text-zinc-200 outline-none"
          spellCheck={false}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="max-w-[100px] truncate text-[11px] leading-none font-medium">
          {wt.name}
        </span>
      )}

      {/* Pane count badge */}
      {wt.panes.length > 0 && (
        <span
          className={cn(
            'rounded-full px-1.5 text-[9px] leading-none font-medium tabular-nums',
            isActive
              ? 'bg-white/[0.08] text-zinc-400'
              : 'bg-white/[0.04] text-zinc-600',
          )}
        >
          {wt.panes.length}
        </span>
      )}

      {/* Close button — hidden for main branch */}
      {worktreeCount > 1 && !isMainBranch && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            if (
              wt.panes.length === 0 ||
              window.confirm(
                `Close "${wt.name}" with ${wt.panes.length} terminal${wt.panes.length !== 1 ? 's' : ''}?`,
              )
            ) {
              removeWorktreeTab(wt.id);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              removeWorktreeTab(wt.id);
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

export function WorktreeTabStrip() {
  const worktrees = useWorkspaceStore(useShallow(getProjectWorktreeList));
  const setShowWorktreeDialog = useWorkspaceStore(
    (s) => s.setShowWorktreeDialog,
  );

  if (worktrees.length === 0) return null;

  return (
    <div
      className={cn(
        'flex h-8 shrink-0 items-stretch',
        'border-b border-white/[0.04] bg-zinc-950/80',
        'overflow-x-auto select-none',
      )}
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {worktrees.map((wt) => (
        <WorktreeTabItem key={wt.id} wt={wt} />
      ))}

      {/* Add worktree button */}
      <button
        onClick={() => setShowWorktreeDialog(true)}
        className={cn(
          'flex h-full shrink-0 items-center px-2.5',
          'text-zinc-700 transition-colors duration-100',
          'hover:bg-white/[0.03] hover:text-zinc-400',
        )}
        title="New worktree"
      >
        <Plus size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
