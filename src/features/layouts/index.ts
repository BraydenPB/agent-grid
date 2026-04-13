/**
 * Unified layout module — declarative preset trees that drive both the
 * dashboard's flex-based tile grid and the worktree's Dockview splits.
 *
 * Consumer surface:
 *   - Types:            LayoutNode, LayoutPreset, LayoutScope
 *   - Presets:          BUILTIN_PRESETS, findBuiltinByName, findBuiltinById
 *   - Engine:           applyPresetToPanes, treeToDockviewOps,
 *                       captureDockviewLayout, assignLeafIndices
 *   - Components:       TileTree, PresetThumbnail, LayoutPicker
 *   - Store:            useLayoutPresets
 */

export type {
  LayoutNode,
  LayoutLeaf,
  LayoutSplit,
  LayoutPreset,
  LayoutScope,
} from './types';
export { leaf, row, col, leafCount } from './types';

export {
  BUILTIN_PRESETS,
  findBuiltinByName,
  findBuiltinById,
} from './builtin-presets';

export {
  assignLeafIndices,
  treeToDockviewOps,
  applyPresetToPanes,
  captureDockviewLayout,
  type DockviewOp,
  type IndexedNode,
} from './engine';

export { TileTree } from './tile-tree';
export { PresetThumbnail } from './preset-thumbnail';
export { LayoutPicker } from './layout-picker';
export { useLayoutPresets } from './preset-store';

// LayoutControl pulls in the workspace store, which pulls in `tauri-pty`.
// Importing it through the barrel would poison pure contexts (tests, node
// tooling). Import directly from `@/features/layouts/layout-control` instead.
