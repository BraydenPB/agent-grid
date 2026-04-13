/**
 * Terminal Registry — manages xterm Terminal + PTY instances outside React lifecycle.
 *
 * When Dockview rearranges panels (preset switch), React components unmount and
 * remount. The registry keeps Terminal/PTY instances alive so they can be
 * reattached to new DOM containers without losing scroll history or running processes.
 *
 * The registry also owns two perf-critical pools:
 *   - WebGL addon LRU: only a handful of panes can hold a WebGL2 context at once
 *     (browsers cap around 16). Keeping WebGL on every pane triggers context
 *     eviction + endless re-create loops. Inactive panes fall back to xterm's
 *     DOM renderer, which is fine for background work.
 *   - Write buffer: PTY output for hidden panes is queued (not parsed) until the
 *     pane becomes visible again. This removes the main-thread parser cost for
 *     background terminals — the complaint driving this design.
 */

import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { SearchAddon } from '@xterm/addon-search';
import type { SerializeAddon } from '@xterm/addon-serialize';
import { WebglAddon } from '@xterm/addon-webgl';
import type { ShimPty } from '@/lib/tauri-shim';

export interface TerminalEntry {
  terminal: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon | null;
  serializeAddon: SerializeAddon | null;
  pty: ShimPty | null;
  /** The xterm container div — detached from DOM during rearrange, reattached after */
  element: HTMLDivElement;
  /** PTY event disposables that need cleanup on true destroy */
  ptyDisposables: { dispose: () => void }[];
  /** Sequence counter for PTY spawns — prevents stale spawn races */
  spawnSeq: number;
  /** Current font size */
  fontSize: number;
  /** Profile ID this terminal was created with */
  profileId: string;
  /** Current working directory */
  cwd: string;
  /** Active WebGL addon, if this pane currently holds one from the pool */
  webglAddon: WebglAddon | null;
  /** If true this pane opts out of WebGL entirely (e.g. dashboard tiles) */
  preferDomRenderer: boolean;
  /** PTY output queued while the pane was off-screen */
  writeBuffer: Uint8Array[];
  writeBufferSize: number;
  /** Set when the hidden-buffer cap forced us to drop chunks */
  writeBufferTruncated: boolean;
  /** Driven by IntersectionObserver in terminal-pane */
  isVisible: boolean;
  /** Visibility observer for cleanup on destroy */
  visibilityObserver: IntersectionObserver | null;
}

const registry = new Map<string, TerminalEntry>();

export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 28;
export const FONT_SIZE_DEFAULT = 10;

/** Browsers cap WebGL contexts around 16. Stay well below to leave headroom. */
const WEBGL_POOL_CAP = 6;
/** Hard cap on per-pane hidden buffer. Beyond this we drop oldest chunks. */
const MAX_HIDDEN_BUFFER_BYTES = 8 * 1024 * 1024;

/** paneId → last-used timestamp for WebGL LRU eviction */
const webglLru = new Map<string, number>();

export function getTerminalEntry(paneId: string): TerminalEntry | undefined {
  return registry.get(paneId);
}

function applyFontSize(entry: TerminalEntry, next: number): void {
  if (next === entry.fontSize) return;
  entry.fontSize = next;
  entry.terminal.options.fontSize = next;
  try {
    entry.fitAddon.fit();
  } catch {
    /* container not ready */
  }
}

export function zoomTerminalFont(paneId: string, delta: number): boolean {
  const entry = registry.get(paneId);
  if (!entry) return false;
  const next = Math.max(
    FONT_SIZE_MIN,
    Math.min(FONT_SIZE_MAX, entry.fontSize + delta),
  );
  applyFontSize(entry, next);
  return true;
}

export function resetTerminalFont(paneId: string): boolean {
  const entry = registry.get(paneId);
  if (!entry) return false;
  applyFontSize(entry, FONT_SIZE_DEFAULT);
  return true;
}

export function setTerminalEntry(paneId: string, entry: TerminalEntry): void {
  registry.set(paneId, entry);
}

export function removeTerminalEntry(paneId: string): TerminalEntry | undefined {
  const entry = registry.get(paneId);
  registry.delete(paneId);
  webglLru.delete(paneId);
  return entry;
}

/* ── WebGL pool ── */

function evictOldestWebgl(exceptPaneId: string): void {
  let oldestId: string | null = null;
  let oldestTs = Infinity;
  for (const [id, ts] of webglLru) {
    if (id === exceptPaneId) continue;
    if (ts < oldestTs) {
      oldestTs = ts;
      oldestId = id;
    }
  }
  if (oldestId) releaseWebgl(oldestId);
}

