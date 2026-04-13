import { describe, it, expect, beforeEach } from 'vitest';
import { BUILTIN_PRESETS } from './builtin-presets';
import { useLayoutPresets } from './preset-store';
import { col, leaf, row } from './types';

function resetStore() {
  localStorage.clear();
  useLayoutPresets.setState({ userPresets: [] });
}

beforeEach(resetStore);

describe('allPresets', () => {
  it('returns built-ins when no user presets exist', () => {
    expect(useLayoutPresets.getState().allPresets()).toEqual(BUILTIN_PRESETS);
  });

  it('returns built-ins + user presets, built-ins first', () => {
    useLayoutPresets.getState().createUserPreset('My Layout', leaf(), 'both');
    const all = useLayoutPresets.getState().allPresets();
    expect(all).toHaveLength(BUILTIN_PRESETS.length + 1);
    expect(all.slice(0, BUILTIN_PRESETS.length)).toEqual(BUILTIN_PRESETS);
    expect(all[BUILTIN_PRESETS.length]!.name).toBe('My Layout');
  });
});

describe('createUserPreset', () => {
  it('assigns a user: id prefix', () => {
    const p = useLayoutPresets
      .getState()
      .createUserPreset('Custom', row(leaf(), leaf()));
    expect(p.id.startsWith('user:')).toBe(true);
    expect(p.builtin).toBe(false);
  });

  it('persists to localStorage', () => {
    useLayoutPresets.getState().createUserPreset('Saved', leaf());
    const raw = localStorage.getItem('agent-grid:layout-presets');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { name: string }[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.name).toBe('Saved');
  });

  it('defaults scope to "both"', () => {
    const p = useLayoutPresets.getState().createUserPreset('X', leaf());
    expect(p.scope).toBe('both');
  });
});

describe('renameUserPreset', () => {
  it('renames a user preset', () => {
    const p = useLayoutPresets.getState().createUserPreset('Old', leaf());
    useLayoutPresets.getState().renameUserPreset(p.id, 'New');
    expect(useLayoutPresets.getState().findPreset(p.id)!.name).toBe('New');
  });

  it('refuses to rename built-ins', () => {
    const before = BUILTIN_PRESETS[0]!.name;
    useLayoutPresets.getState().renameUserPreset('builtin:single', 'Hacked');
    expect(BUILTIN_PRESETS[0]!.name).toBe(before);
  });
});

describe('deleteUserPreset', () => {
  it('removes a user preset and persists the removal', () => {
    const p = useLayoutPresets.getState().createUserPreset('Temp', leaf());
    useLayoutPresets.getState().deleteUserPreset(p.id);
    expect(useLayoutPresets.getState().findPreset(p.id)).toBeUndefined();
    const raw = localStorage.getItem('agent-grid:layout-presets');
    expect(JSON.parse(raw!)).toHaveLength(0);
  });

  it('silently ignores built-in ids', () => {
    useLayoutPresets.getState().deleteUserPreset('builtin:single');
    expect(
      useLayoutPresets.getState().findPreset('builtin:single'),
    ).toBeDefined();
  });
});

describe('presetsForScope', () => {
  it('filters by dashboard or worktree, keeping "both"', () => {
    useLayoutPresets
      .getState()
      .createUserPreset('DashOnly', leaf(), 'dashboard');
    useLayoutPresets.getState().createUserPreset('WtOnly', leaf(), 'worktree');

    const dash = useLayoutPresets.getState().presetsForScope('dashboard');
    const wt = useLayoutPresets.getState().presetsForScope('worktree');

    expect(dash.some((p) => p.name === 'DashOnly')).toBe(true);
    expect(dash.some((p) => p.name === 'WtOnly')).toBe(false);
    expect(wt.some((p) => p.name === 'WtOnly')).toBe(true);
    expect(wt.some((p) => p.name === 'DashOnly')).toBe(false);

    // "both"-scoped built-ins appear in both
    expect(dash.some((p) => p.id === 'builtin:single')).toBe(true);
    expect(wt.some((p) => p.id === 'builtin:single')).toBe(true);
  });
});

describe('updateUserPresetTree', () => {
  it('replaces the tree', () => {
    const p = useLayoutPresets.getState().createUserPreset('Tree', leaf());
    useLayoutPresets.getState().updateUserPresetTree(p.id, col(leaf(), leaf()));
    const updated = useLayoutPresets.getState().findPreset(p.id)!;
    expect(updated.tree).toEqual({
      type: 'split',
      direction: 'column',
      children: [{ type: 'leaf' }, { type: 'leaf' }],
    });
  });
});
