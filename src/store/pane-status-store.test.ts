import { describe, it, expect, beforeEach } from 'vitest';
import {
  usePaneStatusStore,
  STATUS_COLORS,
  type PaneStatus,
} from './pane-status-store';

function resetStore() {
  usePaneStatusStore.setState(usePaneStatusStore.getInitialState());
}

beforeEach(() => {
  resetStore();
});

describe('setStatus', () => {
  it('sets status for a pane', () => {
    usePaneStatusStore.getState().setStatus('pane-1', 'working');
    expect(usePaneStatusStore.getState().statuses['pane-1']).toBe('working');
  });

  it('overwrites existing status', () => {
    const { setStatus } = usePaneStatusStore.getState();
    setStatus('pane-1', 'working');
    setStatus('pane-1', 'done');
    expect(usePaneStatusStore.getState().statuses['pane-1']).toBe('done');
  });

  it('tracks multiple panes independently', () => {
    const { setStatus } = usePaneStatusStore.getState();
    setStatus('pane-1', 'working');
    setStatus('pane-2', 'error');
    setStatus('pane-3', 'idle');
    const { statuses } = usePaneStatusStore.getState();
    expect(statuses['pane-1']).toBe('working');
    expect(statuses['pane-2']).toBe('error');
    expect(statuses['pane-3']).toBe('idle');
  });
});

describe('removeStatus', () => {
  it('removes a specific pane status', () => {
    const { setStatus } = usePaneStatusStore.getState();
    setStatus('pane-1', 'working');
    setStatus('pane-2', 'done');
    usePaneStatusStore.getState().removeStatus('pane-1');
    const { statuses } = usePaneStatusStore.getState();
    expect(statuses['pane-1']).toBeUndefined();
    expect(statuses['pane-2']).toBe('done');
  });

  it('is a no-op for non-existent pane', () => {
    usePaneStatusStore.getState().setStatus('pane-1', 'idle');
    usePaneStatusStore.getState().removeStatus('nonexistent');
    expect(usePaneStatusStore.getState().statuses['pane-1']).toBe('idle');
  });
});

describe('clearAll', () => {
  it('removes all statuses', () => {
    const { setStatus } = usePaneStatusStore.getState();
    setStatus('pane-1', 'working');
    setStatus('pane-2', 'error');
    setStatus('pane-3', 'attention');
    usePaneStatusStore.getState().clearAll();
    expect(usePaneStatusStore.getState().statuses).toEqual({});
  });
});

describe('STATUS_COLORS', () => {
  it('has a color for every PaneStatus value', () => {
    const statuses: PaneStatus[] = [
      'working',
      'idle',
      'done',
      'error',
      'attention',
    ];
    for (const s of statuses) {
      expect(STATUS_COLORS[s]).toBeDefined();
      expect(typeof STATUS_COLORS[s]).toBe('string');
    }
  });
});
