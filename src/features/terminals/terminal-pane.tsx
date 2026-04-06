import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { getPlatform, spawnPty, type ShimPty } from "@/lib/tauri-shim";
import "@xterm/xterm/css/xterm.css";
import type { TerminalProfile } from "@/types";
import { resolveShellCommand } from "@/lib/profiles";
import { cn } from "@/lib/utils";

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
  const ptyRef = useRef<ShimPty | null>(null);
  const mountedRef = useRef(false);

  const initTerminal = useCallback(async () => {
    if (!containerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
      fontWeight: "400",
      letterSpacing: 0,
      lineHeight: 1.35,
      theme: {
        background: "#0a0a0f",
        foreground: "#c8ccd4",
        cursor: "#528bff",
        cursorAccent: "#0a0a0f",
        selectionBackground: "rgba(59, 130, 246, 0.25)",
        selectionForeground: "#e4e8f0",
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
      },
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      // WebGL not available — canvas renderer works fine
    }

    fitAddon.fit();

    const osPlatform = getPlatform();
    const { command, args } = resolveShellCommand(profile, osPlatform);

    let pty: ShimPty;
    try {
      const { spawn } = await import("tauri-pty");
      pty = spawn(command, args, {
        cols: term.cols,
        rows: term.rows,
        cwd: profile.cwd,
        env: { TERM: "xterm-256color", ...profile.env },
      }) as unknown as ShimPty;
    } catch {
      pty = spawnPty();
    }

    pty.onData((data: Uint8Array) => term.write(data));
    term.onData((data: string) => pty.write(data));
    term.onResize(({ cols, rows }) => pty.resize(cols, rows));

    pty.onExit(({ exitCode }: { exitCode: number }) => {
      term.write(`\r\n\x1b[38;5;241m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
    });

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    ptyRef.current = pty;

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
  }, [profile]);

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
        "flex flex-col h-full rounded-xl overflow-hidden transition-all duration-300",
        "gradient-border",
        isActive && "active glow-sm"
      )}
      style={{
        border: isActive ? "none" : "1px solid rgba(255,255,255,0.05)",
        background: "#0a0a0f",
      }}
      onMouseDown={onFocus}
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
        <div className="flex items-center gap-2">
          {profile.color && (
            <span
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-300",
                isActive ? "scale-100" : "scale-90 opacity-60"
              )}
              style={{
                backgroundColor: profile.color,
                boxShadow: isActive ? `0 0 8px ${profile.color}40` : "none",
              }}
            />
          )}
          <span className={cn(
            "text-[11px] font-medium tracking-wide transition-colors duration-200",
            isActive ? "text-zinc-300" : "text-zinc-500"
          )}>
            {profile.name}
          </span>
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

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        data-pane-id={paneId}
      />
    </div>
  );
}
