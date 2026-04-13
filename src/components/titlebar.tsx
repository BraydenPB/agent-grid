import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Minus,
  Square,
  X,
  Plus,
  Terminal,
  ChevronDown,
  FolderOpen,
  Check,
} from 'lucide-react';
import { useWorkspaceStore, getActiveWorktree } from '@/store/workspace-store';
import { LayoutControl } from '@/features/layouts/layout-control';
import { getAppWindow } from '@/lib/tauri-shim';
import { cn } from '@/lib/utils';
import type { Pane, TerminalProfile } from '@/types';

const ease = [0.16, 1, 0.3, 1] as const;

const dropdownVariants = {
  hidden: { opacity: 0, y: -2, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.12, ease },
  },
  exit: {
    opacity: 0,
    y: -2,
    scale: 0.98,
    transition: { duration: 0.08, ease: 'easeIn' as const },
  },
};

export function Titlebar() {
  const profiles = useWorkspaceStore((s) => s.profiles);
  const defaultProfileId = useWorkspaceStore((s) => s.defaultProfileId);
  const setDefaultProfileId = useWorkspaceStore((s) => s.setDefaultProfileId);
  const goToFolderBrowser = useWorkspaceStore((s) => s.goToFolderBrowser);
  const currentLevel = useWorkspaceStore((s) => s.currentLevel);
  const activeWorkspace = useWorkspaceStore(getActiveWorktree);

  const activePaneId = activeWorkspace?.activePaneId ?? null;
  const panes = activeWorkspace?.panes ?? [];

  const [shellOpen, setShellOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const hasPanes = panes.length > 0 && currentLevel >= 2;
  const showLayoutControl = currentLevel === 2 || currentLevel === 3;

  const defaultProfile =
    profiles.find((p) => p.id === defaultProfileId) ?? profiles[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (shellRef.current && !shellRef.current.contains(e.target as Node))
        setShellOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, []);

  return (
    <header
      className="glass flex h-10 shrink-0 items-center justify-between select-none"
      style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}
      data-tauri-drag-region
    >
      {/* Left section */}
      <div className="flex h-full items-center">
        {/* Brand */}
        <div
          className="flex items-center gap-2 pr-3 pl-4"
          data-tauri-drag-region
        >
          <div
            className="flex h-4 w-4 items-center justify-center rounded"
            style={{ background: 'var(--accent-gradient)' }}
          >
            <Terminal size={9} className="text-white" strokeWidth={2.5} />
          </div>
          <span
            className="text-[12px] font-semibold tracking-tight text-zinc-300"
            data-tauri-drag-region
          >
            Agent Grid
          </span>
        </div>

        <div className="h-3.5 w-px bg-white/[0.06]" />

        {/* Shell dropdown — single entry point for "start new work".
            - Click a shell: sets it as the default terminal and opens the
              project browser (Level 1). Opening any project from there spawns
              its first pane with the chosen shell.
            - "Browse projects": jumps to L1 without changing the default.
            In-place pane-adds at L2/L3 are handled by the sidebar and the
            command palette (Ctrl+K). */}
        <div ref={shellRef} className="relative">
          <button
            onClick={() => setShellOpen(!shellOpen)}
            className={cn(
              'flex h-10 items-center gap-1.5 px-2.5 text-[11px] font-medium',
              'text-zinc-500 transition-colors duration-150',
              'hover:text-zinc-300',
              shellOpen && 'text-zinc-300',
            )}
            title="Default shell — click to change and open the project browser"
            aria-haspopup="menu"
            aria-expanded={shellOpen}
          >
            <Plus size={12} strokeWidth={2} />
            {defaultProfile && (
              <>
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: defaultProfile.color || '#6b7280',
                  }}
                />
                <span className="max-w-[110px] truncate">
                  {defaultProfile.name}
                </span>
              </>
            )}
            <ChevronDown
              size={9}
              className={cn(
                'text-zinc-600 transition-transform duration-150',
                shellOpen && 'rotate-180',
              )}
            />
          </button>

          <AnimatePresence>
            {shellOpen && (
              <motion.div
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="glass-elevated absolute top-full left-0 z-50 mt-0.5 w-56 overflow-hidden rounded-lg py-1"
              >
                <SectionLabel>Open project with</SectionLabel>
                {profiles.map((profile: TerminalProfile) => {
                  const isDefault = profile.id === defaultProfileId;
                  return (
                    <button
                      key={profile.id}
                      onClick={() => {
                        setDefaultProfileId(profile.id);
                        goToFolderBrowser();
                        setShellOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px]',
                        'transition-colors duration-100 hover:bg-white/[0.04] hover:text-zinc-200',
                        isDefault ? 'text-zinc-200' : 'text-zinc-400',
                      )}
                      title={
                        isDefault
                          ? `${profile.name} — current default, go to projects`
                          : `Set ${profile.name} as default and go to projects`
                      }
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: profile.color || '#6b7280' }}
                      />
                      <span className="font-medium">{profile.name}</span>
                      {isDefault && (
                        <Check
                          size={11}
                          strokeWidth={2.5}
                          className="ml-auto text-zinc-400"
                        />
                      )}
                    </button>
                  );
                })}
                <Sep />
                <button
                  onClick={() => {
                    goToFolderBrowser();
                    setShellOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] text-zinc-400',
                    'transition-colors duration-100 hover:bg-white/[0.04] hover:text-zinc-200',
                  )}
                  title="Go to the project browser without changing the default shell"
                >
                  <FolderOpen
                    size={11}
                    className="text-zinc-600"
                    strokeWidth={1.5}
                  />
                  <span className="font-medium">Browse projects</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Unified Layouts button — single source of truth for dashboard
            + worktree preset application. Replaces the old "Layout" dropdown
            (Split Right/Below, Maximize, Clear All) whose actions are still
            available via keyboard shortcuts and the command palette. */}
        {showLayoutControl && (
          <>
            <div className="h-3.5 w-px bg-white/[0.06]" />
            <div className="flex h-10 items-center px-2.5">
              <LayoutControl level={currentLevel === 2 ? 2 : 3} align="start" />
            </div>
          </>
        )}
      </div>

      {/* Right section */}
      <div className="flex h-full items-center" data-tauri-drag-region>
        {/* Pane indicator */}
        {hasPanes && (
          <div
            className="mr-1 flex items-center gap-1 px-2"
            data-tauri-drag-region
          >
            {panes.map((pane: Pane, i: number) => (
              <button
                key={pane.id}
                onClick={() =>
                  useWorkspaceStore.getState().setActivePaneId(pane.id)
                }
                title={`Pane ${i + 1}${pane.id === activePaneId ? ' (active)' : ''}`}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-all duration-150',
                  pane.id === activePaneId ? 'scale-125' : 'hover:opacity-80',
                )}
                style={{
                  backgroundColor:
                    pane.id === activePaneId
                      ? 'var(--accent-1)'
                      : 'rgba(255,255,255,0.15)',
                  boxShadow:
                    pane.id === activePaneId
                      ? '0 0 4px var(--accent-glow)'
                      : 'none',
                }}
              />
            ))}
          </div>
        )}

        <div className="mr-0.5 h-3.5 w-px bg-white/[0.06]" />

        {/* Window controls */}
        <button
          onClick={() => void getAppWindow().then((w) => w?.minimize())}
          className="inline-flex h-10 w-10 items-center justify-center text-zinc-600 transition-colors duration-100 hover:bg-white/[0.04] hover:text-zinc-300"
          title="Minimize"
        >
          <Minus size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => void getAppWindow().then((w) => w?.toggleMaximize())}
          className="inline-flex h-10 w-10 items-center justify-center text-zinc-600 transition-colors duration-100 hover:bg-white/[0.04] hover:text-zinc-300"
          title="Maximize"
        >
          <Square size={10} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => void getAppWindow().then((w) => w?.close())}
          className="inline-flex h-10 w-10 items-center justify-center text-zinc-600 transition-colors duration-100 hover:bg-red-500/[0.08] hover:text-red-400"
          title="Close"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}

/* ── Dropdown primitives ── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-1.5 pb-0.5">
      <span className="text-[9px] font-semibold tracking-[0.06em] text-zinc-600 uppercase">
        {children}
      </span>
    </div>
  );
}

function Sep() {
  return <div className="mx-2 my-1 h-px bg-white/[0.04]" />;
}
