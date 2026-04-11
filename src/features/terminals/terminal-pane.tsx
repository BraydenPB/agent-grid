import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
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
import { useWorkspaceStore } from '@/store/workspace-store';
import {
  getTerminalEntry,
  setTerminalEntry,
  type TerminalEntry,
} from '@/lib/terminal-registry';
import { usePaneStatusStore, STATUS_COLORS } from '@/store/pane-status-store';
import type { TerminalProfile } from '@/types';
import { cn } from '@/lib/utils';
import { TerminalSearch } from './terminal-search';
import { TerminalContextMenu } from './terminal-context-menu';

/* ── Constants ── */
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_DEFAULT = 13;

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
}

const IDLE_TIMEOUT_MS = 3000;

export function TerminalPane({
  profile: initialProfile,
  isActive,
  onFocus,
  onClose,
  paneId,
  initialCwd,
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
    const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
    return (
      ws?.panes.find((p) => p.id === paneId)?.profileId ?? initialProfile.id
    );
  });
  const updatePaneProfile = useWorkspaceStore((s) => s.updatePaneProfile);
  const activeProfile =
    profiles.find((p) => p.id === paneProfileId) ?? initialProfile;
  const paneColorOverride = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
    return ws?.panes.find((p) => p.id === paneId)?.colorOverride;
  });
  const effectiveColor = paneColorOverride ?? activeProfile.color ?? '#636d83';

  const toggleMaximize = useWorkspaceStore((s) => s.toggleMaximize);
  const expandWorkspace = useWorkspaceStore((s) => s.expandWorkspace);
  const isExpanded = useWorkspaceStore((s) => s.expandedWorkspaceId !== null);
  const isMaximized = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
    return ws?.maximizedPaneId === paneId;
  });
  const parentWorkspaceId = useWorkspaceStore((s) => {
    // Find which workspace this pane belongs to
    for (const ws of s.workspaces) {
      if (ws.panes.some((p) => p.id === paneId)) return ws.id;
    }
    return null;
  });

  /* ── Addon loading ── */
  const loadAddons = useCallback(
    (
      term: Terminal,
      fitAddon: FitAddon,
    ): { searchAddon: SearchAddon; serializeAddon: SerializeAddon } => {
      term.loadAddon(fitAddon);

      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => webglAddon.dispose());
        term.loadAddon(webglAddon);
      } catch {
        /* Canvas renderer fallback */
      }

      const searchAddon = new SearchAddon();
      term.loadAddon(searchAddon);

      const webLinksAddon = new WebLinksAddon(
        (_event, uri) => {
          window.open(uri, '_blank', 'noopener');
        },
        {
          urlRegex: /https?:\/\/[^\s'")\]}>]+/g,
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
          if (sel) void navigator.clipboard.writeText(sel);
          return false;
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'V' && e.type === 'keydown') {
          void navigator.clipboard.readText().then((text) => {
            entryRef.current?.pty?.write(text);
          });
          return false;
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'D' && e.type === 'keydown') {
          const s = useWorkspaceStore.getState();
          // Add pane first (sync store update), then expand if needed
          s.addPane(initialProfile.id, 'right');
          if (!s.expandedWorkspaceId) {
            for (const ws of s.workspaces) {
              if (ws.panes.some((p) => p.id === paneId)) {
                useWorkspaceStore.getState().expandWorkspace(ws.id);
                break;
              }
            }
          }
          return false;
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'E' && e.type === 'keydown') {
          const s = useWorkspaceStore.getState();
          s.addPane(initialProfile.id, 'below');
          if (!s.expandedWorkspaceId) {
            for (const ws of s.workspaces) {
              if (ws.panes.some((p) => p.id === paneId)) {
                useWorkspaceStore.getState().expandWorkspace(ws.id);
                break;
              }
            }
          }
          return false;
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'W' && e.type === 'keydown') {
          onClose();
          return false;
        }
        if (e.ctrlKey && !e.shiftKey && e.key === '=' && e.type === 'keydown') {
          changeFontSize(1);
          return false;
        }
        if (e.ctrlKey && !e.shiftKey && e.key === '-' && e.type === 'keydown') {
          changeFontSize(-1);
          return false;
        }
        if (e.ctrlKey && !e.shiftKey && e.key === '0' && e.type === 'keydown') {
          resetFontSize();
          return false;
        }
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
        return true;
      });
    },
    [initialProfile.id, onClose],
  );

  /* ── Font zoom ── */
  const changeFontSize = (delta: number) => {
    const entry = entryRef.current;
    if (!entry) return;
    const next = Math.max(
      FONT_SIZE_MIN,
      Math.min(FONT_SIZE_MAX, entry.fontSize + delta),
    );
    if (next === entry.fontSize) return;
    entry.fontSize = next;
    entry.terminal.options.fontSize = next;
    entry.fitAddon.fit();
  };

  const resetFontSize = () => {
    const entry = entryRef.current;
    if (!entry) return;
    entry.fontSize = FONT_SIZE_DEFAULT;
    entry.terminal.options.fontSize = FONT_SIZE_DEFAULT;
    entry.fitAddon.fit();
  };

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
          entry.terminal.write(data);
          // Track activity for status
          if (!processExitedRef.current) {
            const currentStatus =
              usePaneStatusStore.getState().statuses[paneId];
            const wsState = useWorkspaceStore.getState();
            const activeWs = wsState.workspaces.find(
              (w) => w.id === wsState.activeWorkspaceId,
            );
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
    if (sel) void navigator.clipboard.writeText(sel);
  }, []);

  const handlePaste = useCallback(() => {
    void navigator.clipboard.readText().then((text) => {
      entryRef.current?.pty?.write(text);
    });
  }, []);

  const handleClear = useCallback(() => {
    entryRef.current?.terminal.clear();
  }, []);

  const handleReset = useCallback(() => {
    entryRef.current?.terminal.reset();
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
  }, []);

  /* ── Double-click header to expand (layer 1) or maximize (layer 2) ── */
  const handleHeaderDoubleClick = useCallback(() => {
    if (isExpanded) {
      // Layer 2 — maximize/restore within the expanded view
      toggleMaximize(paneId);
    } else if (parentWorkspaceId) {
      // Layer 1 — expand into layer 2
      expandWorkspace(parentWorkspaceId);
    }
  }, [paneId, isExpanded, parentWorkspaceId, toggleMaximize, expandWorkspace]);

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
    const cancelled = { current: false };

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
    };

    setTerminalEntry(paneId, entry);
    entryRef.current = entry;

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

    // Spawn PTY
    void (async () => {
      if (cancelled.current) return;
      await spawnProcess(entry, initialProfile, initialCwd || undefined);
    })();

    return () => {
      cancelled.current = true;
      disposed = true;
      resizeObserver.disconnect();
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

  useEffect(() => {
    if (entryRef.current) {
      entryRef.current.profileId = paneProfileId;
    }
  }, [paneProfileId]);

  useEffect(() => {
    if (isActive && entryRef.current) {
      entryRef.current.terminal.focus();
      // Clear attention status when pane gains focus
      if (paneStatus === 'attention') {
        setStatus(paneId, processExitedRef.current ? 'done' : 'working');
      }
    }
  }, [isActive, paneId, paneStatus, setStatus]);

  const cwdLabel = cwd ? cwd.split(/[\\/]/).pop() : '';

  return (
    <div
      role="application"
      aria-label={`Terminal: ${activeProfile.name}`}
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
        title={
          isExpanded ? 'Double-click to maximize' : 'Double-click to expand'
        }
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

          {/* Maximized indicator (only in layer 2) */}
          {isExpanded && isMaximized && (
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">
              ESC to restore
            </span>
          )}
        </div>

        {/* Header actions — always visible */}
        <div className="flex shrink-0 items-center gap-0.5">
          {/* Split buttons — only in layer 2, visible on hover */}
          {isExpanded && (
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
          )}

          {/* Expand (layer 1) or Maximize/Restore (layer 2) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isExpanded) {
                toggleMaximize(paneId);
              } else if (parentWorkspaceId) {
                expandWorkspace(parentWorkspaceId);
              }
            }}
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded',
              'transition-all duration-100',
              isMaximized
                ? 'text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200'
                : 'text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300',
            )}
            title={
              isExpanded
                ? isMaximized
                  ? 'Restore (Esc)'
                  : 'Maximize (Ctrl+Enter)'
                : 'Expand project (Ctrl+Enter)'
            }
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
        onSplitRight={() => {
          const s = useWorkspaceStore.getState();
          s.addPane(activeProfile.id, 'right');
          if (!s.expandedWorkspaceId && parentWorkspaceId) {
            useWorkspaceStore.getState().expandWorkspace(parentWorkspaceId);
          }
        }}
        onSplitBelow={() => {
          const s = useWorkspaceStore.getState();
          s.addPane(activeProfile.id, 'below');
          if (!s.expandedWorkspaceId && parentWorkspaceId) {
            useWorkspaceStore.getState().expandWorkspace(parentWorkspaceId);
          }
        }}
        onClose_pane={onClose}
      />
    </div>
  );
}
