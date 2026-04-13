/**
 * Recursive renderer that turns a LayoutPreset tree into nested flex
 * containers, with one slot per leaf (indexed left-to-right, top-to-bottom).
 *
 * Used by the dashboard to replace the hardcoded `grid-cols-* grid-rows-*`
 * mapping with something that works for any tree shape.
 */

import type { ReactNode } from 'react';
import { assignLeafIndices, type IndexedNode } from './engine';
import type { LayoutNode } from './types';

interface TileTreeProps {
  tree: LayoutNode;
  /** How many terminals are actually open. Extra leaves render as empty slots. */
  tileCount: number;
  /** Renders the terminal at a given leaf index. */
  renderLeaf: (leafIndex: number) => ReactNode;
  /** Renders an unfilled leaf (no terminal for that slot). Optional. */
  renderEmpty?: (leafIndex: number) => ReactNode;
  /** Gap between siblings in pixels. */
  gap?: number;
}

function renderNode(
  node: IndexedNode,
  tileCount: number,
  renderLeaf: (i: number) => ReactNode,
  renderEmpty: ((i: number) => ReactNode) | undefined,
  gap: number,
): ReactNode {
  if (node.type === 'leaf') {
    const filled = node.leafIndex < tileCount;
    return (
      <div
        key={`leaf-${node.leafIndex}`}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        style={{ flexGrow: node.weight ?? 1 }}
      >
        {filled
          ? renderLeaf(node.leafIndex)
          : (renderEmpty?.(node.leafIndex) ?? null)}
      </div>
    );
  }

  return (
    <div
      key={`split-${node.direction}`}
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      style={{
        flexDirection: node.direction === 'row' ? 'row' : 'column',
        gap: `${gap}px`,
      }}
    >
      {node.children.map((c, i) => (
        <RenderWrapper
          key={i}
          child={c}
          tileCount={tileCount}
          renderLeaf={renderLeaf}
          renderEmpty={renderEmpty}
          gap={gap}
        />
      ))}
    </div>
  );
}

function RenderWrapper({
  child,
  tileCount,
  renderLeaf,
  renderEmpty,
  gap,
}: {
  child: IndexedNode;
  tileCount: number;
  renderLeaf: (i: number) => ReactNode;
  renderEmpty?: (i: number) => ReactNode;
  gap: number;
}) {
  return <>{renderNode(child, tileCount, renderLeaf, renderEmpty, gap)}</>;
}

export function TileTree({
  tree,
  tileCount,
  renderLeaf,
  renderEmpty,
  gap = 1,
}: TileTreeProps) {
  const indexed = assignLeafIndices(tree);
  return <>{renderNode(indexed, tileCount, renderLeaf, renderEmpty, gap)}</>;
}
