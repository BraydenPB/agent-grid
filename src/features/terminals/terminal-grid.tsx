import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import {
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewApi,
  type IDockviewPanelProps,
  type IDockviewPanelHeaderProps,
} from 'dockview';
import { AnimatePresence } from 'framer-motion';
import { X, Settings } from 'lucide-react';
import 'dockview/dist/styles/dockview.css';
import {
  useWorkspaceStore,
  getActiveWorktree,
  getAllPaneIds,
  getActiveWorktreeId,
} from '@/store/workspace-store';
import { ProjectBrowser } from '@/features/projects/project-browser';
import {
  cleanupOrphanedEntries,
  destroyTerminalEntry,
} from '@/lib/terminal-registry';
import { usePaneStatusStore, STATUS_COLORS } from '@/store/pane-status-store';
import { saveLayout } from '@/lib/layout-storage';
import { dockviewApiRef } from '@/lib/dockview-api';
import type { Pane, TerminalProfile } from '@/types';
import { cn } from '@/lib/utils';
import { TerminalPane } from './terminal-pane';

const EMPTY_PANES: Pane[] = [];

/**
 * Custom Dockview tab — shows profile color dot + status, name, cwd basename, close.
 * Right-click opens the pane context menu. Double-click toggles maximize.
 */
function PaneTab(props: IDockviewPanelHeaderProps) {
  const paneId = (props.params as { paneId?: string } | undefined)?.paneId;

  const profile = useWorkspaceStore((s) => {
    const wt = getActiveWorktree(s);
    const pane = wt?.panes.find((p) => p.id === paneId);
    if (!pane) return null;
    return s.profiles.find((p) => p.id === pane.profileId) ?? null;
  });
  const pane = useWorkspaceStore((s) => {
    const wt = getActiveWorktree(s);
    return wt?.panes.find((p) => p.id === paneId) ?? null;
  });
  const toggleMaximize = useWorkspaceStore((s) => s.toggleMaximize);
  const paneStatus = usePaneStatusStore((s) =>
    paneId ? (s.statuses[paneId] ?? 'working') : 'working',
  );
  const [isActive, setIsActive] = useState(props.api.isActive);

  useEffect(() => {
    const d = props.api.onDidActiveChange((e) => setIsActive(e.isActive));
    return () => d.dispose();
  }, [props.api]);

  const effectiveColor = pane?.colorOverride ?? profile?.color ?? '#6b7280';
  const statusColor = STATUS_COLORS[paneStatus];
  const name = profile?.name ?? props.api.title ?? 'Terminal';
  const cwd = pane?.cwd ?? '';
  const cwdLabel = cwd ? cwd.split(/[\\/]/).pop() || cwd : '';

  const dispatchContextMenu = useCallback(
    (x: number, y: number) => {
      if (!paneId) return;
      props.api.setActive();
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          `[data-pane-root="${paneId}"]`,
        );
        if (!el) return;
        el.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: 2,
          }),
        );
      });
    },
    [paneId, props.api],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!paneId) return;
      e.preventDefault();
      e.stopPropagation();
      dispatchContextMenu(e.clientX, e.clientY);
    },
    [paneId, dispatchContextMenu],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!paneId) return;
      e.stopPropagation();
      toggleMaximize(paneId);
    },
    [paneId, toggleMaximize],
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      props.api.close();
    },
    [props.api],
  );

  return (
    <div
      className={cn(
        'group/tab flex h-full min-w-0 items-center gap-2 px-2.5 select-none',
        'text-[11px] transition-colors duration-100',
        isActive ? 'text-zinc-200' : 'text-zinc-500 hover:text-zinc-300',
      )}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      title={cwd || name}
    >
      {/* Profile color dot + status indicator */}
      <span className="relative flex shrink-0 items-center justify-center">
        <span
          className="h-2 w-2 rounded-full transition-all duration-200"
          style={{
            backgroundColor: effectiveColor,
            opacity: isActive ? 1 : 0.5,
            boxShadow: isActive ? `0 0 6px ${effectiveColor}55` : 'none',
          }}
        />
        {paneStatus !== 'working' && statusColor !== 'transparent' && (
          <span
            className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
        )}
      </span>

      {/* Profile name */}
      <span className="truncate font-medium">{name}</span>

      {/* CWD breadcrumb (only if room & present) */}
      {cwdLabel && (
        <span
          className={cn(
            'truncate text-[10px]',
            isActive ? 'text-zinc-500' : 'text-zinc-600',
          )}
        >
          {cwdLabel}
        </span>
      )}

      {/* Gear / settings */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          dispatchContextMenu(e.clientX, e.clientY);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-zinc-300 transition-colors duration-100 hover:bg-white/[0.08] hover:text-white"
        aria-label="Pane settings"
        title="Settings"
      >
        <Settings size={11} strokeWidth={1.75} />
      </button>

      {/* Close */}
      <button
        type="button"
        onClick={handleClose}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded',
          'text-zinc-600 transition-colors duration-100',
          'hover:bg-red-500/[0.12] hover:text-red-400',
          isActive ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
        )}
        aria-label="Close tab"
        title="Close"
      >
        <X size={10} strokeWidth={2} />
      </button>
    </div>
  );
}

