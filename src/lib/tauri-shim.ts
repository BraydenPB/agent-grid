/**
 * Browser-safe wrappers for Tauri APIs.
 * In Tauri runtime: delegates to real APIs.
 * In browser (dev preview): returns no-op stubs so the UI renders.
 */

const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function getAppWindow() {
  if (!isTauri) return null;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

/** Returns the user's home directory, or a fallback for browser preview. */
export async function getHomeDir(): Promise<string> {
  if (!isTauri) {
    return navigator.platform.startsWith('Win') ? 'C:\\Users' : '/home';
  }
  const { homeDir } = await import('@tauri-apps/api/path');
  return homeDir();
}

/** Open a native folder picker, or fall back to prompt in browser preview. */
export async function openFolderDialog(): Promise<string | null> {
  if (!isTauri) {
    return window.prompt('Enter project folder path:');
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return null;
  return typeof selected === 'string' ? selected : (selected[0] ?? null);
}

let cachedPlatform: string | null = null;

// Eagerly resolve platform from Tauri plugin via async import (ESM-safe).
// Until the import resolves, getPlatform() falls back to navigator.platform.
if (isTauri) {
  void import('@tauri-apps/plugin-os')
    .then((mod) => {
      cachedPlatform = mod.platform();
    })
    .catch(() => {});
}

export function getPlatform(): string {
  if (cachedPlatform) return cachedPlatform;
  // Don't cache the navigator fallback — let the async import set the
  // authoritative value when it resolves (avoids caching 'linux' on macOS).
  return navigator.platform.startsWith('Win') ? 'windows' : 'linux';
}

export interface ShimPty {
  onData: (cb: (data: Uint8Array) => void) => void;
  onExit: (cb: (e: { exitCode: number }) => void) => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
}

export interface SpawnOptions {
  command: string;
  args: string[];
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
}

/** Spawn a real PTY via tauri-pty, or return a stub in browser preview */
export async function spawnPty(options: SpawnOptions): Promise<ShimPty> {
  if (!isTauri) {
    return {
      onData: (cb: (data: Uint8Array) => void) => {
        const msg = new TextEncoder().encode(
          '\x1b[38;5;243mTerminal preview \u2014 PTY requires Tauri runtime\x1b[0m\r\n',
        );
        setTimeout(() => cb(msg), 100);
      },
      onExit: () => {},
      write: () => {},
      resize: () => {},
      kill: () => {},
    };
  }

  const { spawn } = await import('tauri-pty');
  const pty = spawn(options.command, options.args, {
    cols: options.cols ?? 80,
    rows: options.rows ?? 24,
    cwd: options.cwd,
    env: options.env,
  });

  const dataDisposables: Array<{ dispose: () => void }> = [];
  const exitDisposables: Array<{ dispose: () => void }> = [];

  return {
    onData: (cb: (data: Uint8Array) => void) => {
      dataDisposables.push(pty.onData(cb));
    },
    onExit: (cb: (e: { exitCode: number }) => void) => {
      exitDisposables.push(pty.onExit(cb));
    },
    write: (data: string) => pty.write(data),
    resize: (cols: number, rows: number) => pty.resize(cols, rows),
    kill: () => {
      dataDisposables.forEach((d) => d.dispose());
      exitDisposables.forEach((d) => d.dispose());
      pty.kill();
    },
  };
}
