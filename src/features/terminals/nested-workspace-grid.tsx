import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import {
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewApi,
  type IDockviewPanelProps,
} from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { useWorkspaceStore } from '@/store/workspace-store';
import {
  cleanupOrphanedEntries,
  destroyTerminalEntry,
  getRegisteredPaneIds,
} from '@/lib/terminal-registry';
import { usePaneStatusStore } from '@/store/pane-status-store';
import type { TerminalProfile } from '@/types';
import { TerminalPane } from './terminal-pane';

/**
 * Thin wrapper for inner terminals — subscribes to the inner workspace's
 * activePaneId instead of the outer one.
 */
function InnerTerminalPaneWrapper({
  paneId,
  parentPaneId,
  profile,
  cwd,
  onClose,
}: {
  paneId: string;
  parentPaneId: string;
  profile: TerminalProfile;
  cwd?: string;
  onClose: () => void;
}) {
  const isActive = useWorkspaceStore(
    (s) => s.paneWorkspaces[parentPaneId]?.activePaneId === paneId,
  );
  const setActiveInnerPaneId = useWorkspaceStore((s) => s.setActiveInnerPaneId);

  return (
    <TerminalPane
      paneId={paneId}
      profile={profile}
      initialCwd={cwd}
      isActive={isActive}
      onFocus={() => setActiveInnerPaneId(parentPaneId, paneId)}
      onClose={onClose}
      innerContext={{ parentPaneId }}
    />
  );
}

interface NestedWorkspaceGridProps {
  parentPaneId: string;
}

