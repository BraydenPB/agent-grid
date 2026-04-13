/**
 * Legacy compatibility shim — existing callers import `GRID_PRESETS` from
 * this file. The canonical source of truth is now `@/features/layouts`.
 *
 * The data below is derived at module load time so the two can never drift.
 * Shape is intentionally identical to the original:
 *   { name, panelCount, positions: [{referenceIndex?, direction?}, ...] }
 */

import {
  BUILTIN_PRESETS,
  leafCount,
  treeToDockviewOps,
} from '@/features/layouts';

export interface GridPresetLayout {
  name: string;
  panelCount: number;
  positions: Array<{
    referenceIndex?: number;
    direction?: 'right' | 'below';
  }>;
}

function toLegacy(preset: (typeof BUILTIN_PRESETS)[number]): GridPresetLayout {
  const ops = treeToDockviewOps(preset.tree);
  return {
    name: preset.name,
    panelCount: leafCount(preset.tree),
    positions: ops.map((op) =>
      op.reference
        ? {
            referenceIndex: op.reference.leafIndex,
            direction: op.reference.direction,
          }
        : {},
    ),
  };
}

export const GRID_PRESETS: GridPresetLayout[] = BUILTIN_PRESETS.map(toLegacy);