/**
 * Ensure this pane has a WebGL addon attached. No-ops if the pane opts out of
 * WebGL (dashboard tiles) or the entry is missing. When the pool is full, the
 * least-recently-used pane is evicted and its renderer falls back to DOM.
 */
export function acquireWebgl(paneId: string): boolean {
  const entry = registry.get(paneId);
  if (!entry || entry.preferDomRenderer) return false;
  if (entry.webglAddon) {
    webglLru.set(paneId, Date.now());
    return true;
  }
  if (webglLru.size >= WEBGL_POOL_CAP) {
    evictOldestWebgl(paneId);
  }
  try {
    const addon = new WebglAddon();
    addon.onContextLoss(() => {
      // Browser evicted us (e.g. another context pushed us out). Don't retry —
      // falling back to DOM renderer is fine and avoids a re-acquire fight loop.
      releaseWebgl(paneId);
    });
    entry.terminal.loadAddon(addon);
    entry.webglAddon = addon;
    webglLru.set(paneId, Date.now());
    return true;
  } catch {
    return false;
  }
}

export function releaseWebgl(paneId: string): void {
  webglLru.delete(paneId);
  const entry = registry.get(paneId);
  if (!entry?.webglAddon) return;
  try {
    entry.webglAddon.dispose();
  } catch {
    /* already disposed */
  }
  entry.webglAddon = null;
}

export function hasWebgl(paneId: string): boolean {
  return !!registry.get(paneId)?.webglAddon;
}

/* ── Hidden-pane write buffer ── */

export function bufferPtyData(paneId: string, data: Uint8Array): void {
  const entry = registry.get(paneId);
  if (!entry) return;
  entry.writeBuffer.push(data);
  entry.writeBufferSize += data.byteLength;
  while (
    entry.writeBufferSize > MAX_HIDDEN_BUFFER_BYTES &&
    entry.writeBuffer.length > 1
  ) {
    const dropped = entry.writeBuffer.shift()!;
    entry.writeBufferSize -= dropped.byteLength;
    entry.writeBufferTruncated = true;
  }
}

export function flushWriteBuffer(paneId: string): void {
  const entry = registry.get(paneId);
  if (!entry || entry.writeBuffer.length === 0) return;
  if (entry.writeBufferTruncated) {
    entry.terminal.reset();
    entry.terminal.write(
      '\x1b[38;5;243m[agent-grid] Older output was skipped while this pane was hidden\x1b[0m\r\n',
    );
    entry.writeBufferTruncated = false;
  }
  for (const chunk of entry.writeBuffer) {
    entry.terminal.write(chunk);
  }
  entry.writeBuffer = [];
  entry.writeBufferSize = 0;
}

/**
 * Update visibility from the pane's IntersectionObserver. On hidden→visible
 * transition we flush any buffered PTY output so the pane shows what it missed.
 */
export function setTerminalVisible(paneId: string, visible: boolean): void {
  const entry = registry.get(paneId);
  if (!entry) return;
  const was = entry.isVisible;
  entry.isVisible = visible;
  if (!was && visible) flushWriteBuffer(paneId);
}

/* ── Lifecycle ── */

/** Full cleanup — dispose terminal, kill PTY, remove from registry */
export function destroyTerminalEntry(paneId: string): void {
  const entry = registry.get(paneId);
  if (!entry) return;

  for (const d of entry.ptyDisposables) d.dispose();
  entry.pty?.kill();
  releaseWebgl(paneId);
  entry.visibilityObserver?.disconnect();
  entry.visibilityObserver = null;
  entry.terminal.dispose();
  registry.delete(paneId);
  webglLru.delete(paneId);
}

/** Check if a pane has a surviving terminal instance */
export function hasTerminalEntry(paneId: string): boolean {
  return registry.has(paneId);
}

/** Get all pane IDs in the registry */
export function getRegisteredPaneIds(): string[] {
  return Array.from(registry.keys());
}

/** Destroy entries for panes that no longer exist in the store */
export function cleanupOrphanedEntries(activePaneIds: string[]): void {
  const activeSet = new Set(activePaneIds);
  for (const paneId of registry.keys()) {
    if (!activeSet.has(paneId)) {
      destroyTerminalEntry(paneId);
    }
  }
}

/* ── Test helpers ── */

/** Visible only for tests — current size of the WebGL LRU pool */
export function _webglPoolSize(): number {
  return webglLru.size;
}

/** Visible only for tests — cap used by the WebGL pool */
export const _WEBGL_POOL_CAP = WEBGL_POOL_CAP;

/** Visible only for tests — hidden buffer byte cap */
export const _MAX_HIDDEN_BUFFER_BYTES = MAX_HIDDEN_BUFFER_BYTES;
