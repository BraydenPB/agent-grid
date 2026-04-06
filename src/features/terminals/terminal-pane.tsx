import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { ImageAddon } from "@xterm/addon-image";
import { getPlatform, spawnPty, type ShimPty } from "@/lib/tauri-shim";
import "@xterm/xterm/css/xterm.css";
import type { TerminalProfile } from "@/types";
import { resolveShellCommand } from "@/lib/profiles";
import { cn } from "@/lib/utils";
import { TerminalSearch } from "./terminal-search";
import { TerminalContextMenu } from "./terminal-context-menu";

/* ── Constants ── */
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_DEFAULT = 13;

const TERMINAL_THEME = {
  background: "#0a0a0f",
  foreground: "#c8ccd4",
  cursor: "#528bff",
  cursorAccent: "#0a0a0f",
  selectionBackground: "rgba(59, 130, 246, 0.25)",
  selectionForeground: "#e4e8f0",
  selectionInactiveBackground: "rgba(59, 130, 246, 0.12)",
  black: "#3b4048",
  red: "#f47067",
  green: "#57ab5a",
  yellow: "#e0a658",
  blue: "#6cb6ff",
  magenta: "#c678dd",
  cyan: "#56d4dd",
  white: "#abb2bf",
  brightBlack: "#636d83",
  brightRed: "#f47067",
  brightGreen: "#7ee787",
  brightYellow: "#f0c674",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#76e4f7",
  brightWhite: "#e6edf3",
} as const;

/* ── Types ── */
interface TerminalPaneProps {
  profile: TerminalProfile;
  isActive: boolean;
  onFocus: () => void;
  onClose: () => void;
  paneId: string;
}

