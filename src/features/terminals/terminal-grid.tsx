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

/** Thin wrapper that subscribes to the store for isActive — keeps Dockview components stable */
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
  const isActive = useWorkspaceStore((s) => s.activePaneId === paneId);
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
  const {
    workspace,
    profiles,
    layoutVersion,
    showProjectBrowser,
    setShowProjectBrowser,
    setChangeDirPaneId,
    maximizedPaneId,
    paneWorkspaces,
  } = useWorkspaceStore();

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
      previousPanesRef.current = workspace.panes.map((p) => p.id);
      previousLayoutVersionRef.current = layoutVersion;

      // Add existing panes to dockview with positioning
      const addedIds = new Set<string>();
      workspace.panes.forEach((pane, index) => {
        const profile =
          profiles.find((p) => p.id === pane.profileId) ?? profiles[0]!;

        const addPanelConfig: any = {
          id: pane.id,
          component: 'terminal',
          title: profile.name,
          params: {
            paneId: pane.id,
            profile,
            cwd: pane.cwd,
          },
        };

        // Use preset positioning if available — but only if the reference exists
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
          // Fallback: split right from previous added pane
          const prevPane = workspace.panes[index - 1];
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
          // Reference panel missing — add without position
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
    [workspace.panes, profiles, layoutVersion],
  );

  // Clear activePreset when user manually rearranges panels in Dockview
  useEffect(() => {
    if (!localDockviewApi) return;

    const disposable = localDockviewApi.onDidLayoutChange(() => {
      if (programmaticChangeRef.current) return;
      const { activePreset } = useWorkspaceStore.getState();
      if (activePreset) {
        useWorkspaceStore.setState({ activePreset: null });
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [localDockviewApi]);

  // Detect preset/layout change and rearrange via Dockview API
  useEffect(() => {
    const api = localDockviewApi;
    if (!api) return;

    if (layoutVersion !== previousLayoutVersionRef.current) {
      previousLayoutVersionRef.current = layoutVersion;
      programmaticChangeRef.current = true;

      // Layout version bumped (preset applied) — rearrange without full remount.
      // Remove all existing panels from Dockview, then re-add with new positions.
      // Terminal instances survive in the registry.
      try {
        api.clear();
      } catch {
        /* may already be empty */
      }

      const reAddedIds = new Set<string>();
      workspace.panes.forEach((pane, index) => {
        const profile =
          profiles.find((p) => p.id === pane.profileId) ?? profiles[0]!;

        const addPanelConfig: any = {
          id: pane.id,
          component: 'terminal',
          title: profile.name,
          params: {
            paneId: pane.id,
            profile,
            cwd: pane.cwd,
          },
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
          const prevPane = workspace.panes[index - 1];
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

      previousPanesRef.current = workspace.panes.map((p) => p.id);
      requestAnimationFrame(() => {
        programmaticChangeRef.current = false;
      });
      return;
    }

    // Normal incremental sync — add/remove individual panes
    const currentPaneIds = workspace.panes.map((p) => p.id);
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
      // Truly destroy the terminal — pane was closed by user
      destroyTerminalEntry(id);
      usePaneStatusStore.getState().removeStatus(id);
    });

    // Add new panels
    const newPaneIds = currentPaneIds.filter(
      (id) => !previousPanesRef.current.includes(id),
    );

    newPaneIds.forEach((paneId) => {
      const pane = workspace.panes.find((p) => p.id === paneId);
      if (!pane) return;

      const profile =
        profiles.find((p) => p.id === pane.profileId) ?? profiles[0]!;
      const index = workspace.panes.indexOf(pane);

      const addPanelConfig: any = {
        id: pane.id,
        component: 'terminal',
        title: profile.name,
        params: {
          paneId: pane.id,
          profile,
          cwd: pane.cwd,
        },
      };

      // Position the new panel — verify references exist before using them
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
      } else if (index > 0) {
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
  }, [localDockviewApi, workspace.panes, profiles, layoutVersion]);

  // Handle maximize/restore via Dockview API
  useEffect(() => {
    const api = localDockviewApi;
    if (!api) return;

    if (maximizedPaneId) {
      try {
        const panel = api.getPanel(maximizedPaneId);
        if (panel) {
          api.maximizeGroup(panel);
        }
      } catch {
        /* Panel may not exist */
      }
    } else {
      try {
        if (api.hasMaximizedGroup()) {
          api.exitMaximizedGroup();
        }
      } catch {
        /* No maximized group */
      }
    }
  }, [localDockviewApi, maximizedPaneId]);

  // Clean up orphaned registry entries when panes change
  useEffect(() => {
    const activePaneIds = workspace.panes.map((p) => p.id);
    // Include inner pane IDs from all nested workspaces
    for (const pw of Object.values(paneWorkspaces)) {
      for (const inner of pw.panes) {
        activePaneIds.push(inner.id);
      }
    }
    cleanupOrphanedEntries(activePaneIds);
  }, [workspace.panes, paneWorkspaces]);

  // Debounced layout save to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = useWorkspaceStore.getState();
      const api = localDockviewApi;
      let dockviewLayout = null;
      try {
        if (api) dockviewLayout = api.toJSON();
      } catch {
        /* ignore */
      }
      saveLayout(
        state.workspace.panes,
        state.activePaneId,
        state.activePreset,
        dockviewLayout,
        state.paneWorkspaces,
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [localDockviewApi, workspace.panes, maximizedPaneId, paneWorkspaces]);

  const handlePanelClose = useCallback((panelId: string) => {
    useWorkspaceStore.getState().removePane(panelId);
  }, []);

  // Stable component reference — TerminalPane subscribes to store for isActive
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

  if (workspace.panes.length === 0) {
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
      {/* Project browser overlay */}
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
