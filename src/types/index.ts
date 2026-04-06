export interface TerminalProfile {
  id: string;
  name: string;
  command: string;
  args: string[];
  icon?: string;
  color?: string;
  env?: Record<string, string>;
  cwd?: string;
}

export interface Pane {
  id: string;
  profileId: string;
  title: string;
  isActive: boolean;
  // react-grid-layout position
  layout: PaneLayout;
}

export interface PaneLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface Workspace {
  id: string;
  name: string;
  panes: Pane[];
  gridCols: number;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  paneId: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
}

export type GridPreset = {
  name: string;
  cols: number;
  layouts: PaneLayout[];
};