export function TerminalPane({ profile, isActive, onFocus, onClose, paneId }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const ptyRef = useRef<ShimPty | null>(null);
  const mountedRef = useRef(false);
  const fontSizeRef = useRef(FONT_SIZE_DEFAULT);

  const [searchVisible, setSearchVisible] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0, y: 0, visible: false,
  });
  const [cwd, setCwd] = useState<string>("");

  /* ── Addon loading ── */
  const loadAddons = useCallback((term: Terminal, fitAddon: FitAddon) => {
    // Core: fit
    term.loadAddon(fitAddon);

    // GPU rendering (with fallback)
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch {
      // Canvas renderer fallback
    }

    // Search
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    // Clickable links
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.open(uri, "_blank", "noopener");
    }, {
      urlRegex: /https?:\/\/[^\s'")\]}>]+/g,
    });
    term.loadAddon(webLinksAddon);

    // System clipboard via OSC 52
    const clipboardAddon = new ClipboardAddon();
    term.loadAddon(clipboardAddon);

    // Session serialization (for future restore)
    const serializeAddon = new SerializeAddon();
    term.loadAddon(serializeAddon);
    serializeAddonRef.current = serializeAddon;

    // Full unicode support (CJK, emoji widths)
    const unicodeAddon = new Unicode11Addon();
    term.loadAddon(unicodeAddon);
    term.unicode.activeVersion = "11";

    // Inline images (sixel, iTerm2 protocol)
    try {
      const imageAddon = new ImageAddon();
      term.loadAddon(imageAddon);
    } catch {
      // Image addon may fail in some environments
    }

    // Ligatures — loaded async because it uses font introspection
    import("@xterm/addon-ligatures").then(({ LigaturesAddon }) => {
      try {
        term.loadAddon(new LigaturesAddon());
      } catch {
        // Ligatures not available
      }
    }).catch(() => {});
  }, []);

  /* ── Keyboard shortcuts ── */
  const attachKeyboardShortcuts = useCallback((term: Terminal) => {
    term.attachCustomKeyEventHandler((e) => {
      // Ctrl+Shift+F → open search
      if (e.ctrlKey && e.shiftKey && e.key === "F" && e.type === "keydown") {
        setSearchVisible(true);
        return false;
      }

      // Ctrl+Shift+C → copy selection
      if (e.ctrlKey && e.shiftKey && e.key === "C" && e.type === "keydown") {
        const sel = term.getSelection();
        if (sel) navigator.clipboard.writeText(sel);
        return false;
      }

      // Ctrl+Shift+V → paste from clipboard
      if (e.ctrlKey && e.shiftKey && e.key === "V" && e.type === "keydown") {
        navigator.clipboard.readText().then((text) => {
          ptyRef.current?.write(text);
        });
        return false;
      }

      // Ctrl+= / Ctrl+- → font zoom
      if (e.ctrlKey && !e.shiftKey && e.key === "=" && e.type === "keydown") {
        changeFontSize(1);
        return false;
      }
      if (e.ctrlKey && !e.shiftKey && e.key === "-" && e.type === "keydown") {
        changeFontSize(-1);
        return false;
      }
      // Ctrl+0 → reset font size
      if (e.ctrlKey && !e.shiftKey && e.key === "0" && e.type === "keydown") {
        resetFontSize();
        return false;
      }

      return true;
    });
  }, []);

  /* ── Font zoom ── */
  const changeFontSize = (delta: number) => {
    const term = terminalRef.current;
    if (!term) return;
    const next = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, fontSizeRef.current + delta));
    if (next === fontSizeRef.current) return;
    fontSizeRef.current = next;
    term.options.fontSize = next;
    fitAddonRef.current?.fit();
  };

  const resetFontSize = () => {
    const term = terminalRef.current;
    if (!term) return;
    fontSizeRef.current = FONT_SIZE_DEFAULT;
    term.options.fontSize = FONT_SIZE_DEFAULT;
    fitAddonRef.current?.fit();
  };

  /* ── OSC sequence handler for shell integration ── */
  const attachOscHandlers = useCallback((term: Terminal) => {
    // OSC 7 — current working directory
    // Shells emit: \e]7;file://hostname/path\a
    term.parser.registerOscHandler(7, (data) => {
      try {
        const url = new URL(data);
        setCwd(decodeURIComponent(url.pathname));
      } catch {
        // Some shells emit just the path
        if (data.startsWith("/") || /^[A-Z]:[\\/]/i.test(data)) {
          setCwd(data);
        }
      }
      return true;
    });

    // OSC 133 — VS Code-style command marks (prompt/command/output boundaries)
    // A = prompt start, B = prompt end (command start), C = command executed, D = command finished
    term.parser.registerOscHandler(133, () => {
      // Future: emit events for command detection, exit code markers, etc.
      // For now, just parse and acknowledge
      // data.charAt(0) is the mark type: A, B, C, or D
      return true;
    });

    // OSC 0 / OSC 2 — set window/tab title
    term.parser.registerOscHandler(0, () => {
      // Could update pane title from shell — hook into store later
      return false; // Let xterm handle it too
    });
    term.parser.registerOscHandler(2, () => {
      return false;
    });
  }, []);

  /* ── Context menu handlers ── */
  const handleCopy = useCallback(() => {
    const term = terminalRef.current;
    if (!term) return;
    const sel = term.getSelection();
    if (sel) navigator.clipboard.writeText(sel);
  }, []);

  const handlePaste = useCallback(() => {
    navigator.clipboard.readText().then((text) => {
      ptyRef.current?.write(text);
    });
  }, []);

  const handleClear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const handleReset = useCallback(() => {
    terminalRef.current?.reset();
  }, []);

  /* ── Right-click ── */
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
  }, []);

  /* ── Terminal initialization ── */
  const initTerminal = useCallback(async () => {
    if (!containerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      fontSize: FONT_SIZE_DEFAULT,
      fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
      fontWeight: "400",
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
    fitAddonRef.current = fitAddon;
    terminalRef.current = term;

    term.open(containerRef.current);
    loadAddons(term, fitAddon);
    attachKeyboardShortcuts(term);
    attachOscHandlers(term);

    fitAddon.fit();

    // Spawn PTY
    const osPlatform = getPlatform();
    const { command, args } = resolveShellCommand(profile, osPlatform);

    // Build env with shell integration hints
    const env: Record<string, string> = {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      TERM_PROGRAM: "agent-grid",
      ...profile.env,
    };

    let pty: ShimPty;
    try {
      const { spawn } = await import("tauri-pty");
      pty = spawn(command, args, {
        cols: term.cols,
        rows: term.rows,
        cwd: profile.cwd,
        env,
      }) as unknown as ShimPty;
    } catch {
      pty = spawnPty();
    }

    pty.onData((data: Uint8Array) => term.write(data));
    term.onData((data: string) => pty.write(data));
    term.onResize(({ cols, rows }) => pty.resize(cols, rows));

    pty.onExit(({ exitCode }: { exitCode: number }) => {
      const color = exitCode === 0 ? "38;5;243" : "38;5;203";
      const icon = exitCode === 0 ? "✓" : "✗";
      term.write(`\r\n\x1b[${color}m${icon} Process exited with code ${exitCode}\x1b[0m\r\n`);
    });

    ptyRef.current = pty;

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fitAddon.fit());
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      pty.kill();
      term.dispose();
      mountedRef.current = false;
    };
  }, [profile, loadAddons, attachKeyboardShortcuts, attachOscHandlers]);

  useEffect(() => {
    let cleanupFn: (() => void) | undefined;
    initTerminal().then((fn) => { cleanupFn = fn; });
    return () => cleanupFn?.();
  }, [initTerminal]);

  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive]);

  return (
    <div
      className={cn(
        "flex flex-col h-full rounded-xl overflow-hidden transition-all duration-300 relative",
        "gradient-border",
        isActive && "active glow-sm"
      )}
      style={{
        border: isActive ? "none" : "1px solid rgba(255,255,255,0.05)",
        background: "#0a0a0f",
      }}
      onMouseDown={onFocus}
      onContextMenu={handleContextMenu}
    >
      {/* Pane header */}
      <div className={cn(
        "pane-drag-handle flex items-center justify-between px-3 py-1.5",
        "select-none cursor-grab active:cursor-grabbing",
        "border-b transition-colors duration-200",
        isActive
          ? "bg-white/[0.04] border-white/[0.06]"
          : "bg-white/[0.02] border-white/[0.03]"
      )}>
        <div className="flex items-center gap-2 min-w-0">
          {profile.color && (
            <span
              className={cn(
                "w-2 h-2 rounded-full shrink-0 transition-all duration-300",
                isActive ? "scale-100" : "scale-90 opacity-60"
              )}
              style={{
                backgroundColor: profile.color,
                boxShadow: isActive ? `0 0 8px ${profile.color}40` : "none",
              }}
            />
          )}
          <span className={cn(
            "text-[11px] font-medium tracking-wide transition-colors duration-200 truncate",
            isActive ? "text-zinc-300" : "text-zinc-500"
          )}>
            {profile.name}
          </span>
          {cwd && (
            <span className="text-[10px] text-zinc-600 truncate max-w-[200px]" title={cwd}>
              {cwd.split(/[\\/]/).pop()}
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="text-zinc-600 hover:text-zinc-300 transition-all duration-150 rounded p-0.5 hover:bg-white/[0.06]"
          title="Close pane"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Search overlay */}
      <TerminalSearch
        searchAddon={searchAddonRef.current}
        visible={searchVisible}
        onClose={() => {
          setSearchVisible(false);
          terminalRef.current?.focus();
        }}
      />

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
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
        hasSelection={!!terminalRef.current?.getSelection()}
      />
    </div>
  );
}
