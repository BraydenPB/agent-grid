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
  // Initial working directory (set from project browser)
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

export interface Workspace {
  id: string;
  name: string;
  panes: Pane[];
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
