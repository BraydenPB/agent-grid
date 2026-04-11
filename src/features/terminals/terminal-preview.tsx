import { useEffect, useRef, useState, useCallback } from 'react';
import { getTerminalEntry } from '@/lib/terminal-registry';

interface TerminalPreviewProps {
  paneId: string;
}

/**
 * Lightweight read-only preview of a terminal.
 *
 * Grabs the existing terminal entry from the registry and appends its DOM
 * element into the preview container, scaled down with CSS transform.
 * pointer-events are disabled so clicks pass through to the parent card.
 * No PTY spawning, no keyboard handlers, no addons loaded.
 */
export function TerminalPreview({ paneId }: TerminalPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.35);
  const [hasEntry, setHasEntry] = useState(false);

  const recalcScale = useCallback(() => {
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;

    const containerWidth = container.clientWidth;
    const terminalWidth = wrapper.scrollWidth;
    if (terminalWidth > 0) {
      setScale(Math.min(1, containerWidth / terminalWidth));
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const entry = getTerminalEntry(paneId);
    if (!entry) {
      setHasEntry(false);
      return;
    }

    setHasEntry(true);

    // Create a wrapper div for the terminal element
    const wrapper = document.createElement('div');
    wrapper.style.pointerEvents = 'none';
    wrapper.style.transformOrigin = 'top left';
    wrapper.style.position = 'absolute';
    wrapper.style.top = '0';
    wrapper.style.left = '0';

    wrapper.appendChild(entry.element);
    wrapperRef.current = wrapper;
    container.appendChild(wrapper);

    // Calculate initial scale after a frame so dimensions are known
    requestAnimationFrame(() => {
      const containerWidth = container.clientWidth;
      const terminalWidth = wrapper.scrollWidth;
      if (terminalWidth > 0) {
        setScale(Math.min(1, containerWidth / terminalWidth));
      }
    });

    // Watch container size changes
    const observer = new ResizeObserver(recalcScale);
    observer.observe(container);

    return () => {
      observer.disconnect();
      // Detach the terminal element (keep it alive in registry)
      if (entry.element.parentNode === wrapper) {
        wrapper.removeChild(entry.element);
      }
      if (wrapper.parentNode === container) {
        container.removeChild(wrapper);
      }
      wrapperRef.current = null;
    };
  }, [paneId, recalcScale]);

  // Apply scale transform
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (wrapper) {
      wrapper.style.transform = `scale(${scale})`;
    }
  }, [scale]);

  if (!hasEntry) return null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-lg bg-[#0a0a0f]"
      style={{ pointerEvents: 'none' }}
    />
  );
}
