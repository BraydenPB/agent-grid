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
  // Per-pane color override (takes precedence over profile color)
  colorOverride?: string;
  // Working directory (initial from project browser, live from OSC 7)
  cwd?: string;
  // Dockview positioning — resolved with stable pane IDs
  dockviewPosition?: {
    referenceId?: string;
    direction?: 'right' | 'below';
  };
  // Split from an existing pane (for dynamic adds)
  splitFrom?: {
    paneId: string;
    direction: 'right' | 'below';
  };
}

export interface WorkspaceTab {
  id: string;
  name: string;
  color?: string;
  cwd?: string;
  panes: Pane[];
  activePaneId: string | null;
  maximizedPaneId: string | null;
  activePreset: string | null;
  dockviewLayout: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  paneId: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}
