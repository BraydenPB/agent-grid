/**
 * Built-in layout presets — the 7 curated arrangements we ship out of the box.
 *
 * Each preset is a declarative tree; the engine converts that tree into
 * flex containers (dashboard) or Dockview `addPanel` ops (worktree).
 *
 * Order matters: legacy consumers slice the first N entries to build
 * compact toolbars (sidebar, command palette). Keep "Single" first.
 */

import type { LayoutPreset } from './types';
import { col, leaf, row } from './types';

const now = '2026-01-01T00:00:00.000Z';

function builtin(
  id: string,
  name: string,
  tree: LayoutPreset['tree'],
  description?: string,
): LayoutPreset {
  return {
    id: `builtin:${id}`,
    name,
    description,
    tree,
    builtin: true,
    scope: 'both',
    createdAt: now,
    updatedAt: now,
  };
}

// Helpers for repeated-leaf rows/cols so the table below reads cleanly.
const nLeaves = (n: number) => Array.from({ length: n }, () => leaf());
const rowN = (n: number) => row(...nLeaves(n));
const colN = (n: number) => col(...nLeaves(n));

export const BUILTIN_PRESETS: LayoutPreset[] = [
  // ── 1 pane ────────────────────────────────────────────────────────────
  builtin('single', 'Single', leaf(), 'One full-size terminal'),

  // ── 2 panes ───────────────────────────────────────────────────────────
  builtin(
    'side-by-side',
    'Side by Side',
    row(leaf(), leaf()),
    'Two terminals, left and right',
  ),
  builtin(
    'stacked',
    'Stacked',
    col(leaf(), leaf()),
    'Two terminals, top and bottom',
  ),

  // ── 3 panes ───────────────────────────────────────────────────────────
  builtin('three-col', '3 Column', rowN(3), 'Three terminals in a row'),
  builtin('three-row', '3 Row', colN(3), 'Three terminals stacked vertically'),
  builtin(
    'main-plus-2-right',
    '1 + 2 Stack',
    row(leaf(), col(leaf(), leaf())),
    'Main pane on the left, two stacked on the right',
  ),
  builtin(
    '2-left-main-right',
    '2 + 1 Stack',
    row(col(leaf(), leaf()), leaf()),
    'Two stacked on the left, main pane on the right',
  ),

  // ── 4 panes ───────────────────────────────────────────────────────────
  builtin('four-col', '4 Column', rowN(4), 'Four terminals in a row'),
  builtin('four-row', '4 Row', colN(4), 'Four terminals stacked vertically'),
  builtin(
    '2x2',
    '2×2 Grid',
    col(row(leaf(), leaf()), row(leaf(), leaf())),
    'Four equal quadrants',
  ),
  builtin(
    'main-plus-3-right',
    '1 + 3 Stack',
    row(leaf(), col(leaf(), leaf(), leaf())),
    'Main pane on the left, three stacked on the right',
  ),
  builtin(
    '3-top-main-bottom',
    '3 Top, 1 Bottom',
    col(row(leaf(), leaf(), leaf()), leaf()),
    'Three across the top, one full-width below',
  ),

  // ── 5 panes ───────────────────────────────────────────────────────────
  builtin('five-col', '5 Column', rowN(5), 'Five terminals in a row'),
  builtin(
    'main-plus-4-right',
    '1 + 4 Stack',
    row(leaf(), col(leaf(), leaf(), leaf(), leaf())),
    'Main pane on the left, four stacked on the right',
  ),

  // ── 6 panes ───────────────────────────────────────────────────────────
  builtin(
    '2x3',
    '2×3 Grid',
    col(row(leaf(), leaf(), leaf()), row(leaf(), leaf(), leaf())),
    'Six terminals, 3 across, 2 down',
  ),
  builtin(
    '3x2',
    '3×2 Grid',
    col(row(leaf(), leaf()), row(leaf(), leaf()), row(leaf(), leaf())),
    'Six terminals, 2 across, 3 down',
  ),
  builtin('six-col', '6 Column', rowN(6), 'Six terminals in a row'),

  // ── 8 panes ───────────────────────────────────────────────────────────
  builtin(
    '4x2',
    '2×4 Grid (8 panes)',
    col(
      row(leaf(), leaf(), leaf(), leaf()),
      row(leaf(), leaf(), leaf(), leaf()),
    ),
    'Eight terminals, 4 across, 2 down',
  ),
  builtin(
    '2x4',
    '4×2 Grid (8 panes)',
    col(
      row(leaf(), leaf()),
      row(leaf(), leaf()),
      row(leaf(), leaf()),
      row(leaf(), leaf()),
    ),
    'Eight terminals, 2 across, 4 down',
  ),
  builtin('eight-col', '8 Column', rowN(8), 'Eight terminals in a row'),
];

/** Look up a built-in preset by display name (legacy identifier). */
export function findBuiltinByName(name: string): LayoutPreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.name === name);
}

/** Look up a preset by id (builtin or user). */
export function findBuiltinById(id: string): LayoutPreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id);
}
