/**
 * Unified layout engine — converts a declarative LayoutPreset tree into the
 * operations required by the two layout backends:
 *
 *   - Dashboard (Level 2): a recursive <div> flex tree with one terminal tile
 *     per leaf. See `assignLeafIndices`.
 *
 *   - Worktree (Level 3): Dockview `addPanel` operations with reference/direction
 *     hints. See `treeToDockviewOps` and `applyPresetToPanes`.
 *
 * Also provides `captureDockviewLayout` — the inverse direction, turning the
 * user's current Dockview arrangement into a preset tree that can be saved.
 */

import type { DockviewApi } from 'dockview';
import type { Pane } from '@/types';
import type { LayoutNode, LayoutPreset } from './types';
import { leafCount } from './types';

/* ── Dashboard: tree with indexed leaves ────────────────────────────────── */

export type IndexedNode =
  | { type: 'leaf'; leafIndex: number; weight?: number }
  | {
      type: 'split';
      direction: 'row' | 'column';
      children: IndexedNode[];
    };

/**
 * Walk the preset tree and assign each leaf a 0-based index in
 * left-to-right, top-to-bottom traversal order. That index aligns with
 * the `tiles[]` array the dashboard renders and with the `panes[]` array
 * the worktree renders.
 */
export function assignLeafIndices(node: LayoutNode): IndexedNode {
  let i = 0;
  function walk(n: LayoutNode): IndexedNode {
    if (n.type === 'leaf') {
      return { type: 'leaf', leafIndex: i++, weight: n.weight };
    }
    return {
      type: 'split',
      direction: n.direction,
      children: n.children.map(walk),
    };
  }
  return walk(node);
}

/* ── Worktree: preset tree → Dockview insertion ops ─────────────────────── */

export interface DockviewOp {
  /** The 0-based leaf index in the preset tree. */
  leafIndex: number;
  /**
   * Where to dock this leaf. `undefined` = root panel (the first leaf).
   * Otherwise `leafIndex` references the panel produced by an earlier op.
   */
  reference?: {
    leafIndex: number;
    direction: 'right' | 'below';
  };
}

/**
 * Convert a preset tree into an ordered list of Dockview placement ops.
 *
 * Algorithm: depth-first pre-order. Within any split, the i-th child
 * (for i > 0) is attached to the *first leaf* of the previous sibling,
 * in the split's direction. This yields a topology compatible with
 * Dockview's groupless layout tree.
 */
export function treeToDockviewOps(node: LayoutNode): DockviewOp[] {
  const ops: DockviewOp[] = [];
  let i = 0;

  function walk(n: LayoutNode, anchor: DockviewOp['reference'] | null): number {
    if (n.type === 'leaf') {
      const leafIndex = i++;
      ops.push({
        leafIndex,
        reference: anchor ?? undefined,
      });
      return leafIndex;
    }

    const firstLeaves: number[] = [];
    n.children.forEach((child, childIdx) => {
      if (childIdx === 0) {
        firstLeaves.push(walk(child, anchor));
      } else {
        const prev = firstLeaves[childIdx - 1]!;
        const dir: 'right' | 'below' =
          n.direction === 'row' ? 'right' : 'below';
        firstLeaves.push(walk(child, { leafIndex: prev, direction: dir }));
      }
    });
    return firstLeaves[0]!;
  }

  walk(node, null);
  return ops;
}

/**
 * Apply a preset to a worktree's pane list. Produces a new `Pane[]` whose
 * `dockviewPosition` fields match the preset topology.
 *
 *   - Missing panes are created via `createPane(profileId)` to reach the
 *     preset's leaf count.
 *   - Pane identities are preserved in order (pane[i] stays pane[i]).
 *   - Extra panes beyond `leafCount(preset.tree)` are kept in the list but
 *     left unpositioned (so Dockview's default placement wins). Not dropped.
 *     This matches the pre-module behavior consumers relied on.
 */
export function applyPresetToPanes(
  preset: LayoutPreset,
  existingPanes: Pane[],
  createPane: (profileId: string) => Pane,
  profileId: string,
): Pane[] {
  const required = leafCount(preset.tree);
  const ops = treeToDockviewOps(preset.tree);

  const panes = [...existingPanes];
  while (panes.length < required) panes.push(createPane(profileId));

  // Index for op lookup — the first `required` panes get positioned by the
  // preset; anything after is left unpositioned.
  return panes.map((pane, i) => {
    if (i >= required) {
      return { ...pane, dockviewPosition: undefined, splitFrom: undefined };
    }
    const op = ops[i]!;
    if (!op.reference) {
      return { ...pane, dockviewPosition: {}, splitFrom: undefined };
    }
    return {
      ...pane,
      dockviewPosition: {
        referenceId: panes[op.reference.leafIndex]!.id,
        direction: op.reference.direction,
      },
      splitFrom: undefined,
    };
  });
}

/* ── Worktree → preset: capture current Dockview state as a tree ───────── */

/**
 * Dockview's serialized layout uses a branch/leaf tree under `grid.root`,
 * with branches containing sized children and leaves referencing a group
 * of panels. We walk that tree and collapse each group-of-panels into a
 * single `leaf` in our preset format.
 *
 * Invariant: Dockview's `orientation` values map to our directions —
 *   HORIZONTAL → 'row', VERTICAL → 'column'.
 */

interface DockviewGridNode {
  type: 'branch' | 'leaf';
  data?: unknown;
  size?: number;
}

interface DockviewBranch extends DockviewGridNode {
  type: 'branch';
  data: DockviewGridNode[];
}

interface DockviewGroup {
  views?: string[];
}

function isBranch(n: unknown): n is DockviewBranch {
  return (
    typeof n === 'object' &&
    n !== null &&
    (n as DockviewGridNode).type === 'branch' &&
    Array.isArray((n as DockviewBranch).data)
  );
}

function isLeaf(n: unknown): boolean {
  return (
    typeof n === 'object' &&
    n !== null &&
    (n as DockviewGridNode).type === 'leaf'
  );
}

/**
 * Capture the current Dockview layout as a preset tree. Returns `null` if
 * the layout can't be captured (e.g. the API has no panels).
 *
 * Grouped tabs (multiple panels sharing one tab strip) collapse to a single
 * leaf — the preset system treats the group as one pane slot.
 */
export function captureDockviewLayout(api: DockviewApi): LayoutNode | null {
  try {
    const json = api.toJSON() as {
      grid?: {
        root?: DockviewGridNode;
        orientation?: 'HORIZONTAL' | 'VERTICAL';
      };
    };
    const root = json?.grid?.root;
    const rootOrientation = json?.grid?.orientation ?? 'HORIZONTAL';
    if (!root) return null;

    function walk(
      node: DockviewGridNode,
      axis: 'row' | 'column',
    ): LayoutNode | null {
      if (isLeaf(node)) {
        const group = (node as { data?: DockviewGroup }).data;
        if (!group || !Array.isArray(group.views) || group.views.length === 0) {
          return null;
        }
        return { type: 'leaf' };
      }
      if (isBranch(node)) {
        const children = node.data
          .map((c) => walk(c, axis === 'row' ? 'column' : 'row'))
          .filter((c): c is LayoutNode => c !== null);
        if (children.length === 0) return null;
        if (children.length === 1) return children[0]!;
        return { type: 'split', direction: axis, children };
      }
      return null;
    }

    return walk(root, rootOrientation === 'HORIZONTAL' ? 'row' : 'column');
  } catch {
    return null;
  }
}
