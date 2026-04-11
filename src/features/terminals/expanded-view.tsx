import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import {
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewApi,
  type IDockviewPanelProps,
} from 'dockview';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Plus,
  GitBranch,
  Terminal as TerminalIcon,
} from 'lucide-react';
import 'dockview/dist/styles/dockview.css';
import { useWorkspaceStore } from '@/store/workspace-store';
import { ProjectBrowser } from '@/features/projects/project-browser';
import { destroyTerminalEntry } from '@/lib/terminal-registry';
import { usePaneStatusStore } from '@/store/pane-status-store';
import { saveLayout } from '@/lib/layout-storage';
import { expandedDockviewApiRef, dockviewApiRef } from '@/lib/dockview-api';
import type { TerminalProfile } from '@/types';
import { cn } from '@/lib/utils';
import { TerminalPane } from './terminal-pane';
import { WorktreeDialog } from './worktree-dialog';

/**
 * Layer 2 — Expanded project view.
 *
 * Full-screen view showing all panes for the expanded workspace/project.
 * Has a header bar with back button, project name, and controls for
 * adding terminals and creating worktrees.
 */

/** Thin wrapper that subscribes to the store for isActive */
function TerminalPaneWrapper({
  paneId,
  profile,
  cwd,
  onClose,
}: {
  paneId: string;
  profile: TerminalProfile;
  cwd?: string;
  onClose: () => void;
}) {
  const isActive = useWorkspaceStore((s) => {
    const wsId = s.expandedWorkspaceId;
    const ws = s.workspaces.find((w) => w.id === wsId);
    return ws?.activePaneId === paneId;
  });
  const setActivePaneId = useWorkspaceStore((s) => s.setActivePaneId);

  return (
    <TerminalPane
      paneId={paneId}
      profile={profile}
      initialCwd={cwd}
      isActive={isActive}
      onFocus={() => setActivePaneId(paneId)}
      onClose={onClose}
    />
  );
}

