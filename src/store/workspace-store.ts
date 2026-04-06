import { create } from "zustand";
import type { Pane, Workspace, TerminalProfile } from "@/types";
import { DEFAULT_PROFILES } from "@/lib/profiles";
import { GRID_PRESETS } from "@/lib/grid-presets";
import { generateId } from "@/lib/utils";

interface WorkspaceState {
  // Current workspace
  workspace: Workspace;
  // Available terminal profiles
  profiles: TerminalProfile[];
  // Which pane is focused
  activePaneId: string | null;

  // Actions
  setActivePaneId: (id: string | null) => void;
  addPane: (profileId: string) => void;
  removePane: (id: string) => void;
  updatePaneLayout: (id: string, layout: Partial<Pane["layout"]>) => void;
  updateWorkspaceLayouts: (layouts: ReactGridLayout.Layout[]) => void;
  applyPreset: (presetName: string, profileId: string) => void;
  renameWorkspace: (name: string) => void;
  addProfile: (profile: TerminalProfile) => void;
}

const defaultProfile = DEFAULT_PROFILES[0];

function createPane(profileId: string, layout: Pane["layout"]): Pane {
  const profile = DEFAULT_PROFILES.find((p) => p.id === profileId) ?? defaultProfile;
  return {
    id: generateId(),
    profileId,
    title: profile.name,
    isActive: false,
    layout,
  };
}

function createDefaultWorkspace(): Workspace {
  const pane = createPane(defaultProfile.id, { x: 0, y: 0, w: 12, h: 12, minW: 1, minH: 1 });
  return {
    id: generateId(),
    name: "Default Workspace",
    panes: [pane],
    gridCols: 12,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspace: createDefaultWorkspace(),
  profiles: [...DEFAULT_PROFILES],
  activePaneId: null,

  setActivePaneId: (id) => set({ activePaneId: id }),

  addPane: (profileId) =>
    set((state) => {
      const paneCount = state.workspace.panes.length;
      const layout = {
        x: (paneCount * 6) % 12,
        y: Math.floor(paneCount / 2) * 6,
        w: 6,
        h: 6,
        minW: 1,
        minH: 1,
      };
      const pane = createPane(profileId, layout);
      return {
        workspace: {
          ...state.workspace,
          panes: [...state.workspace.panes, pane],
          updatedAt: new Date().toISOString(),
        },
      };
    }),

  removePane: (id) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        panes: state.workspace.panes.filter((p) => p.id !== id),
        updatedAt: new Date().toISOString(),
      },
      activePaneId: state.activePaneId === id ? null : state.activePaneId,
    })),

  updatePaneLayout: (id, layout) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        panes: state.workspace.panes.map((p) =>
          p.id === id ? { ...p, layout: { ...p.layout, ...layout } } : p
        ),
        updatedAt: new Date().toISOString(),
      },
    })),

  updateWorkspaceLayouts: (layouts) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        panes: state.workspace.panes.map((pane) => {
          const l = layouts.find((lay) => lay.i === pane.id);
          if (!l) return pane;
          return {
            ...pane,
            layout: { ...pane.layout, x: l.x, y: l.y, w: l.w, h: l.h },
          };
        }),
        updatedAt: new Date().toISOString(),
      },
    })),

  applyPreset: (presetName, profileId) =>
    set((state) => {
      const preset = GRID_PRESETS.find((p) => p.name === presetName);
      if (!preset) return state;
      const panes = preset.layouts.map((layout) => createPane(profileId, layout));
      return {
        workspace: {
          ...state.workspace,
          panes,
          gridCols: preset.cols,
          updatedAt: new Date().toISOString(),
        },
        activePaneId: null,
      };
    }),

  renameWorkspace: (name) =>
    set((state) => ({
      workspace: { ...state.workspace, name, updatedAt: new Date().toISOString() },
    })),

  addProfile: (profile) =>
    set((state) => ({
      profiles: [...state.profiles, profile],
    })),
}));
