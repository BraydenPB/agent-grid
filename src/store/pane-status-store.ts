/**
 * Pane Status Store — tracks the operational status of each terminal pane.
 *
 * Separated from workspace-store to avoid unnecessary re-renders.
 * Status is derived from PTY events (exit codes, output activity, idle timeouts).
 */

import { create } from 'zustand';

export type PaneStatus = 'working' | 'idle' | 'done' | 'error' | 'attention';

interface PaneStatusState {
  statuses: Record<string, PaneStatus>;
  setStatus: (paneId: string, status: PaneStatus) => void;
  removeStatus: (paneId: string) => void;
  clearAll: () => void;
}

export const STATUS_COLORS: Record<PaneStatus, string> = {
  working: 'transparent',
  idle: '#6cb6ff', // blue
  done: '#57ab5a', // green
  error: '#f47067', // red
  attention: '#e0a658', // amber
};

export const usePaneStatusStore = create<PaneStatusState>((set) => ({
  statuses: {},

  setStatus: (paneId, status) =>
    set((state) => ({
      statuses: { ...state.statuses, [paneId]: status },
    })),

  removeStatus: (paneId) =>
    set((state) => {
      const { [paneId]: _, ...rest } = state.statuses;
      return { statuses: rest };
    }),

  clearAll: () => set({ statuses: {} }),
}));
