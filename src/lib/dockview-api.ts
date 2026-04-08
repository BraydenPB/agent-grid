/**
 * Module-level Dockview API ref so any module (store, sidebar, etc.)
 * can call api.toJSON() on demand without prop drilling.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const dockviewApiRef: { current: any } = { current: null };
