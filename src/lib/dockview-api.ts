/**
 * Module-level Dockview API ref so any module (store, sidebar, etc.)
 * can call api.toJSON() on demand without prop drilling.
 */
import type { DockviewApi } from 'dockview';

export const dockviewApiRef: { current: DockviewApi | null } = {
  current: null,
};
