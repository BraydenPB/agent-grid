import type { GridPreset, PaneLayout } from "@/types";

function makeLayout(x: number, y: number, w: number, h: number): PaneLayout {
  return { x, y, w, h, minW: 1, minH: 1 };
}

export const GRID_PRESETS: GridPreset[] = [
  {
    name: "Single",
    cols: 12,
    layouts: [makeLayout(0, 0, 12, 12)],
  },
  {
    name: "Side by Side",
    cols: 12,
    layouts: [makeLayout(0, 0, 6, 12), makeLayout(6, 0, 6, 12)],
  },
  {
    name: "2×2 Grid",
    cols: 12,
    layouts: [
      makeLayout(0, 0, 6, 6),
      makeLayout(6, 0, 6, 6),
      makeLayout(0, 6, 6, 6),
      makeLayout(6, 6, 6, 6),
    ],
  },
  {
    name: "1 + 2 Stack",
    cols: 12,
    layouts: [
      makeLayout(0, 0, 6, 12),
      makeLayout(6, 0, 6, 6),
      makeLayout(6, 6, 6, 6),
    ],
  },
  {
    name: "3 Column",
    cols: 12,
    layouts: [
      makeLayout(0, 0, 4, 12),
      makeLayout(4, 0, 4, 12),
      makeLayout(8, 0, 4, 12),
    ],
  },
  {
    name: "2×3 Grid",
    cols: 12,
    layouts: [
      makeLayout(0, 0, 4, 6),
      makeLayout(4, 0, 4, 6),
      makeLayout(8, 0, 4, 6),
      makeLayout(0, 6, 4, 6),
      makeLayout(4, 6, 4, 6),
      makeLayout(8, 6, 4, 6),
    ],
  },
  {
    name: "4×4 Grid",
    cols: 12,
    layouts: Array.from({ length: 16 }, (_, i) =>
      makeLayout((i % 4) * 3, Math.floor(i / 4) * 3, 3, 3)
    ),
  },
];
