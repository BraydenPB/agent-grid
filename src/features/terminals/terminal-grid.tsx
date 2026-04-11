import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import {
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewApi,
  type IDockviewPanelProps,
} from 'dockview';
import { AnimatePresence } from 'framer-motion';
import 'dockview/dist/styles/dockview.css';
import { useWorkspaceStore } from '@/store/workspace-store';
import { ProjectBrowser } from '@/features/projects/project-browser';
import {
  cleanupOrphanedEntries,
  destroyTerminalEntry,
} from '@/lib/terminal-registry';
import { usePaneStatusStore } from '@/store/pane-status-store';
import { saveLayout } from '@/lib/layout-storage';
import { dockviewApiRef } from '@/lib/dockview-api';
import type { TerminalProfile } from '@/types';
import { TerminalPane } from './terminal-pane';

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
    const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
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

export function TerminalGrid() {
  const activeWorkspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId),
  );
  const profiles = useWorkspaceStore((s) => s.profiles);
  const layoutVersion = useWorkspaceStore((s) => s.layoutVersion);
  const showProjectBrowser = useWorkspaceStore((s) => s.showProjectBrowser);
  const setShowProjectBrowser = useWorkspaceStore(
    (s) => s.setShowProjectBrowser,
  );
  const setChangeDirPaneId = useWorkspaceStore((s) => s.setChangeDirPaneId);

  const expandedPaneId = useWorkspaceStore((s) => s.expandedPaneId);
  const level2PaneIds = useWorkspaceStore((s) => s.level2PaneIds);
  const level3PaneId = useWorkspaceStore((s) => s.level3PaneId);

  const allPanes = activeWorkspace?.panes ?? [];
  // Level 3: show only the single maximized pane
  // Level 2: show the expanded pane + level 2 panes
  // Level 1: show all panes
  const panes =
    level3PaneId !== null
      ? allPanes.filter((p) => p.id === level3PaneId)
      : expandedPaneId !== null
        ? allPanes.filter(
            (p) => p.id === expandedPaneId || level2PaneIds.includes(p.id),
          )
        : allPanes;
  const maximizedPaneId = activeWorkspace?.maximizedPaneId ?? null;

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
      const activeWs = savedLayout.workspaces.find(
        (w) => w.id === savedLayout.activeWorkspaceId,
      );
      if (activeWs?.dockviewLayout) {
        try {
          event.api.fromJSON(activeWs.dockviewLayout as any);
          return;
        } catch {
          // fall through to manual rebuild
        }
      }

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
      const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
      if (ws?.activePreset) {
        useWorkspaceStore.setState((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === s.activeWorkspaceId ? { ...w, activePreset: null } : w,
          ),
        }));
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [localDockviewApi]);

  // Detect layout version change (preset applied or workspace switch) — rearrange Dockview
  useEffect(() => {
    const api = localDockviewApi;
    if (!api) return;

    if (layoutVersion !== previousLayoutVersionRef.current) {
      previousLayoutVersionRef.current = layoutVersion;
      programmaticChangeRef.current = true;

      const storeState = useWorkspaceStore.getState();

      // Exiting level 3 — restore the level 2 layout
      if (
        storeState.expandedPaneId &&
        !storeState.level3PaneId &&
        storeState.preLevel3Layout
      ) {
        try {
          api.fromJSON(storeState.preLevel3Layout as any);
          previousPanesRef.current = panes.map((p) => p.id);
          useWorkspaceStore.setState({ preLevel3Layout: null });
          requestAnimationFrame(() => {
            programmaticChangeRef.current = false;
          });
          return;
        } catch {
          // fall through to manual rebuild
        }
      }

      // Collapsing from level 2 — restore the pre-expand layout
      if (!storeState.expandedPaneId && storeState.preExpandLayout) {
        try {
          api.fromJSON(storeState.preExpandLayout as any);
          previousPanesRef.current = panes.map((p) => p.id);
          useWorkspaceStore.setState({ preExpandLayout: null });
          requestAnimationFrame(() => {
            programmaticChangeRef.current = false;
          });
          return;
        } catch {
          // fall through to manual rebuild
        }
      }

      // Expanding into level 2 — restore saved level 2 layout if available
      if (storeState.expandedPaneId && storeState.level2Layout) {
        try {
          api.fromJSON(storeState.level2Layout as any);
          previousPanesRef.current = panes.map((p) => p.id);
          useWorkspaceStore.setState({ level2Layout: null });
          requestAnimationFrame(() => {
            programmaticChangeRef.current = false;
          });
          return;
        } catch {
          // fall through to manual rebuild
        }
      }

      // Restore saved Dockview layout if available (workspace switch)
      const incomingWs = storeState.workspaces.find(
        (w) => w.id === storeState.activeWorkspaceId,
      );
      if (incomingWs?.dockviewLayout && !storeState.expandedPaneId) {
        try {
          api.fromJSON(incomingWs.dockviewLayout as any);
          previousPanesRef.current = panes.map((p) => p.id);
          requestAnimationFrame(() => {
            programmaticChangeRef.current = false;
          });
          return;
        } catch {
          // fall through to manual rebuild
        }
      }

      try {
        api.clear();
      } catch {
        /* may already be empty */
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
        profiles.find((p) => p.id === pane.profileId) ?? profiles[0]!;

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

  // Clean up orphaned registry entries — consider ALL workspaces' panes as alive
  useEffect(() => {
    const allPaneIds = useWorkspaceStore
      .getState()
      .workspaces.flatMap((w) => w.panes.map((p) => p.id));
    cleanupOrphanedEntries(allPaneIds);
  }, [panes]);

  // Debounced layout save to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = useWorkspaceStore.getState();
      const api = localDockviewApi;

      // Update active workspace's Dockview layout before saving
      let workspaces = state.workspaces;
      if (api && state.activeWorkspaceId) {
        try {
          const dockviewLayout = api.toJSON();
          workspaces = workspaces.map((w) =>
            w.id === state.activeWorkspaceId ? { ...w, dockviewLayout } : w,
          );
        } catch {
          /* ignore */
        }
      }

      saveLayout(workspaces, state.activeWorkspaceId);
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

  if (panes.length === 0) {
    return <ProjectBrowser />;
  }

  return (
    <div className="relative flex-1 overflow-hidden">
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
      </AnimatePresence>
    </div>
  );
}
