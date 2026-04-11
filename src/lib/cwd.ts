/**
 * CWD normalization for cross-platform PTY spawning.
 *
 * Git Bash / MSYS2 on Windows emits OSC 7 with POSIX-style paths
 * (e.g. file://HOSTNAME/c/Users/brayd/Desktop). These need to be
 * converted to native Windows paths before passing to a new PTY spawn.
 */

/**
 * Convert an OSC 7 payload (either a file:// URL or bare path) into
 * a native OS path suitable for PTY cwd.
 *
 * On Windows this handles:
 *  - file://host/c/Users/… → C:\Users\…
 *  - /c/Users/…            → C:\Users\…
 *  - /C:/Users/…           → C:\Users\…   (already Windows-rooted inside URL)
 *  - C:\Users\…            → C:\Users\…   (passthrough)
 *
 * On non-Windows, paths are returned as-is after basic cleanup.
 */
export function normalizeCwd(raw: string, platform: string): string | null {
  if (!raw || !raw.trim()) return null;

  let path: string;

  // ── 1. Parse file:// URLs ──
  let fileUrlHost = '';
  if (raw.startsWith('file://')) {
    try {
      const url = new URL(raw);
      fileUrlHost = url.host;
      path = decodeURIComponent(url.pathname);
    } catch {
      // Malformed URL — try treating the remainder as a path
      const stripped = raw.replace(/^file:\/\/[^/]*/, '');
      path = decodeURIComponent(stripped);
    }
  } else {
    path = raw;
  }

  // ── 2. Windows-specific normalization ──
  if (platform === 'windows') {
    // Strip Windows extended-length path prefix (\\?\) that Rust's
    // canonicalize() adds. Many programs don't handle it as a CWD.
    path = path.replace(/^\\\\\?\\/, '');

    // Reconstruct UNC path from file://server/share/… URLs.
    // new URL('file://server/share') sets host='server', pathname='/share',
    // losing the host. If the pathname doesn't start with a drive letter,
    // this is a UNC path — reconstruct \\server\pathname.
    if (
      fileUrlHost &&
      !/^\/[A-Za-z]:/.test(path) &&
      !/^\/[A-Za-z]\//.test(path)
    ) {
      path = `\\\\${fileUrlHost}${path.replace(/\//g, '\\')}`;
    }

    // Strip leading slash before a drive letter: /C:/… → C:/…
    path = path.replace(/^\/([A-Za-z]):/, '$1:');

    // WSL-style: /mnt/c/Users/… → C:\Users\…
    path = path.replace(
      /^\/mnt\/([A-Za-z])\//,
      (_, letter: string) => `${letter.toUpperCase()}:\\`,
    );

    // MSYS/Cygwin-style: /c/Users/… → C:\Users\…
    path = path.replace(
      /^\/([A-Za-z])\//,
      (_, letter: string) => `${letter.toUpperCase()}:\\`,
    );

    // Normalize remaining forward slashes to backslashes
    path = path.replace(/\//g, '\\');

    // Drive-letter paths with spurious leading backslashes (e.g. //C:/… → \\C:\…)
    // must be caught before the UNC branch to avoid misclassification.
    path = path.replace(/^\\+([A-Za-z]:\\)/, '$1');

    // UNC paths: \\server\share\… — valid Windows network paths
    if (/^\\\\[^\\]+\\[^\\]+/.test(path)) {
      // Collapse repeated internal backslashes (preserve leading \\)
      path = '\\\\' + path.slice(2).replace(/\\{2,}/g, '\\');
      // Strip trailing backslash unless bare \\server\share root
      const segments = path.slice(2).split('\\').filter(Boolean);
      if (segments.length > 2 && path.endsWith('\\')) {
        path = path.slice(0, -1);
      }
      return path;
    }

    // Must start with a drive letter after normalization
    if (!/^[A-Za-z]:\\/.test(path)) return null;

    // Collapse repeated backslashes
    path = path.replace(/\\{2,}/g, '\\');

    // Strip trailing backslash (unless root like C:\)
    if (path.length > 3 && path.endsWith('\\')) {
      path = path.slice(0, -1);
    }
  } else {
    // Unix: must be absolute
    if (!path.startsWith('/')) return null;

    // Collapse repeated slashes
    path = path.replace(/\/{2,}/g, '/');

    // Strip trailing slash (unless root /)
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
  }

  return path;
}
