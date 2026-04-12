import { useMemo } from 'react';
import { X, GitBranch, Maximize2, FolderOpen } from 'lucide-react';
import { useWorkspaceStore, getOpenProjects } from '@/store/workspace-store';
import { usePaneStatusStore, STATUS_COLORS } from '@/store/pane-status-store';
import { cn } from '@/lib/utils';
import type { Project, Pane, TerminalProfile } from '@/types';
import { TerminalPane } from '@/features/terminals/terminal-pane';

const FALLBACK_PROFILE: TerminalProfile = {
  id: 'system-shell',
  name: 'Shell',
  command: '__SYSTEM_SHELL__',
  args: [],
  color: '#6b7280',
};

/**
 * Given the number of open projects, return Tailwind classes for an auto-tiling grid.
 * - 1: single cell
 * - 2: 2 columns side by side
 * - 3: 3 columns
 * - 4: 2x2 grid
 * - 5-6: 3 columns, 2 rows
 * - 7-8: 4 columns, 2 rows
 * - 9+: 3 columns auto-flow
 */
function gridClassesForCount(count: number): string {
  if (count <= 1) return 'grid-cols-1 grid-rows-1';
  if (count === 2) return 'grid-cols-2 grid-rows-1';
  if (count === 3) return 'grid-cols-3 grid-rows-1';
  if (count === 4) return 'grid-cols-2 grid-rows-2';
  if (count <= 6) return 'grid-cols-3 grid-rows-2';
  if (count <= 8) return 'grid-cols-4 grid-rows-2';
  return 'grid-cols-[repeat(auto-fit,minmax(360px,1fr))]';
}

interface DashboardTileProps {
  project: Project;
  mainPane: Pane | undefined;
}

function DashboardTile({ project, mainPane }: DashboardTileProps) {
  const profiles = useWorkspaceStore((s) => s.profiles);
  const closeProject = useWorkspaceStore((s) => s.closeProject);
  const focusProject = useWorkspaceStore((s) => s.focusProject);
  const focusProjectPane = useWorkspaceStore((s) => s.focusProjectPane);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const isFocusedTile = activeProjectId === project.id;

  const profile =
    profiles.find((p) => p.id === mainPane?.profileId) ??
    profiles[0] ??
    FALLBACK_PROFILE;

  const paneStatus = usePaneStatusStore((s) =>
    mainPane ? (s.statuses[mainPane.id] ?? 'working') : 'working',
  );
  const statusColor = STATUS_COLORS[paneStatus];
  const showStatus = paneStatus !== 'working' && statusColor !== 'transparent';

  return (
    <div
      className={cn(
        'group relative flex min-h-0 min-w-0 flex-col overflow-hidden',
        'border bg-[#0a0a0f]',
        'transition-colors duration-150',
        isFocusedTile
          ? 'border-blue-500/40'
          : 'border-white/[0.06] hover:border-white/[0.10]',
      )}
    >
      {/* Header bar */}
      <div
        className={cn(
          'flex h-7 shrink-0 items-center justify-between px-3',
          'border-b border-white/[0.04] bg-zinc-950/80',
          'select-none',
        )}
        onDoubleClick={() => focusProject(project.id)}
      >
        <div className="flex min-w-0 items-center gap-2">
          {/* Status dot */}
          {showStatus && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: statusColor }}
            />
          )}
          {/* Profile color dot */}
          {!showStatus && profile.color && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: profile.color }}
            />
          )}
          <span className="truncate text-[11px] font-medium text-zinc-300">
            {project.name}
          </span>
          <span className="hidden text-[10px] text-zinc-600 sm:inline">
            {profile.name}
          </span>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              focusProject(project.id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"
            title="Open project (double-click tile)"
          >
            <Maximize2 size={11} strokeWidth={2} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeProject(project.id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"
            title="Close project"
          >
            <X size={11} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <div className="relative min-h-0 flex-1">
        {mainPane ? (
          <TerminalPane
            paneId={mainPane.id}
            profile={profile}
            initialCwd={mainPane.cwd ?? project.path}
            isActive={isFocusedTile}
            onFocus={() => focusProjectPane(project.id, mainPane.id)}
            onClose={() => closeProject(project.id)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <GitBranch size={20} className="text-zinc-700" strokeWidth={1.5} />
          </div>
        )}
      </div>
    </div>
  );
}

export function DashboardGrid() {
  const openProjects = useWorkspaceStore(getOpenProjects);
  const worktrees = useWorkspaceStore((s) => s.worktrees);

  // Derive one main pane per open project
  const tiles = useMemo(() => {
    return openProjects.map((project) => {
      const wt = worktrees[project.activeWorktreeId];
      const mainPane =
        wt?.panes.find((p) => p.id === project.mainPaneId) ?? wt?.panes[0];
      return { project, mainPane };
    });
  }, [openProjects, worktrees]);

  // Empty state
  if (tiles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04]">
            <FolderOpen size={28} className="text-zinc-600" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-medium text-zinc-400">
              No projects open
            </p>
            <p className="text-[11px] text-zinc-600">
              Open a project from the folder browser to see it here
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-zinc-950/40">
      <div
        className={cn(
          'grid min-h-0 flex-1 gap-px bg-white/[0.04] p-px',
          gridClassesForCount(tiles.length),
        )}
      >
        {tiles.map(({ project, mainPane }) => (
          <DashboardTile
            key={project.id}
            project={project}
            mainPane={mainPane}
          />
        ))}
      </div>
    </div>
  );
}
