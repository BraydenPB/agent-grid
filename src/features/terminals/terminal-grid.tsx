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
import { cleanupOrphanedEntries } from '@/lib/terminal-registry';
import { saveLayout } from '@/lib/layout-storage';
import { gridDockviewApiRef, dockviewApiRef } from '@/lib/dockview-api';
import type { TerminalProfile } from '@/types';
import { TerminalPane } from './terminal-pane';

/**
 * Layer 1 — Main project grid.
 *
 * Shows one Dockview panel per workspace (project), each rendering the
 * workspace's primary terminal (panes[0]).  Double-clicking a panel header
 * or pressing Ctrl+Enter expands into layer 2 (ExpandedView).
 */

/** Thin wrapper that subscribes to the store for isActive */
function PrimaryPaneWrapper({
  workspaceId,
  paneId,
  profile,
  cwd,
  onClose,
}: {
  workspaceId: string;
  paneId: string;
  profile: TerminalProfile;
  cwd?: string;
  onClose: () => void;
}) {
  const isActive = useWorkspaceStore(
    (s) => s.activeWorkspaceId === workspaceId,
  );
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const setActivePaneId = useWorkspaceStore((s) => s.setActivePaneId);

  const handleFocus = useCallback(() => {
    setActiveWorkspace(workspaceId);
    setActivePaneId(paneId);
  }, [workspaceId, paneId, setActiveWorkspace, setActivePaneId]);

  return (
    <TerminalPane
      paneId={paneId}
      profile={profile}
      initialCwd={cwd}
      isActive={isActive}
      onFocus={handleFocus}
      onClose={onClose}
    />
  );
}