export function ExpandedView() {
  const workspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.expandedWorkspaceId),
  );
  const profiles = useWorkspaceStore((s) => s.profiles);
  const layoutVersion = useWorkspaceStore((s) => s.layoutVersion);
  const collapseWorkspace = useWorkspaceStore((s) => s.collapseWorkspace);
  const addPane = useWorkspaceStore((s) => s.addPane);
  const showProjectBrowser = useWorkspaceStore((s) => s.showProjectBrowser);
  const setShowProjectBrowser = useWorkspaceStore(
    (s) => s.setShowProjectBrowser,
  );
  const setChangeDirPaneId = useWorkspaceStore((s) => s.setChangeDirPaneId);

  const panes = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === s.expandedWorkspaceId);
    return ws?.panes ?? [];
  });
  const maximizedPaneId = workspace?.maximizedPaneId ?? null;
  const wsName = workspace?.name ?? 'Project';
  const wsColor = workspace?.color ?? '#3b82f6';
  const cwdLabel = workspace?.cwd?.split(/[\\/]/).pop() || '';

  const [showWorktreeDialog, setShowWorktreeDialog] = useState(false);
  const addPaneWithCwd = useWorkspaceStore((s) => s.addPaneWithCwd);
  const projectCwd = workspace?.cwd || panes[0]?.cwd || '';

  const [localDockviewApi, setLocalDockviewApi] = useState<DockviewApi | null>(
    null,
  );
  const previousPanesRef = useRef<string[]>([]);
  const previousLayoutVersionRef = useRef(layoutVersion);
  const programmaticChangeRef = useRef(false);

  // Profile dropdown state
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showProfileMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfileMenu]);

  /* eslint-disable react-hooks/preserve-manual-memoization -- same Dockview init pattern as terminal-grid */
  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      setLocalDockviewApi(event.api);
      expandedDockviewApiRef.current = event.api;
      dockviewApiRef.current = event.api;
      previousPanesRef.current = panes.map((p) => p.id);
      previousLayoutVersionRef.current = layoutVersion;

      // Restore saved layout for this workspace
      if (workspace?.dockviewLayout) {
        try {
          event.api.fromJSON(workspace.dockviewLayout as any);
          return;
        } catch {
          // fall through to manual build
        }
      }

      // Build panels manually
      const addedIds = new Set<string>();
      panes.forEach((pane, index) => {
        const profile =
          profiles.find((p) => p.id === pane.profileId) ?? profiles[0]!;

        const addPanelConfig: any = {
          id: pane.id,
          component: 'terminal',
          title: profile.name,
          params: { paneId: pane.id, profile, cwd: pane.cwd },
        };

        if (
          pane.dockviewPosition?.direction &&
          pane.dockviewPosition.referenceId &&
          addedIds.has(pane.dockviewPosition.referenceId)
        ) {
          addPanelConfig.position = {
            referencePanel: pane.dockviewPosition.referenceId,
            direction: pane.dockviewPosition.direction,
          };
        } else if (index > 0 && addedIds.size > 0) {
          const prev = panes[index - 1];
          if (prev && addedIds.has(prev.id)) {
            addPanelConfig.position = {
              referencePanel: prev.id,
              direction: 'right',
            };
          }
        }

        try {
          event.api.addPanel(addPanelConfig);
          addedIds.add(pane.id);
        } catch {
          try {
            delete addPanelConfig.position;
            event.api.addPanel(addPanelConfig);
            addedIds.add(pane.id);
          } catch {
            /* skip */
          }
        }
      });
    },
    [panes, profiles, layoutVersion, workspace?.dockviewLayout],
  );
  /* eslint-enable react-hooks/preserve-manual-memoization */

  // Detect layout version change — full rebuild
  useEffect(() => {
    const api = localDockviewApi;
    if (!api) return;

    if (layoutVersion !== previousLayoutVersionRef.current) {
      previousLayoutVersionRef.current = layoutVersion;
      programmaticChangeRef.current = true;

      try {
        api.clear();
      } catch {
        /* ignore */
      }

      const reAddedIds = new Set<string>();
      panes.forEach((pane, index) => {
        const profile =
          profiles.find((p) => p.id === pane.profileId) ?? profiles[0]!;

        const addPanelConfig: any = {
          id: pane.id,
          component: 'terminal',
          title: profile.name,
          params: { paneId: pane.id, profile, cwd: pane.cwd },
        };

        if (
          pane.dockviewPosition?.direction &&
          pane.dockviewPosition.referenceId &&
          reAddedIds.has(pane.dockviewPosition.referenceId)
        ) {
          addPanelConfig.position = {
            referencePanel: pane.dockviewPosition.referenceId,
            direction: pane.dockviewPosition.direction,
          };
        } else if (index > 0) {
          const prev = panes[index - 1];
          if (prev && reAddedIds.has(prev.id)) {
            addPanelConfig.position = {
              referencePanel: prev.id,
              direction: 'right',
            };
          }
        }

        try {
          api.addPanel(addPanelConfig);
          reAddedIds.add(pane.id);
        } catch {
          try {
            delete addPanelConfig.position;
            api.addPanel(addPanelConfig);
            reAddedIds.add(pane.id);
          } catch {
            /* skip */
          }
        }
      });

      previousPanesRef.current = panes.map((p) => p.id);
      requestAnimationFrame(() => {
        programmaticChangeRef.current = false;
      });
      return;
    }

    // Incremental sync — add/remove panels as panes change
    const currentPaneIds = panes.map((p) => p.id);
    const hasChanges =
      currentPaneIds.length !== previousPanesRef.current.length ||
      currentPaneIds.some((id, i) => id !== previousPanesRef.current[i]);

    if (!hasChanges) return;
    programmaticChangeRef.current = true;

    // Remove deleted panels
    const removedPaneIds = previousPanesRef.current.filter(
      (id) => !currentPaneIds.includes(id),
    );
    removedPaneIds.forEach((id) => {
      try {
        const panel = api.getPanel(id);
        if (panel) api.removePanel(panel);
      } catch {
        /* already gone */
      }
      destroyTerminalEntry(id);
      usePaneStatusStore.getState().removeStatus(id);
    });

    // Add new panels
    const newPaneIds = currentPaneIds.filter(
      (id) => !previousPanesRef.current.includes(id),
    );
    newPaneIds.forEach((paneId) => {
      const pane = panes.find((p) => p.id === paneId);
      if (!pane) return;

      const profile =
        profiles.find((p) => p.id === pane.profileId) ?? profiles[0]!;

      const addPanelConfig: any = {
        id: pane.id,
        component: 'terminal',
        title: profile.name,
        params: { paneId: pane.id, profile, cwd: pane.cwd },
      };

      const panelExists = (pid: string) => {
        try {
          return !!api.getPanel(pid);
        } catch {
          return false;
        }
      };

      if (pane.splitFrom?.paneId && panelExists(pane.splitFrom.paneId)) {
        addPanelConfig.position = {
          referencePanel: pane.splitFrom.paneId,
          direction: pane.splitFrom.direction,
        };
      } else if (
        pane.dockviewPosition?.direction &&
        pane.dockviewPosition.referenceId &&
        panelExists(pane.dockviewPosition.referenceId)
      ) {
        addPanelConfig.position = {
          referencePanel: pane.dockviewPosition.referenceId,
          direction: pane.dockviewPosition.direction,
        };
      } else {
        const prevId = currentPaneIds[currentPaneIds.indexOf(paneId) - 1];
        if (prevId && panelExists(prevId)) {
          addPanelConfig.position = {
            referencePanel: prevId,
            direction: 'right',
          };
        }
      }

      try {
        api.addPanel(addPanelConfig);
      } catch {
        try {
          delete addPanelConfig.position;
          api.addPanel(addPanelConfig);
        } catch {
          /* skip */
        }
      }
    });

    previousPanesRef.current = currentPaneIds;
    requestAnimationFrame(() => {
      programmaticChangeRef.current = false;
    });
  }, [localDockviewApi, panes, profiles, layoutVersion]);

  // Handle maximize/restore via Dockview API
  useEffect(() => {
    const api = localDockviewApi;
    if (!api) return;

    if (maximizedPaneId) {
      try {
        const panel = api.getPanel(maximizedPaneId);
        if (panel) api.maximizeGroup(panel);
      } catch {
        /* Panel may not exist */
      }
    } else {
      try {
        if (api.hasMaximizedGroup()) api.exitMaximizedGroup();
      } catch {
        /* No maximized group */
      }
    }
  }, [localDockviewApi, maximizedPaneId]);

  // Debounced layout save
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = useWorkspaceStore.getState();
      const api = localDockviewApi;

      // Save expanded workspace's Dockview layout
      let workspaces = state.workspaces;
      if (api && state.expandedWorkspaceId) {
        try {
          const dockviewLayout = api.toJSON();
          workspaces = workspaces.map((w) =>
            w.id === state.expandedWorkspaceId ? { ...w, dockviewLayout } : w,
          );
        } catch {
          /* ignore */
        }
      }

      saveLayout(workspaces, state.activeWorkspaceId, state.gridDockviewLayout);
    }, 500);
    return () => clearTimeout(timer);
  }, [localDockviewApi, panes, maximizedPaneId]);

  // Cleanup on unmount — save layout back to workspace
  useEffect(() => {
    return () => {
      const api = expandedDockviewApiRef.current;
      if (api) {
        try {
          const layout = api.toJSON();
          const state = useWorkspaceStore.getState();
          if (state.expandedWorkspaceId) {
            useWorkspaceStore.setState((s) => ({
              workspaces: s.workspaces.map((w) =>
                w.id === s.expandedWorkspaceId
                  ? { ...w, dockviewLayout: layout }
                  : w,
              ),
            }));
          }
        } catch {
          /* ignore */
        }
        expandedDockviewApiRef.current = null;
      }
    };
  }, []);

  const handlePanelClose = useCallback((panelId: string) => {
    useWorkspaceStore.getState().removePane(panelId);
  }, []);

  const components = useMemo(
    () => ({
      terminal: (
        props: IDockviewPanelProps<{
          paneId: string;
          profile: TerminalProfile;
          cwd?: string;
        }>,
      ) => (
        <TerminalPaneWrapper
          paneId={props.params.paneId}
          profile={props.params.profile}
          cwd={props.params.cwd}
          onClose={() => handlePanelClose(props.params.paneId)}
        />
      ),
    }),
    [handlePanelClose],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Layer 2 header */}
      <div
        className={cn(
          'flex h-9 shrink-0 items-center gap-2 px-2',
          'border-b border-white/[0.06] bg-zinc-950/90',
          'select-none',
        )}
      >
        {/* Back button */}
        <button
          onClick={collapseWorkspace}
          className={cn(
            'flex h-6 items-center gap-1.5 rounded px-2',
            'text-zinc-500 transition-colors duration-100',
            'hover:bg-white/[0.06] hover:text-zinc-300',
          )}
          title="Back to grid (Esc)"
        >
          <ArrowLeft size={12} strokeWidth={2} />
          <span className="text-[11px] font-medium">Grid</span>
        </button>

        {/* Separator */}
        <span className="h-4 w-px bg-white/[0.08]" />

        {/* Project indicator */}
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: wsColor }}
          />
          <span className="text-[11px] font-medium text-zinc-300">
            {wsName}
          </span>
          {cwdLabel && (
            <span className="text-[10px] text-zinc-600">{cwdLabel}</span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Add terminal dropdown */}
        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className={cn(
              'flex h-6 items-center gap-1.5 rounded px-2',
              'text-zinc-500 transition-colors duration-100',
              'hover:bg-white/[0.06] hover:text-zinc-300',
            )}
            title="Add terminal"
          >
            <Plus size={12} strokeWidth={2} />
            <TerminalIcon size={11} strokeWidth={1.5} />
          </button>

          {showProfileMenu && (
            <div
              className={cn(
                'absolute top-full right-0 z-50 mt-1',
                'min-w-[160px] rounded-md border border-white/[0.08]',
                'bg-zinc-900 py-1 shadow-xl',
              )}
            >
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    addPane(p.id, 'right');
                    setShowProfileMenu(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5',
                    'text-left text-[11px] text-zinc-400',
                    'transition-colors hover:bg-white/[0.06] hover:text-zinc-200',
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Worktree button */}
        <button
          onClick={() => setShowWorktreeDialog(true)}
          disabled={!projectCwd}
          className={cn(
            'flex h-6 items-center gap-1.5 rounded px-2',
            'text-zinc-500 transition-colors duration-100',
            projectCwd
              ? 'hover:bg-white/[0.06] hover:text-zinc-300'
              : 'opacity-40',
          )}
          title={projectCwd ? 'Worktrees' : 'Set project directory first'}
        >
          <GitBranch size={12} strokeWidth={2} />
        </button>
      </div>

      {/* Dockview grid for expanded workspace */}
      <div className="relative min-h-0 flex-1">
        <DockviewReact
          onReady={handleReady}
          components={components}
          disableFloatingGroups
          className="h-full w-full"
        />
        <AnimatePresence>
          {showProjectBrowser && (
            <ProjectBrowser
              overlay
              onClose={() => {
                setShowProjectBrowser(false);
                setChangeDirPaneId(null);
              }}
            />
          )}
          {showWorktreeDialog && projectCwd && (
            <WorktreeDialog
              cwd={projectCwd}
              onClose={() => setShowWorktreeDialog(false)}
              onCreated={(worktreePath) => {
                setShowWorktreeDialog(false);
                addPaneWithCwd('system-shell', worktreePath, 'right');
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
