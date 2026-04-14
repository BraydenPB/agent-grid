import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { ImageAddon } from '@xterm/addon-image';
import {
  X,
  Maximize2,
  Minimize2,
  PanelRight,
  PanelBottom,
  FolderOpen,
} from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { spawnPty, getPlatform, type ShimPty } from '@/lib/tauri-shim';
import { resolveShellCommand } from '@/lib/profiles';
import { normalizeCwd } from '@/lib/cwd';
import { useWorkspaceStore, getActiveWorktree } from '@/store/workspace-store';
import {
  getTerminalEntry,
  setTerminalEntry,
  zoomTerminalFont,
  FONT_SIZE_DEFAULT,
  acquireWebgl,
  bufferPtyData,
  setTerminalVisible,
  type TerminalEntry,
} from '@/lib/terminal-registry';
import { usePaneStatusStore, STATUS_COLORS } from '@/store/pane-status-store';
import type { TerminalProfile } from '@/types';
import { cn } from '@/lib/utils';
import { TerminalSearch } from './terminal-search';
import { TerminalContextMenu } from './terminal-context-menu';

/* ── Constants ── */
const TERMINAL_THEME = {
  background: '#0a0a0f',
  foreground: '#c8ccd4',
  cursor: '#528bff',
  cursorAccent: '#0a0a0f',
  selectionBackground: 'rgba(59, 130, 246, 0.25)',
  selectionForeground: '#e4e8f0',
  selectionInactiveBackground: 'rgba(59, 130, 246, 0.12)',
  black: '#3b4048',
  red: '#f47067',
  green: '#57ab5a',
  yellow: '#e0a658',
  blue: '#6cb6ff',
  magenta: '#c678dd',
  cyan: '#56d4dd',
  white: '#abb2bf',
  brightBlack: '#636d83',
  brightRed: '#f47067',
  brightGreen: '#7ee787',
  brightYellow: '#f0c674',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#76e4f7',
  brightWhite: '#e6edf3',
} as const;

/* ── Types ── */
interface TerminalPaneProps {
  profile: TerminalProfile;
  isActive: boolean;
  onFocus: () => void;
  onClose: () => void;
  paneId: string;
  initialCwd?: string;
  /** Hide the built-in pane header (used when an outer container provides its own). */
  hideHeader?: boolean;
  /**
   * Skip the WebGL renderer entirely (falls back to xterm's DOM renderer).
   * Used by dashboard tiles — many small viewports at once would otherwise
   * burn through the browser's WebGL context cap.
   */
  preferDomRenderer?: boolean;
}

const IDLE_TIMEOUT_MS = 3000;

