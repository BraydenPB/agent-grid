/**
 * Unified layout module — shared schema for dashboard tile grids and
 * worktree Dockview splits.
 *
 * A LayoutPreset is a recursive tree of splits and leaves. The same tree
 * drives:
 *   - CSS grid resolution for the dashboard (preview tiles)
 *   - Dockview panel placement for the focused worktree
 *   - SVG thumbnail rendering in the picker UI
 */

/**
 * A single terminal slot in a layout. `weight` is a relative flex share
 * among siblings in the same split (defaults to 1).
 */
export interface LayoutLeaf {
  type: 'leaf';
  weight?: number;
}

/**
 * A container that splits its children along one axis.
 *   - `row`    → children laid out left-to-right (horizontal split)
 *   - `column` → children laid out top-to-bottom (vertical split)
 */
export interface LayoutSplit {
  type: 'split';
  direction: 'row' | 'column';
  children: LayoutNode[];
}

export type LayoutNode = LayoutLeaf | LayoutSplit;

/** Where a preset is allowed to be applied. */
export type LayoutScope = 'dashboard' | 'worktree' | 'both';

export interface LayoutPreset {
  /** Stable identifier — `builtin:<slug>` or `user:<id>`. */
  id: string;
  /** Display name (unique per scope). */
  name: string;
  /** Optional longer description. */
  description?: string;
  /** Root of the split tree. */
  tree: LayoutNode;
  /** True for library-provided presets, false for user-saved. */
  builtin: boolean;
  /** Which surfaces can use this preset. */
  scope: LayoutScope;
  createdAt: string;
  updatedAt: string;
}

/** Derived: count of leaves in the tree. */
export function leafCount(node: LayoutNode): number {
  if (node.type === 'leaf') return 1;
  return node.children.reduce((n, c) => n + leafCount(c), 0);
}

/** Build a leaf. */
export function leaf(weight?: number): LayoutLeaf {
  return weight === undefined ? { type: 'leaf' } : { type: 'leaf', weight };
}

/** Build a horizontal split (children placed left-to-right). */
export function row(...children: LayoutNode[]): LayoutSplit {
  return { type: 'split', direction: 'row', children };
}

/** Build a vertical split (children placed top-to-bottom). */
export function col(...children: LayoutNode[]): LayoutSplit {
  return { type: 'split', direction: 'column', children };
}