const FALLBACK_PROFILE: TerminalProfile = {
  id: 'system-shell',
  name: 'Shell',
  command: '__SYSTEM_SHELL__',
  args: [],
  color: '#6b7280',
};

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
    const wt = getActiveWorktree(s);
    return wt?.activePaneId === paneId;
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
      hideHeader
    />
  );
}

export function TerminalGrid() {
  const activeWorktree = useWorkspaceStore(getActiveWorktree);
  const profiles = useWorkspaceStore((s) => s.profiles);
  const layoutVersion = useWorkspaceStore((s) => s.layoutVersion);
  const showProjectBrowser = useWorkspaceStore((s) => s.showProjectBrowser);
  const setShowProjectBrowser = useWorkspaceStore(
    (s) => s.setShowProjectBrowser,
  );
  // Level 3: show ALL panes from active worktree (no filtering)
  const panes = activeWorktree?.panes ?? EMPTY_PANES;
  const maximizedPaneId = activeWorktree?.maximizedPaneId ?? null;

  const [localDockviewApi, setLocalDockviewApi] = useState<DockviewApi | null>(
    null,
  );
  const previousPanesRef = useRef<string[]>([]);
  const previousLayoutVersionRef = useRef(layoutVersion);
  const programmaticChangeRef = useRef(false);

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      setLocalDockviewApi(event.api);
      dockviewApiRef.current = event.api;
      previousPanesRef.current = panes.map((p) => p.id);
      previousLayoutVersionRef.current = layoutVersion;

      // Restore saved Dockview layout if available
      const savedLayout = useWorkspaceStore.getState();
      const activeWt = getActiveWorktree(savedLayout);
      if (activeWt?.dockviewLayout) {
        try {
          event.api.fromJSON(activeWt.dockviewLayout as any);
          return;
        } catch {
          // fall through to manual rebuild
        }
      }

      const addedIds = new Set<string>();
      panes.forEach((pane, index) => {
        const profile =
          profiles.find((p) => p.id === pane.profileId) ??
          profiles[0] ??
          FALLBACK_PROFILE;

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
          const prevPane = panes[index - 1];
          if (prevPane && addedIds.has(prevPane.id)) {
            addPanelConfig.position = {
              referencePanel: prevPane.id,
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
            /* panel truly can't be added */
          }
        }
      });
    },
    [panes, profiles, layoutVersion],
  );

  // Clear activePreset when user manually rearranges panels
  useEffect(() => {
    if (!localDockviewApi) return;

    const disposable = localDockviewApi.onDidLayoutChange(() => {
      if (programmaticChangeRef.current) return;
      const state = useWorkspaceStore.getState();
      const wt = getActiveWorktree(state);
      if (wt?.activePreset) {
        const activeWtId = getActiveWorktreeId(state);
        if (activeWtId) {
          useWorkspaceStore.setState((s) => ({
            worktrees: {
              ...s.worktrees,
              [activeWtId]: {
                ...s.worktrees[activeWtId]!,
                activePreset: null,
                updatedAt: new Date().toISOString(),
              },
            },
          }));
        }
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [localDockviewApi]);

  // Detect layout version change (preset applied or worktree switch) — rearrange Dockview
  useEffect(() => {
    const api = localDockviewApi;
    if (!api) return;

    if (layoutVersion !== previousLayoutVersionRef.current) {
      previousLayoutVersionRef.current = layoutVersion;
      programmaticChangeRef.current = true;

      const storeState = useWorkspaceStore.getState();

      // Restore saved Dockview layout if available (worktree switch)
      const incomingWt = getActiveWorktree(storeState);
      if (incomingWt?.dockviewLayout) {
        try {
          api.fromJSON(incomingWt.dockviewLayout as any);
          previousPanesRef.current = panes.map((p) => p.id);
          requestAnimationFrame(() => {
            programmaticChangeRef.current = false;
          });
          return;
        } catch {
          // fall through to manual rebuild
        }
      }

      // Full rebuild from pane positions
      try {
        api.clear();
      } catch {
        /* may already be empty */
      }

      const reAddedIds = new Set<string>();
      panes.forEach((pane, index) => {
        const profile =
          profiles.find((p) => p.id === pane.profileId) ??
          profiles[0] ??
          FALLBACK_PROFILE;

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
          const prevPane = panes[index - 1];
          if (prevPane && reAddedIds.has(prevPane.id)) {
            addPanelConfig.position = {
              referencePanel: prevPane.id,
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

    // Normal incremental sync — add/remove individual panes
    const currentPaneIds = panes.map((p) => p.id);
    const hasChanges =
      currentPaneIds.length !== previousPanesRef.current.length ||
      currentPaneIds.some((id, i) => id !== previousPanesRef.current[i]);

    if (hasChanges) programmaticChangeRef.current = true;

    // Remove panels that no longer exist in store
    const removedPaneIds = previousPanesRef.current.filter(
      (id) => !currentPaneIds.includes(id),
    );
    removedPaneIds.forEach((id) => {
      try {
        const panel = api.getPanel(id);
        if (panel) api.removePanel(panel);
      } catch {
        // Panel may already be gone
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
        profiles.find((p) => p.id === pane.profileId) ??
        profiles[0] ??
        FALLBACK_PROFILE;

      const addPanelConfig: any = {
        id: pane.id,
        component: 'terminal',
        title: profile.name,
        params: { paneId: pane.id, profile, cwd: pane.cwd },
      };

      const panelExists = (id: string) => {
        try {
          return !!api.getPanel(id);
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
    if (hasChanges) {
      requestAnimationFrame(() => {
        programmaticChangeRef.current = false;
      });
    }
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

  // Clean up orphaned registry entries — consider ALL worktrees' panes as alive
  useEffect(() => {
    const allIds = getAllPaneIds(useWorkspaceStore.getState());
    cleanupOrphanedEntries(allIds);
  }, [panes]);

  // Debounced layout save to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = useWorkspaceStore.getState();
      const api = localDockviewApi;

      // Update active worktree's Dockview layout before saving
      let worktrees = state.worktrees;
      const activeWtId = getActiveWorktreeId(state);
      if (api && activeWtId) {
        try {
          const dockviewLayout = api.toJSON();
          const wt = worktrees[activeWtId];
          if (wt) {
            worktrees = {
              ...worktrees,
              [activeWtId]: { ...wt, dockviewLayout },
            };
          }
        } catch {
          /* ignore */
        }
      }

      saveLayout({ ...state, worktrees });
    }, 500);
    return () => clearTimeout(timer);
  }, [localDockviewApi, panes, maximizedPaneId]);

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
    <div className="relative flex min-h-0 flex-1 flex-col">
      <DockviewReact
        className="dockview-theme-abyss flex-1"
        components={components}
        defaultTabComponent={PaneTab}
        onReady={handleReady}
        disableFloatingGroups
      />
      <AnimatePresence>
        {showProjectBrowser && (
          <ProjectBrowser onClose={() => setShowProjectBrowser(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