export function TerminalGrid() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const profiles = useWorkspaceStore((s) => s.profiles);
  const layoutVersion = useWorkspaceStore((s) => s.layoutVersion);
  const showProjectBrowser = useWorkspaceStore((s) => s.showProjectBrowser);
  const setShowProjectBrowser = useWorkspaceStore(
    (s) => s.setShowProjectBrowser,
  );
  const setChangeDirPaneId = useWorkspaceStore((s) => s.setChangeDirPaneId);
  const gridDockviewLayout = useWorkspaceStore((s) => s.gridDockviewLayout);

  // Build a list of { workspaceId, pane, profile } for each workspace's primary pane
  const gridPanels = useMemo(() => {
    return workspaces
      .filter((ws) => ws.panes.length > 0)
      .map((ws) => {
        const pane = ws.panes[0]!;
        const profile =
          profiles.find((p) => p.id === pane.profileId) ?? profiles[0]!;
        return { workspaceId: ws.id, pane, profile, wsName: ws.name };
      });
  }, [workspaces, profiles]);

  const [localDockviewApi, setLocalDockviewApi] = useState<DockviewApi | null>(
    null,
  );
  const previousPanelsRef = useRef<string[]>([]);
  const previousLayoutVersionRef = useRef(layoutVersion);
  const programmaticChangeRef = useRef(false);

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      setLocalDockviewApi(event.api);
      gridDockviewApiRef.current = event.api;
      dockviewApiRef.current = event.api;
      previousPanelsRef.current = gridPanels.map((gp) => gp.workspaceId);
      previousLayoutVersionRef.current = layoutVersion;

      // Restore saved grid layout if available
      if (gridDockviewLayout) {
        try {
          event.api.fromJSON(gridDockviewLayout as any);
          return;
        } catch {
          // fall through to manual build
        }
      }

      // Build panels manually — one per workspace
      const addedIds = new Set<string>();
      gridPanels.forEach((gp, index) => {
        const addPanelConfig: any = {
          id: gp.workspaceId,
          component: 'projectCell',
          title: gp.wsName,
          params: {
            workspaceId: gp.workspaceId,
            paneId: gp.pane.id,
            profile: gp.profile,
            cwd: gp.pane.cwd,
          },
        };

        // Position: stack right of previous panel
        if (index > 0 && addedIds.size > 0) {
          const prev = gridPanels[index - 1];
          if (prev && addedIds.has(prev.workspaceId)) {
            addPanelConfig.position = {
              referencePanel: prev.workspaceId,
              direction: 'right',
            };
          }
        }

        try {
          event.api.addPanel(addPanelConfig);
          addedIds.add(gp.workspaceId);
        } catch {
          try {
            delete addPanelConfig.position;
            event.api.addPanel(addPanelConfig);
            addedIds.add(gp.workspaceId);
          } catch {
            /* skip */
          }
        }
      });
    },
    [gridPanels, layoutVersion, gridDockviewLayout],
  );

  // Detect layout version change — full rebuild
  useEffect(() => {
    const api = localDockviewApi;
    if (!api) return;

    if (layoutVersion !== previousLayoutVersionRef.current) {
      previousLayoutVersionRef.current = layoutVersion;
      programmaticChangeRef.current = true;

      // Try to restore saved grid layout
      const storeState = useWorkspaceStore.getState();
      if (storeState.gridDockviewLayout) {
        try {
          api.fromJSON(storeState.gridDockviewLayout as any);
          previousPanelsRef.current = gridPanels.map((gp) => gp.workspaceId);
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
      gridPanels.forEach((gp, index) => {
        const addPanelConfig: any = {
          id: gp.workspaceId,
          component: 'projectCell',
          title: gp.wsName,
          params: {
            workspaceId: gp.workspaceId,
            paneId: gp.pane.id,
            profile: gp.profile,
            cwd: gp.pane.cwd,
          },
        };

        if (index > 0) {
          const prev = gridPanels[index - 1];
          if (prev && reAddedIds.has(prev.workspaceId)) {
            addPanelConfig.position = {
              referencePanel: prev.workspaceId,
              direction: 'right',
            };
          }
        }

        try {
          api.addPanel(addPanelConfig);
          reAddedIds.add(gp.workspaceId);
        } catch {
          try {
            delete addPanelConfig.position;
            api.addPanel(addPanelConfig);
            reAddedIds.add(gp.workspaceId);
          } catch {
            /* skip */
          }
        }
      });

      previousPanelsRef.current = gridPanels.map((gp) => gp.workspaceId);
      requestAnimationFrame(() => {
        programmaticChangeRef.current = false;
      });
      return;
    }

    // Incremental sync — add/remove panels as workspaces change
    const currentIds = gridPanels.map((gp) => gp.workspaceId);
    const hasChanges =
      currentIds.length !== previousPanelsRef.current.length ||
      currentIds.some((id, i) => id !== previousPanelsRef.current[i]);

    if (!hasChanges) return;
    programmaticChangeRef.current = true;

    // Remove panels for deleted workspaces
    const removed = previousPanelsRef.current.filter(
      (id) => !currentIds.includes(id),
    );
    removed.forEach((id) => {
      try {
        const panel = api.getPanel(id);
        if (panel) api.removePanel(panel);
      } catch {
        /* already gone */
      }
    });

    // Add panels for new workspaces
    const added = currentIds.filter(
      (id) => !previousPanelsRef.current.includes(id),
    );
    added.forEach((wsId) => {
      const gp = gridPanels.find((g) => g.workspaceId === wsId);
      if (!gp) return;

      const addPanelConfig: any = {
        id: gp.workspaceId,
        component: 'projectCell',
        title: gp.wsName,
        params: {
          workspaceId: gp.workspaceId,
          paneId: gp.pane.id,
          profile: gp.profile,
          cwd: gp.pane.cwd,
        },
      };

      // Place right of last existing panel
      const existingIds = currentIds.filter(
        (id) => id !== wsId && !added.includes(id),
      );
      const lastExisting = existingIds[existingIds.length - 1];
      if (lastExisting) {
        const panelExists = (() => {
          try {
            return !!api.getPanel(lastExisting);
          } catch {
            return false;
          }
        })();
        if (panelExists) {
          addPanelConfig.position = {
            referencePanel: lastExisting,
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

    previousPanelsRef.current = currentIds;
    requestAnimationFrame(() => {
      programmaticChangeRef.current = false;
    });
  }, [localDockviewApi, gridPanels, layoutVersion]);

  // Clean up orphaned registry entries — consider ALL workspaces' panes as alive
  useEffect(() => {
    const allPaneIds = useWorkspaceStore
      .getState()
      .workspaces.flatMap((w) => w.panes.map((p) => p.id));
    cleanupOrphanedEntries(allPaneIds);
  }, [gridPanels]);

  // Debounced layout save
  useEffect(() => {
    const timer = setTimeout(() => {
      const state = useWorkspaceStore.getState();
      const api = localDockviewApi;

      // Save grid Dockview layout
      if (api) {
        try {
          const gridLayout = api.toJSON();
          useWorkspaceStore.setState({ gridDockviewLayout: gridLayout });
        } catch {
          /* ignore */
        }
      }

      saveLayout(
        state.workspaces,
        state.activeWorkspaceId,
        state.gridDockviewLayout,
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [localDockviewApi, gridPanels]);

  const handlePanelClose = useCallback((workspaceId: string) => {
    useWorkspaceStore.getState().removeWorkspace(workspaceId);
  }, []);

  const components = useMemo(
    () => ({
      projectCell: (
        props: IDockviewPanelProps<{
          workspaceId: string;
          paneId: string;
          profile: TerminalProfile;
          cwd?: string;
        }>,
      ) => (
        <PrimaryPaneWrapper
          workspaceId={props.params.workspaceId}
          paneId={props.params.paneId}
          profile={props.params.profile}
          cwd={props.params.cwd}
          onClose={() => handlePanelClose(props.params.workspaceId)}
        />
      ),
    }),
    [handlePanelClose],
  );

  if (gridPanels.length === 0) {
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