export function TerminalPane({
  profile: initialProfile,
  isActive,
  onFocus,
  onClose,
  paneId,
  initialCwd,
  hideHeader = false,
  preferDomRenderer = false,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const entryRef = useRef<TerminalEntry | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processExitedRef = useRef(false);

  const paneStatus = usePaneStatusStore((s) => s.statuses[paneId] ?? 'working');
  const setStatus = usePaneStatusStore((s) => s.setStatus);
  const statusColor = STATUS_COLORS[paneStatus];

  const [searchVisible, setSearchVisible] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
  }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const [cwd, setCwd] = useState<string>(initialCwd || '');
  const profiles = useWorkspaceStore((s) => s.profiles);
  const paneProfileId = useWorkspaceStore((s) => {
    const ws = getActiveWorktree(s);
    return (
      ws?.panes.find((p) => p.id === paneId)?.profileId ?? initialProfile.id
    );
  });
  const updatePaneProfile = useWorkspaceStore((s) => s.updatePaneProfile);
  const activeProfile =
    profiles.find((p) => p.id === paneProfileId) ?? initialProfile;
  const paneColorOverride = useWorkspaceStore((s) => {
    const ws = getActiveWorktree(s);
    return ws?.panes.find((p) => p.id === paneId)?.colorOverride;
  });
  const effectiveColor = paneColorOverride ?? activeProfile.color ?? '#636d83';

  const toggleMaximize = useWorkspaceStore((s) => s.toggleMaximize);
  const isMaximized = useWorkspaceStore((s) => {
    const ws = getActiveWorktree(s);
    return ws?.maximizedPaneId === paneId;
  });

  /* ── Addon loading ── */
  const loadAddons = useCallback(
    (
      term: Terminal,
      fitAddon: FitAddon,
    ): { searchAddon: SearchAddon; serializeAddon: SerializeAddon } => {
      term.loadAddon(fitAddon);

      // WebGL is attached on demand by the registry's acquireWebgl() pool —
      // see the visibility / focus effects below. Keeping WebGL on every pane
      // blows through the browser's ~16 context cap when many terminals are open.

      const searchAddon = new SearchAddon();
      term.loadAddon(searchAddon);

      const webLinksAddon = new WebLinksAddon(
        (_event, uri) => {
          window.open(uri, '_blank', 'noopener');
        },
        {
          // Must NOT include the /g flag — WebLinksAddon appends it
          // internally, and a duplicate flag makes `new RegExp(source, 'gg')`
          // throw on every mouse-move, freezing input.
          urlRegex: /https?:\/\/[^\s'")\]}>]+/,
        },
      );
      term.loadAddon(webLinksAddon);

      const clipboardAddon = new ClipboardAddon();
      term.loadAddon(clipboardAddon);

      const serializeAddon = new SerializeAddon();
      term.loadAddon(serializeAddon);

      const unicodeAddon = new Unicode11Addon();
      term.loadAddon(unicodeAddon);
      term.unicode.activeVersion = '11';

      try {
        const imageAddon = new ImageAddon();
        term.loadAddon(imageAddon);
      } catch {
        /* Image addon may fail */
      }

      import('@xterm/addon-ligatures')
        .then(({ LigaturesAddon }) => {
          try {
            term.loadAddon(new LigaturesAddon());
          } catch {
            /* Ligatures not available */
          }
        })
        .catch(() => {});

      return { searchAddon, serializeAddon };
    },
    [],
  );

  /* ── Keyboard shortcuts ── */
  const attachKeyboardShortcuts = useCallback(
    (term: Terminal) => {
      term.attachCustomKeyEventHandler((e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'F' && e.type === 'keydown') {
          setSearchVisible(true);
          return false;
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'C' && e.type === 'keydown') {
          const sel = term.getSelection();
          if (sel) void navigator.clipboard.writeText(sel).catch(() => {});
          return false;
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'V' && e.type === 'keydown') {
          void navigator.clipboard
            .readText()
            .then((text) => {
              entryRef.current?.pty?.write(text);
            })
            .catch(() => {});
          return false;
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'D' && e.type === 'keydown') {
          useWorkspaceStore.getState().addPane(initialProfile.id, 'right');
          return false;
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'E' && e.type === 'keydown') {
          useWorkspaceStore.getState().addPane(initialProfile.id, 'below');
          return false;
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'W' && e.type === 'keydown') {
          onClose();
          return false;
        }
        // Ctrl+= / Ctrl+- / Ctrl+0 (zoom) are handled globally with
        // preventDefault — let them propagate up.
        if (
          e.ctrlKey &&
          !e.shiftKey &&
          !e.altKey &&
          (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')
        ) {
          return false;
        }
        // Let devtools shortcuts through to native WebView handler
        if (e.key === 'F12') return false;
        if (e.ctrlKey && e.shiftKey && e.key === 'I' && e.type === 'keydown')
          return false;
        // Let global shortcuts through to window handler
        if (e.ctrlKey && e.shiftKey && e.key === 'P') return false;
        if (e.ctrlKey && !e.shiftKey && e.key === 't') return false;
        if (e.ctrlKey && !e.shiftKey && e.key === 'w') return false;
        if (e.ctrlKey && !e.shiftKey && e.key === 'k') return false;
        if (e.ctrlKey && e.key === 'Tab') return false;
        if (e.ctrlKey && !e.shiftKey && (e.key === ']' || e.key === '['))
          return false;
        if (e.altKey && /^[1-9]$/.test(e.key)) return false;
        if (e.ctrlKey && e.key === 'Enter') return false;
        if (e.ctrlKey && e.altKey && e.key.startsWith('Arrow')) return false;
        if (e.ctrlKey && e.shiftKey && e.key === 'Delete') return false;
        // Let Escape bubble to the global handler (useGlobalShortcuts)
        // — don't send to PTY; the global handler handles level/palette/maximize dismiss
        if (
          e.key === 'Escape' &&
          !e.ctrlKey &&
          !e.altKey &&
          !e.shiftKey &&
          e.type === 'keydown'
        ) {
          return false;
        }
        return true;
      });
    },
    [initialProfile.id, onClose],
  );

  /* ── OSC sequence handler for shell integration ── */
  const updatePaneCwd = useWorkspaceStore((s) => s.updatePaneCwd);
  const attachOscHandlers = useCallback(
    (term: Terminal) => {
      term.parser.registerOscHandler(7, (data) => {
        const normalized = normalizeCwd(data, getPlatform());
        if (normalized) {
          setCwd(normalized);
          updatePaneCwd(paneId, normalized);
        }
        return true;
      });

      term.parser.registerOscHandler(133, () => true);
      term.parser.registerOscHandler(0, () => false);
      term.parser.registerOscHandler(2, () => false);
    },
    [paneId, updatePaneCwd],
  );

  /* ── Status helpers ── */
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (processExitedRef.current) return;
    idleTimerRef.current = setTimeout(() => {
      setStatus(paneId, 'idle');
    }, IDLE_TIMEOUT_MS);
  }, [paneId, setStatus]);

  /* ── Spawn (or re-spawn) PTY ── */
  const spawnProcess = useCallback(
    async (
      entry: TerminalEntry,
      profile: TerminalProfile,
      workingDir?: string,
    ): Promise<ShimPty | null> => {
      const seq = ++entry.spawnSeq;
      processExitedRef.current = false;
      setStatus(paneId, 'working');

      for (const d of entry.ptyDisposables) d.dispose();
      entry.ptyDisposables = [];

      if (entry.pty) {
        entry.pty.kill();
        entry.pty = null;
      }

      const cwd = workingDir
        ? normalizeCwd(workingDir, getPlatform())
        : undefined;
      const { command, args } = resolveShellCommand(profile, getPlatform());

      try {
        const pty = await spawnPty({
          command,
          args,
          cols: entry.terminal.cols,
          rows: entry.terminal.rows,
          cwd: cwd ?? undefined,
        });

        if (seq !== entry.spawnSeq) {
          pty.kill();
          return null;
        }

        pty.onData((data: Uint8Array) => {
          // Route data: visible panes write directly; hidden panes queue the
          // chunks so xterm's parser isn't burning main-thread time in the
          // background. The buffer flushes automatically on visibility change.
          if (entry.isVisible) {
            entry.terminal.write(data);
          } else {
            bufferPtyData(paneId, data);
          }
          // Track activity for status (runs regardless of visibility)
          if (!processExitedRef.current) {
            const currentStatus =
              usePaneStatusStore.getState().statuses[paneId];
            const wsState = useWorkspaceStore.getState();
            const activeWs = getActiveWorktree(wsState);
            const isCurrentlyActive = activeWs?.activePaneId === paneId;
            if (!isCurrentlyActive && currentStatus !== 'attention') {
              setStatus(paneId, 'attention');
            } else if (isCurrentlyActive && currentStatus !== 'working') {
              setStatus(paneId, 'working');
            }
            resetIdleTimer();
          }
        });
        const dataDisposable = entry.terminal.onData((data: string) =>
          pty.write(data),
        );
        const resizeDisposable = entry.terminal.onResize(({ cols, rows }) =>
          pty.resize(cols, rows),
        );
        entry.ptyDisposables = [dataDisposable, resizeDisposable];

        pty.onExit(({ exitCode }: { exitCode: number }) => {
          if (seq !== entry.spawnSeq) return;
          processExitedRef.current = true;
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          const color = exitCode === 0 ? '38;5;243' : '38;5;203';
          const icon = exitCode === 0 ? '\u2713' : '\u2717';
          entry.terminal.write(
            `\r\n\x1b[${color}m${icon} Process exited with code ${exitCode}\x1b[0m\r\n`,
          );
          setStatus(paneId, exitCode === 0 ? 'done' : 'error');
        });

        resetIdleTimer();
        entry.pty = pty;
        return pty;
      } catch (err) {
        if (seq !== entry.spawnSeq) return null;
        processExitedRef.current = true;
        console.error('[agent-grid] PTY spawn failed:', err);
        entry.terminal.write(
          `\x1b[38;5;203mFailed to spawn: ${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n`,
        );
        setStatus(paneId, 'error');
        return null;
      }
    },
    [paneId, setStatus, resetIdleTimer],
  );

  /* ── Profile switching ── */
  const handleSwitchProfile = useCallback(
    async (newProfile: TerminalProfile) => {
      const entry = entryRef.current;
      if (!entry) return;

      updatePaneProfile(paneId, newProfile.id);
      entry.profileId = newProfile.id;
      entry.terminal.clear();
      entry.terminal.reset();
      entry.terminal.write(
        `\x1b[38;5;243mSwitching to ${newProfile.name}...\x1b[0m\r\n`,
      );

      await spawnProcess(entry, newProfile, cwd || undefined);
      entry.terminal.focus();
    },
    [spawnProcess, cwd, paneId, updatePaneProfile],
  );

  /* ── Directory changing ── */
  const handleChangeDirectory = useCallback(() => {
    const store = useWorkspaceStore.getState();
    store.setChangeDirPaneId(paneId);
    store.setShowProjectBrowser(true);
  }, [paneId]);

  // Consume pending cwd change from project browser
  const pendingCwd = useWorkspaceStore((s) => s.pendingCwd);
  useEffect(() => {
    if (!pendingCwd || pendingCwd.paneId !== paneId) return;
    const entry = entryRef.current;
    if (!entry) return;

    const newPath = pendingCwd.path;
    useWorkspaceStore.getState().clearPendingCwd();

    setCwd(newPath);
    entry.cwd = newPath;
    entry.terminal.clear();
    entry.terminal.reset();
    entry.terminal.write(
      `\x1b[38;5;243mChanged directory to ${newPath}\x1b[0m\r\n`,
    );

    void spawnProcess(entry, activeProfile, newPath).then(() =>
      entry.terminal.focus(),
    );
  }, [pendingCwd, paneId, activeProfile, spawnProcess]);

  /* ── Context menu handlers ── */
  const handleCopy = useCallback(() => {
    const entry = entryRef.current;
    if (!entry) return;
    const sel = entry.terminal.getSelection();
    if (sel) void navigator.clipboard.writeText(sel).catch(() => {});
  }, []);

  const handlePaste = useCallback(() => {
    void navigator.clipboard
      .readText()
      .then((text) => {
        if (text) entryRef.current?.terminal.paste(text);
      })
      .catch(() => {});
  }, []);

  const handleClear = useCallback(() => {
    entryRef.current?.terminal.clear();
  }, []);

  const handleReset = useCallback(() => {
    entryRef.current?.terminal.reset();
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    const terminalEl = containerRef.current;
    const inTerminal = !!terminalEl && terminalEl.contains(e.target as Node);
    const entry = entryRef.current;

    // Shift+right-click, right-click outside the terminal viewport, or
    // right-click before the PTY is attached → show the full menu.
    if (e.shiftKey || !inTerminal || !entry) {
      setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
      return;
    }

    // Smart copy/paste inside the terminal: selection → copy, else → paste.
    const selection = entry.terminal.getSelection();
    if (selection) {
      void navigator.clipboard.writeText(selection).catch(() => {});
      entry.terminal.clearSelection();
    } else {
      void navigator.clipboard
        .readText()
        .then((text) => {
          if (text) entry.terminal.paste(text);
        })
        .catch(() => {});
    }
    entry.terminal.focus();
  }, []);

  /* ── Double-click header to maximize/restore ── */
  const handleHeaderDoubleClick = useCallback(() => {
    toggleMaximize(paneId);
  }, [paneId, toggleMaximize]);

  /* ── Terminal initialization / reattachment ── */
  useEffect(() => {
    if (!containerRef.current) return;

    const existing = getTerminalEntry(paneId);

    if (existing) {
      // ── Reattach existing terminal ──
      entryRef.current = existing;

      // Move the xterm element into the new container
      containerRef.current.appendChild(existing.element);

      // Restore cwd and profile state
      setCwd(existing.cwd);
      if (existing.profileId !== paneProfileId) {
        existing.profileId = paneProfileId;
      }

      // Re-fit after reattach (Dockview may have resized)
      requestAnimationFrame(() => {
        try {
          existing.fitAddon.fit();
        } catch {
          /* not ready yet */
        }
      });

      // Set up ResizeObserver for the new container
      let disposed = false;
      const resizeObserver = new ResizeObserver(() => {
        if (disposed || !containerRef.current) return;
        try {
          existing.fitAddon.fit();
        } catch {
          /* ignore */
        }
      });
      resizeObserver.observe(containerRef.current);

      return () => {
        disposed = true;
        resizeObserver.disconnect();
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        // Detach xterm element from DOM but keep it alive in the registry
        if (existing.element.parentNode) {
          existing.element.parentNode.removeChild(existing.element);
        }
        // Guard: only clear if this effect still owns entryRef (a newer init
        // may have already written its own entry after us).
        if (entryRef.current === existing) {
          entryRef.current = null;
        }
      };
    }

    // ── Create new terminal ──
    const xtermContainer = document.createElement('div');
    xtermContainer.style.width = '100%';
    xtermContainer.style.height = '100%';
    containerRef.current.appendChild(xtermContainer);

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      fontSize: FONT_SIZE_DEFAULT,
      fontFamily:
        "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
      fontWeight: '400',
      letterSpacing: 0,
      lineHeight: 1.35,
      theme: TERMINAL_THEME,
      scrollback: 10000,
      allowProposedApi: true,
      rightClickSelectsWord: true,
      macOptionIsMeta: true,
      scrollOnUserInput: true,
    });

    const fitAddon = new FitAddon();
    term.open(xtermContainer);
    const { searchAddon, serializeAddon } = loadAddons(term, fitAddon);
    attachKeyboardShortcuts(term);
    attachOscHandlers(term);

    const entry: TerminalEntry = {
      terminal: term,
      fitAddon,
      searchAddon,
      serializeAddon,
      pty: null,
      element: xtermContainer,
      ptyDisposables: [],
      spawnSeq: 0,
      fontSize: FONT_SIZE_DEFAULT,
      profileId: initialProfile.id,
      cwd: initialCwd || '',
      webglAddon: null,
      preferDomRenderer,
      writeBuffer: [],
      writeBufferSize: 0,
      writeBufferTruncated: false,
      isVisible: true,
      visibilityObserver: null,
    };

    setTerminalEntry(paneId, entry);
    entryRef.current = entry;

    // Acquire a WebGL context from the shared pool. Dashboard tiles opt out
    // (preferDomRenderer=true) so they always use the DOM renderer.
    if (!preferDomRenderer) acquireWebgl(paneId);

    // IntersectionObserver drives the visibility flag that gates PTY writes.
    // Observing the persistent xterm element means the observer keeps working
    // across Dockview rearranges (registry keeps the element alive).
    if (typeof IntersectionObserver !== 'undefined') {
      const visObserver = new IntersectionObserver(
        (records) => {
          for (const rec of records) {
            setTerminalVisible(paneId, rec.isIntersecting);
          }
        },
        { threshold: 0 },
      );
      visObserver.observe(xtermContainer);
      entry.visibilityObserver = visObserver;
    }

    // ResizeObserver
    let disposed = false;
    let hasFitted = false;
    const resizeObserver = new ResizeObserver(() => {
      if (disposed || !containerRef.current) return;
      try {
        fitAddon.fit();
        hasFitted = true;
      } catch {
        /* not ready */
      }
    });
    resizeObserver.observe(containerRef.current);

    // Force fit retries for Dockview layout settle
    let fitAttempts = 0;
    const tryFit = () => {
      fitAttempts++;
      if (disposed || !containerRef.current) return;
      if (hasFitted && containerRef.current.offsetWidth > 0) return;
      try {
        if (containerRef.current.offsetWidth > 0) {
          fitAddon.fit();
          hasFitted = true;
        }
      } catch {
        /* Still can't fit */
      }
      if (!hasFitted && fitAttempts < 10) requestAnimationFrame(tryFit);
    };
    requestAnimationFrame(tryFit);

    // Spawn PTY (spawnSeq guards against stale spawns)
    void spawnProcess(entry, initialProfile, initialCwd || undefined);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      // Detach xterm element but keep in registry for potential reattach
      if (xtermContainer.parentNode) {
        xtermContainer.parentNode.removeChild(xtermContainer);
      }
      // Guard: only clear if this effect still owns entryRef (a newer init
      // may have already written its own entry after us).
      if (entryRef.current === entry) {
        entryRef.current = null;
      }
    };
  }, [paneId]); // Only re-run if paneId changes (never during rearrange)

  /* ── Ctrl+Wheel to zoom ── */
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      zoomTerminalFont(paneId, e.deltaY > 0 ? -1 : 1);
    };
    node.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel, { capture: true });
    };
  }, [paneId]);

  useEffect(() => {
    if (entryRef.current) {
      entryRef.current.profileId = paneProfileId;
    }
  }, [paneProfileId]);

  useEffect(() => {
    if (isActive && entryRef.current) {
      // Touch the WebGL pool on focus — brings this pane back from DOM-renderer
      // fallback if it was evicted, and bumps LRU so it stays until another pane
      // takes the slot.
      if (!preferDomRenderer) acquireWebgl(paneId);
      entryRef.current.terminal.focus();
      // Clear attention status when pane gains focus
      if (paneStatus === 'attention') {
        setStatus(paneId, processExitedRef.current ? 'done' : 'working');
      }
    }
  }, [isActive, paneId, paneStatus, setStatus, preferDomRenderer]);

  const cwdLabel = cwd ? cwd.split(/[\\/]/).pop() : '';

  return (
    <div
      role="application"
      aria-label={`Terminal: ${activeProfile.name}`}
      data-pane-root={paneId}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden',
        isActive ? 'pane-active' : 'pane-inactive',
      )}
      style={
        {
          background: '#0a0a0f',
          '--pane-color': effectiveColor,
        } as React.CSSProperties
      }
      onMouseDown={onFocus}
      onContextMenu={handleContextMenu}
    >
      {/* Color accent — left edge */}
      <span
        className="absolute top-0 left-0 z-10 h-full w-[2px]"
        style={{
          backgroundColor: effectiveColor,
          opacity: isActive ? 0.7 : 0.15,
          transition: 'opacity 150ms ease',
        }}
      />

      {/* Pane header */}
      {!hideHeader && (
        <div
          className={cn(
            'pane-drag-handle flex h-8 shrink-0 items-center justify-between gap-2 px-3 pl-3.5',
            'cursor-grab select-none active:cursor-grabbing',
            'border-b border-white/[0.06]',
            'transition-colors duration-100',
            isActive ? 'bg-white/[0.04]' : 'bg-white/[0.02]',
          )}
          style={{ '--accent-1': effectiveColor } as React.CSSProperties}
          onDoubleClick={handleHeaderDoubleClick}
          title="Double-click to maximize"
        >
          <div className="flex min-w-0 items-center gap-2">
            {/* Profile color dot with status indicator */}
            <span className="relative flex shrink-0 items-center justify-center">
              <span
                className="h-2 w-2 rounded-full transition-all duration-200"
                style={{
                  backgroundColor: effectiveColor,
                  opacity: isActive ? 1 : 0.4,
                  boxShadow: isActive ? `0 0 6px ${effectiveColor}44` : 'none',
                }}
              />
              {paneStatus !== 'working' && statusColor !== 'transparent' && (
                <span
                  className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: statusColor }}
                />
              )}
            </span>

            {/* Profile name */}
            <span
              className={cn(
                'truncate text-[11px] font-medium transition-colors duration-100',
                isActive ? 'text-zinc-200' : 'text-zinc-500',
              )}
            >
              {activeProfile.name}
            </span>

            {/* CWD breadcrumb */}
            {cwdLabel && (
              <div
                className={cn(
                  'flex items-center gap-1 rounded px-1.5 py-0.5',
                  isActive ? 'bg-white/[0.04]' : 'bg-transparent',
                )}
                title={cwd}
              >
                <FolderOpen
                  size={9}
                  className={cn(
                    'shrink-0',
                    isActive ? 'text-zinc-500' : 'text-zinc-700',
                  )}
                  strokeWidth={1.5}
                />
                <span
                  className={cn(
                    'max-w-[180px] truncate text-[10px]',
                    isActive ? 'text-zinc-400' : 'text-zinc-600',
                  )}
                >
                  {cwdLabel}
                </span>
              </div>
            )}

            {/* Maximized indicator */}
            {isMaximized && (
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">
                ESC to restore
              </span>
            )}
          </div>

          {/* Header actions — always visible */}
          <div className="flex shrink-0 items-center gap-0.5">
            {/* Split buttons — visible on hover */}
            <div
              className={cn(
                'flex items-center gap-0.5 transition-opacity duration-100',
                'opacity-0 group-hover:opacity-100',
              )}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  useWorkspaceStore
                    .getState()
                    .addPane(activeProfile.id, 'right');
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 transition-all duration-100 hover:bg-white/[0.06] hover:text-zinc-300"
                title="Split Right (Ctrl+Shift+D)"
              >
                <PanelRight size={10} strokeWidth={1.5} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  useWorkspaceStore
                    .getState()
                    .addPane(activeProfile.id, 'below');
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 transition-all duration-100 hover:bg-white/[0.06] hover:text-zinc-300"
                title="Split Below (Ctrl+Shift+E)"
              >
                <PanelBottom size={10} strokeWidth={1.5} />
              </button>
              <span className="mx-0.5 h-3 w-px bg-white/[0.06]" />
            </div>

            {/* Maximize / Restore */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMaximize(paneId);
              }}
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded',
                'transition-all duration-100',
                isMaximized
                  ? 'text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200'
                  : 'text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300',
              )}
              title={isMaximized ? 'Restore (Esc)' : 'Maximize (Ctrl+Enter)'}
            >
              {isMaximized ? (
                <Minimize2 size={10} strokeWidth={2} />
              ) : (
                <Maximize2 size={10} strokeWidth={2} />
              )}
            </button>
            {/* Close — always visible */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded',
                'transition-all duration-100',
                'text-zinc-600 hover:bg-red-500/[0.1] hover:text-red-400',
              )}
              title="Close pane (Ctrl+Shift+W)"
            >
              <X size={10} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <TerminalSearch
        searchAddon={entryRef.current?.searchAddon ?? null}
        visible={searchVisible}
        onClose={() => {
          setSearchVisible(false);
          entryRef.current?.terminal.focus();
        }}
      />

      {/* Terminal */}
      <div
        ref={containerRef}
        className="terminal-container min-h-0 flex-1"
        data-pane-id={paneId}
      />

      {/* Context menu */}
      <TerminalContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        visible={contextMenu.visible}
        onClose={() => setContextMenu((s) => ({ ...s, visible: false }))}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onClear={handleClear}
        onSearch={() => setSearchVisible(true)}
        onReset={handleReset}
        hasSelection={!!entryRef.current?.terminal.getSelection()}
        profileId={activeProfile.id}
        paneId={paneId}
        onSwitchProfile={(profile) => void handleSwitchProfile(profile)}
        cwd={cwd}
        onChangeDirectory={handleChangeDirectory}
        onSplitRight={() =>
          useWorkspaceStore.getState().addPane(activeProfile.id, 'right')
        }
        onSplitBelow={() =>
          useWorkspaceStore.getState().addPane(activeProfile.id, 'below')
        }
        onClose_pane={onClose}
      />
    </div>
  );
}
