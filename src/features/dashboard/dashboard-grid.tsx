import { useMemo } from 'react';
import { X, GitBranch, Maximize2, FolderOpen, Settings } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspaceStore, getOpenProjects } from '@/store/workspace-store';
import { usePaneStatusStore, STATUS_COLORS } from '@/store/pane-status-store';
import {
  findBuiltinByName,
  leafCount,
  leaf,
  row,
  col,
  TileTree,
  type LayoutNode,
} from '@/features/layouts';
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
 * Auto-tile fallback — generates a balanced tree when no preset is active
 * or when the active preset's leaf count doesn't match the tile count.
 *
 * Mirrors the old auto-tile table: 1/2/3 cols for small counts, 2×2 at 4,
 * 3 cols at 5-6, 4 cols at 7-8, 3-col auto-fit for 9+.
 */
function autoTileTree(count: number): LayoutNode {
  if (count <= 1) return leaf();
  if (count === 2) return row(leaf(), leaf());
  if (count === 3) return row(leaf(), leaf(), leaf());
  if (count === 4) return col(row(leaf(), leaf()), row(leaf(), leaf()));
  if (count <= 6) {
    const top = row(leaf(), leaf(), leaf());
    const bottomLeaves = Array.from({ length: count - 3 }, () => leaf());
    while (bottomLeaves.length < 3) bottomLeaves.push(leaf());
    return col(top, row(...bottomLeaves));
  }
  if (count <= 8) {
    const top = row(leaf(), leaf(), leaf(), leaf());
    const bottomLeaves = Array.from({ length: count - 4 }, () => leaf());
    while (bottomLeaves.length < 4) bottomLeaves.push(leaf());
    return col(top, row(...bottomLeaves));
  }
  // 9+: three columns, ceil(count/3) rows — distribute left-to-right
  const cols = 3;
  const rows = Math.ceil(count / cols);
  const rowNodes: LayoutNode[] = [];
  for (let r = 0; r < rows; r++) {
    const children: LayoutNode[] = [];
    for (let c = 0; c < cols; c++) children.push(leaf());
    rowNodes.push(row(...children));
  }
  return col(...rowNodes);
}

/**
 * Resolve the effective dashboard layout tree. Returns the active preset's
 * tree when its leaf count matches exactly; otherwise the auto-tile tree.
 */
function resolveDashboardTree(
  tileCount: number,
  activePresetName: string | null,
): LayoutNode {
  if (activePresetName) {
    const preset = findBuiltinByName(activePresetName);
    if (preset && leafCount(preset.tree) === tileCount) {
      return preset.tree;
    }
  }
  return autoTileTree(Math.max(tileCount, 1));
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
        'group relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden',
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
              if (!mainPane) return;
              const el = document.querySelector<HTMLElement>(
                `[data-pane-root="${mainPane.id}"]`,
              );
              if (!el) return;
              const rect = el.getBoundingClientRect();
              el.dispatchEvent(
                new MouseEvent('contextmenu', {
                  bubbles: true,
                  cancelable: true,
                  clientX: rect.right - 20,
                  clientY: rect.top + 4,
                  button: 2,
                }),
              );
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"
            title="Settings"
          >
            <Settings size={11} strokeWidth={1.75} />
          </button>
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
            hideHeader
            preferDomRenderer
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
  const openProjects = useWorkspaceStore(useShallow(getOpenProjects));
  const worktrees = useWorkspaceStore((s) => s.worktrees);
  const activeDashboardPreset = useWorkspaceStore(
    (s) => s.activeDashboardPreset,
  );

  // Derive one main pane per open project
  const tiles = useMemo(() => {
    return openProjects.map((project) => {
      const wt = worktrees[project.activeWorktreeId];
      const mainPane =
        wt?.panes.find((p) => p.id === project.mainPaneId) ?? wt?.panes[0];
      return { project, mainPane };
    });
  }, [openProjects, worktrees]);

  const tree = useMemo(
    () => resolveDashboardTree(tiles.length, activeDashboardPreset),
    [tiles.length, activeDashboardPreset],
  );

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
      <div className="relative flex min-h-0 flex-1 p-px">
        <TileTree
          tree={tree}
          tileCount={tiles.length}
          renderLeaf={(i) => {
            const t = tiles[i];
            if (!t) return null;
            return (
              <DashboardTile
                key={t.project.id}
                project={t.project}
                mainPane={t.mainPane}
              />
            );
          }}
          renderEmpty={() => (
            <div className="flex h-full items-center justify-center border border-dashed border-white/[0.06]" />
          )}
        />
      </div>
    </div>
  );
}
