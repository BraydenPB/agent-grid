// Dockview-compatible grid presets
// Each preset defines how to position N panels using Dockview's referencePanel + direction API

export interface GridPresetLayout {
  name: string;
  panelCount: number;
  // Each panel's positioning (null for first panel, then reference index + direction)
  positions: Array<{
    referenceIndex?: number; // null/undefined = first panel
    direction?: 'right' | 'below';
  }>;
}

export const GRID_PRESETS: GridPresetLayout[] = [
  {
    name: 'Single',
    panelCount: 1,
    positions: [{}], // No position for first panel
  },
  {
    name: 'Side by Side',
    panelCount: 2,
    positions: [
      {}, // Panel 0: fills
      { referenceIndex: 0, direction: 'right' }, // Panel 1: right of 0
    ],
  },
  {
    name: '2×2 Grid',
    panelCount: 4,
    positions: [
      {}, // Panel 0: fills
      { referenceIndex: 0, direction: 'right' }, // Panel 1: right of 0
      { referenceIndex: 0, direction: 'below' }, // Panel 2: below 0
      { referenceIndex: 1, direction: 'below' }, // Panel 3: below 1
    ],
  },
  {
    name: '1 + 2 Stack',
    panelCount: 3,
    positions: [
      {}, // Panel 0: fills
      { referenceIndex: 0, direction: 'right' }, // Panel 1: right of 0
      { referenceIndex: 1, direction: 'below' }, // Panel 2: below 1
    ],
  },
  {
    name: '3 Column',
    panelCount: 3,
    positions: [
      {}, // Panel 0: fills
      { referenceIndex: 0, direction: 'right' }, // Panel 1: right of 0
      { referenceIndex: 1, direction: 'right' }, // Panel 2: right of 1
    ],
  },
  {
    name: '2×3 Grid',
    panelCount: 6,
    positions: [
      {}, // 0
      { referenceIndex: 0, direction: 'right' }, // 1: right of 0
      { referenceIndex: 1, direction: 'right' }, // 2: right of 1
      { referenceIndex: 0, direction: 'below' }, // 3: below 0
      { referenceIndex: 3, direction: 'right' }, // 4: right of 3
      { referenceIndex: 4, direction: 'right' }, // 5: right of 4
    ],
  },
  {
    name: '2×2×2 Grid (8 panes)',
    panelCount: 8,
    positions: [
      {}, // 0
      { referenceIndex: 0, direction: 'right' }, // 1: right of 0
      { referenceIndex: 0, direction: 'below' }, // 2: below 0
      { referenceIndex: 1, direction: 'below' }, // 3: below 1
      { referenceIndex: 2, direction: 'below' }, // 4: below 2
      { referenceIndex: 3, direction: 'below' }, // 5: below 3
      { referenceIndex: 4, direction: 'below' }, // 6: below 4
      { referenceIndex: 5, direction: 'below' }, // 7: below 5
    ],
  },
];
