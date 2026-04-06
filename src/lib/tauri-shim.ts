/**
 * Browser-safe wrappers for Tauri APIs.
 * In Tauri runtime: delegates to real APIs.
 * In browser (dev preview): returns no-op stubs so the UI renders.
 */

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function getAppWindow() {
  if (!isTauri) return null;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export function getPlatform(): string {
  if (!isTauri) return "win32";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { platform } = require("@tauri-apps/plugin-os");
    return platform();
  } catch {
    return "win32";
  }
}

export interface ShimPty {
  onData: (cb: (data: Uint8Array) => void) => void;
  onExit: (cb: (e: { exitCode: number }) => void) => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
}

/** Noop PTY for browser preview — writes a placeholder message */
export function spawnPty(): ShimPty {
  return {
    onData: (cb: (data: Uint8Array) => void) => {
      const msg = new TextEncoder().encode(
        "\x1b[38;5;243mTerminal preview \u2014 PTY requires Tauri runtime\x1b[0m\r\n"
      );
      setTimeout(() => cb(msg), 100);
    },
    onExit: () => {},
    write: () => {},
    resize: () => {},
    kill: () => {},
  };
}
