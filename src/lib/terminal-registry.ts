/**
 * Terminal Registry — manages xterm Terminal + PTY instances outside React lifecycle.
 *
 * When Dockview rearranges panels (preset switch), React components unmount and
 * remount. The registry keeps Terminal/PTY instances alive so they can be
 * reattached to new DOM containers without losing scroll history or running processes.
 */

import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { SearchAddon } from '@xterm/addon-search';
import type { SerializeAddon } from '@xterm/addon-serialize';
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
}

const registry = new Map<string, TerminalEntry>();

export function getTerminalEntry(paneId: string): TerminalEntry | undefined {
  return registry.get(paneId);
}

export function setTerminalEntry(paneId: string, entry: TerminalEntry): void {
  registry.set(paneId, entry);
}

export function removeTerminalEntry(paneId: string): TerminalEntry | undefined {
  const entry = registry.get(paneId);
  registry.delete(paneId);
  return entry;
}

/** Full cleanup — dispose terminal, kill PTY, remove from registry */
export function destroyTerminalEntry(paneId: string): void {
  const entry = registry.get(paneId);
  if (!entry) return;

  for (const d of entry.ptyDisposables) d.dispose();
  entry.pty?.kill();
  entry.terminal.dispose();
  registry.delete(paneId);
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
