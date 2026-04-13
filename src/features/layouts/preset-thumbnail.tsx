/**
 * Auto-generated SVG preview of a LayoutPreset. Walks the tree and emits
 * one rect per leaf in the correct arrangement. Used by the layout picker.
 */

import type { LayoutNode } from './types';

interface PresetThumbnailProps {
  tree: LayoutNode;
  size?: number;
  highlighted?: boolean;
  className?: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function layoutRects(
  node: LayoutNode,
  bbox: Rect,
  out: Rect[],
  gap: number,
): void {
  if (node.type === 'leaf') {
    out.push(bbox);
    return;
  }

  const totalWeight = node.children.reduce(
    (s, c) => s + (c.type === 'leaf' ? (c.weight ?? 1) : 1),
    0,
  );
  const axis = node.direction === 'row' ? 'x' : 'y';
  const span = axis === 'x' ? bbox.w : bbox.h;
  const totalGap = gap * (node.children.length - 1);
  const usable = span - totalGap;

  let offset = axis === 'x' ? bbox.x : bbox.y;
  node.children.forEach((child) => {
    const w = child.type === 'leaf' ? (child.weight ?? 1) : 1;
    const share = (usable * w) / totalWeight;
    const childBox: Rect =
      axis === 'x'
        ? { x: offset, y: bbox.y, w: share, h: bbox.h }
        : { x: bbox.x, y: offset, w: bbox.w, h: share };
    layoutRects(child, childBox, out, gap);
    offset += share + gap;
  });
}

export function PresetThumbnail({
  tree,
  size = 40,
  highlighted,
  className,
}: PresetThumbnailProps) {
  const rects: Rect[] = [];
  const pad = 2;
  layoutRects(
    tree,
    { x: pad, y: pad, w: size - pad * 2, h: size - pad * 2 },
    rects,
    1.5,
  );

  const fill = highlighted
    ? 'rgb(96 165 250 / 0.35)'
    : 'rgb(255 255 255 / 0.08)';
  const stroke = highlighted
    ? 'rgb(96 165 250 / 0.9)'
    : 'rgb(255 255 255 / 0.2)';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-hidden="true"
    >
      <rect
        x={0.5}
        y={0.5}
        width={size - 1}
        height={size - 1}
        rx={3}
        fill="transparent"
        stroke="rgb(255 255 255 / 0.06)"
      />
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={1.5}
          fill={fill}
          stroke={stroke}
          strokeWidth={0.75}
        />
      ))}
    </svg>
  );
}