export function NestedWorkspaceGrid({
  parentPaneId,
}: NestedWorkspaceGridProps) {
  const paneWorkspace = useWorkspaceStore(
    (s) => s.paneWorkspaces[parentPaneId],
  );
  const profiles = useWorkspaceStore((s) => s.profiles);

  const [localApi, setLocalApi] = useState<DockviewApi | null>(null);
  const previousPanesRef = useRef<string[]>([]);
  const programmaticChangeRef = useRef(false);

  const innerMaximizedPaneId = paneWorkspace?.maximizedPaneId ?? null;

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      setLocalApi(event.api);
      if (!paneWorkspace) return;

      previousPanesRef.current = paneWorkspace.panes.map((p) => p.id);
      const addedIds = new Set<string>();

      paneWorkspace.panes.forEach((pane, index) => {
        const profile =
          profiles.find((p) => p.id === pane.profileId) ?? profiles[0]!;

        const config: any = {
          id: pane.id,
          component: 'terminal',
          title: profile.name,
          params: { paneId: pane.id, parentPaneId, profile, cwd: pane.cwd },
        };

        if (
          pane.dockviewPosition?.direction &&
          pane.dockviewPosition.referenceId &&
          addedIds.has(pane.dockviewPosition.referenceId)
        ) {
          config.position = {
            referencePanel: pane.dockviewPosition.referenceId,
            direction: pane.dockviewPosition.direction,
          };
        } else if (index > 0 && addedIds.size > 0) {
          const prevPane = paneWorkspace.panes[index - 1];
          if (prevPane && addedIds.has(prevPane.id)) {
            config.position = {
              referencePanel: prevPane.id,
              direction: 'right',
            };
          }
        }

        try {
          event.api.addPanel(config);
          addedIds.add(pane.id);
        } catch {
          try {
            delete config.position;
            event.api.addPanel(config);
            addedIds.add(pane.id);
          } catch {
            /* skip */
          }
        }
      });
    },
    [paneWorkspace, profiles, parentPaneId],
  );

  // Incremental sync — add/remove inner panes
  useEffect(() => {
    if (!localApi || !paneWorkspace) return;

    const currentIds = paneWorkspace.panes.map((p) => p.id);
    const hasChanges =
      currentIds.length !== previousPanesRef.current.length ||
      currentIds.some((id, i) => id !== previousPanesRef.current[i]);

    if (!hasChanges) return;
    programmaticChangeRef.current = true;

    // Remove panels no longer in state
    const removedIds = previousPanesRef.current.filter(
      (id) => !currentIds.includes(id),
    );
    removedIds.forEach((id) => {
      try {
        const panel = localApi.getPanel(id);
        if (panel) localApi.removePanel(panel);
      } catch {
        /* gone */
      }
      destroyTerminalEntry(id);
      usePaneStatusStore.getState().removeStatus(id);
    });

    // Add new panels
    const newIds = currentIds.filter(
      (id) => !previousPanesRef.current.includes(id),
    );
    newIds.forEach((paneId) => {
      const pane = paneWorkspace.panes.find((p) => p.id === paneId);
      if (!pane) return;

      const profile =
        profiles.find((p) => p.id === pane.profileId) ?? profiles[0]!;

      const config: any = {
        id: pane.id,
        component: 'terminal',
        title: profile.name,
        params: { paneId: pane.id, parentPaneId, profile, cwd: pane.cwd },
      };

      const panelExists = (id: string) => {
        try {
          return !!localApi.getPanel(id);
        } catch {
          return false;
        }
      };

      if (pane.splitFrom?.paneId && panelExists(pane.splitFrom.paneId)) {
        config.position = {
          referencePanel: pane.splitFrom.paneId,
          direction: pane.splitFrom.direction,
        };
      } else {
        const prevIdx = currentIds.indexOf(paneId) - 1;
        const prevId = currentIds[prevIdx];
        if (prevId && panelExists(prevId)) {
          config.position = { referencePanel: prevId, direction: 'right' };
        }
      }

      try {
        localApi.addPanel(config);
      } catch {
        try {
          delete config.position;
          localApi.addPanel(config);
        } catch {
          /* skip */
        }
      }
    });

    previousPanesRef.current = currentIds;
    requestAnimationFrame(() => {
      programmaticChangeRef.current = false;
    });
  }, [localApi, paneWorkspace, profiles, parentPaneId]);

  // Inner maximize/restore
  useEffect(() => {
    if (!localApi) return;

    if (innerMaximizedPaneId) {
      try {
        const panel = localApi.getPanel(innerMaximizedPaneId);
        if (panel) localApi.maximizeGroup(panel);
      } catch {
        /* not found */
      }
    } else {
      try {
        if (localApi.hasMaximizedGroup()) localApi.exitMaximizedGroup();
      } catch {
        /* none */
      }
    }
  }, [localApi, innerMaximizedPaneId]);

  // Cleanup orphaned inner entries
  useEffect(() => {
    if (!paneWorkspace) return;
    const innerIds = paneWorkspace.panes.map((p) => p.id);
    // Only clean up entries that belong to this inner workspace
    const allRegistered = getRegisteredPaneIds();
    const orphaned = allRegistered.filter(
      (id) =>
        // Only target entries that were created for inner panes of this parent
        previousPanesRef.current.includes(id) && !innerIds.includes(id),
    );
    if (orphaned.length > 0) {
      // cleanupOrphanedEntries expects all active IDs — pass inner IDs + all outer IDs
      const outerIds = useWorkspaceStore
        .getState()
        .workspace.panes.map((p) => p.id);
      cleanupOrphanedEntries([...outerIds, ...innerIds]);
    }
  }, [paneWorkspace]);

  const handlePanelClose = useCallback(
    (panelId: string) => {
      useWorkspaceStore.getState().removeInnerPane(parentPaneId, panelId);
    },
    [parentPaneId],
  );

  const components = useMemo(
    () => ({
      terminal: (
        props: IDockviewPanelProps<{
          paneId: string;
          parentPaneId: string;
          profile: TerminalProfile;
          cwd?: string;
        }>,
      ) => (
        <InnerTerminalPaneWrapper
          paneId={props.params.paneId}
          parentPaneId={props.params.parentPaneId}
          profile={props.params.profile}
          cwd={props.params.cwd}
          onClose={() => handlePanelClose(props.params.paneId)}
        />
      ),
    }),
    [handlePanelClose],
  );

  if (!paneWorkspace || paneWorkspace.panes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600">
        Empty workspace
      </div>
    );
  }

  return (
    <DockviewReact
      onReady={handleReady}
      components={components}
      disableFloatingGroups
      className="h-full w-full"
    />
  );
}
