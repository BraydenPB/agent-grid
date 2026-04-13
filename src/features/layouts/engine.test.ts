import { describe, it, expect } from 'vitest';
import type { Pane } from '@/types';
import { BUILTIN_PRESETS, findBuiltinByName } from './builtin-presets';
import {
  applyPresetToPanes,
  assignLeafIndices,
  treeToDockviewOps,
} from './engine';
import { col, leaf, row, leafCount } from './types';

let seq = 0;
const makePane = (profileId: string): Pane => ({
  id: `p${++seq}`,
  profileId,
  title: 'test',
});

describe('treeToDockviewOps', () => {
  it('single leaf has no reference', () => {
    const ops = treeToDockviewOps(leaf());
    expect(ops).toEqual([{ leafIndex: 0, reference: undefined }]);
  });

  it('side by side: second leaf is right of first', () => {
    const ops = treeToDockviewOps(row(leaf(), leaf()));
    expect(ops).toEqual([
      { leafIndex: 0, reference: undefined },
      { leafIndex: 1, reference: { leafIndex: 0, direction: 'right' } },
    ]);
  });

  it('column stack: second leaf is below first', () => {
    const ops = treeToDockviewOps(col(leaf(), leaf()));
    expect(ops).toEqual([
      { leafIndex: 0, reference: undefined },
      { leafIndex: 1, reference: { leafIndex: 0, direction: 'below' } },
    ]);
  });

  it('1 + 2 stack: row(leaf, col(leaf, leaf))', () => {
    // Matches the legacy "1 + 2 Stack" preset topology
    const ops = treeToDockviewOps(row(leaf(), col(leaf(), leaf())));
    expect(ops).toEqual([
      { leafIndex: 0, reference: undefined },
      { leafIndex: 1, reference: { leafIndex: 0, direction: 'right' } },
      { leafIndex: 2, reference: { leafIndex: 1, direction: 'below' } },
    ]);
  });

  it('2x2 grid: col(row, row) — second row anchors off first-of-previous-sibling', () => {
    const ops = treeToDockviewOps(
      col(row(leaf(), leaf()), row(leaf(), leaf())),
    );
    expect(ops).toEqual([
      { leafIndex: 0, reference: undefined },
      { leafIndex: 1, reference: { leafIndex: 0, direction: 'right' } },
      { leafIndex: 2, reference: { leafIndex: 0, direction: 'below' } },
      { leafIndex: 3, reference: { leafIndex: 2, direction: 'right' } },
    ]);
  });

  it('all built-in presets produce op count equal to leaf count', () => {
    for (const preset of BUILTIN_PRESETS) {
      const ops = treeToDockviewOps(preset.tree);
      expect(ops).toHaveLength(leafCount(preset.tree));
      expect(ops[0]?.reference).toBeUndefined();
    }
  });
});

describe('assignLeafIndices', () => {
  it('numbers leaves in pre-order traversal', () => {
    const indexed = assignLeafIndices(row(leaf(), col(leaf(), leaf())));
    expect(indexed).toEqual({
      type: 'split',
      direction: 'row',
      children: [
        { type: 'leaf', leafIndex: 0, weight: undefined },
        {
          type: 'split',
          direction: 'column',
          children: [
            { type: 'leaf', leafIndex: 1, weight: undefined },
            { type: 'leaf', leafIndex: 2, weight: undefined },
          ],
        },
      ],
    });
  });
});

describe('applyPresetToPanes', () => {
  const preset = findBuiltinByName('2×2 Grid')!;

  it('creates missing panes to reach required leaf count', () => {
    seq = 0;
    const result = applyPresetToPanes(preset, [], makePane, 'shell');
    expect(result).toHaveLength(4);
    expect(result.every((p) => p.profileId === 'shell')).toBe(true);
  });

  it('preserves existing pane identities in order', () => {
    seq = 0;
    const existing = [makePane('a'), makePane('b')];
    const result = applyPresetToPanes(preset, existing, makePane, 'shell');
    expect(result[0]!.id).toBe(existing[0]!.id);
    expect(result[1]!.id).toBe(existing[1]!.id);
    expect(result).toHaveLength(4);
  });

  it('keeps surplus panes but leaves them unpositioned', () => {
    // Preserves pre-module behavior: dropping panes silently is destructive,
    // so `applyPresetToPanes` keeps extras and just clears their positioning.
    // The UI filters presets by leaf count, so surplus panes only happen
    // when the store API is called directly.
    seq = 0;
    const existing = [makePane('a'), makePane('b'), makePane('c')];
    const singlePreset = findBuiltinByName('Single')!;
    const result = applyPresetToPanes(
      singlePreset,
      existing,
      makePane,
      'shell',
    );
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.id)).toEqual(existing.map((p) => p.id));
    expect(result[0]!.dockviewPosition).toEqual({});
    expect(result[1]!.dockviewPosition).toBeUndefined();
    expect(result[2]!.dockviewPosition).toBeUndefined();
  });

  it('sets dockviewPosition referenceId by pane id, not index', () => {
    seq = 0;
    const result = applyPresetToPanes(preset, [], makePane, 'shell');
    expect(result[0]!.dockviewPosition).toEqual({});
    expect(result[1]!.dockviewPosition).toEqual({
      referenceId: result[0]!.id,
      direction: 'right',
    });
    expect(result[2]!.dockviewPosition).toEqual({
      referenceId: result[0]!.id,
      direction: 'below',
    });
    expect(result[3]!.dockviewPosition).toEqual({
      referenceId: result[2]!.id,
      direction: 'right',
    });
  });

  it('clears splitFrom hints (preset takes precedence)', () => {
    seq = 0;
    const existing: Pane[] = [
      {
        ...makePane('a'),
        splitFrom: { paneId: 'other', direction: 'below' },
      },
    ];
    const result = applyPresetToPanes(preset, existing, makePane, 'shell');
    expect(result[0]!.splitFrom).toBeUndefined();
  });
});

describe('built-in preset roundtrip vs legacy grid-presets', () => {
  // The legacy grid-presets.ts is now derived from BUILTIN_PRESETS. This
  // test locks in the public shape so downstream consumers keep working.
  it('every built-in has name + leaf-count matching legacy panelCount', async () => {
    const { GRID_PRESETS } = await import('@/lib/grid-presets');
    expect(GRID_PRESETS.map((p) => p.name)).toEqual(
      BUILTIN_PRESETS.map((p) => p.name),
    );
    for (const legacy of GRID_PRESETS) {
      const modern = findBuiltinByName(legacy.name)!;
      expect(legacy.panelCount).toBe(leafCount(modern.tree));
      expect(legacy.positions).toHaveLength(legacy.panelCount);
    }
  });
});
