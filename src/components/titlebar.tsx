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
  PanelRight,
  PanelBottom,
  LayoutGrid,
  Trash2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace-store';
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
  const addPane = useWorkspaceStore((s) => s.addPane);
  const setShowProjectBrowser = useWorkspaceStore(
    (s) => s.setShowProjectBrowser,
  );
  const clearAllPanes = useWorkspaceStore((s) => s.clearAllPanes);
  const toggleMaximize = useWorkspaceStore((s) => s.toggleMaximize);
  const activeWorkspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId),
  );

  const activePaneId = activeWorkspace?.activePaneId ?? null;
  const maximizedPaneId = activeWorkspace?.maximizedPaneId ?? null;
  const panes = activeWorkspace?.panes ?? [];

  const [addOpen, setAddOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasPanes = panes.length > 0;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node))
        setAddOpen(false);
      if (layoutRef.current && !layoutRef.current.contains(e.target as Node)) {
        setLayoutOpen(false);
        setConfirmClear(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
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

        {/* + New dropdown */}
        <div ref={addRef} className="relative">
          <button
            onClick={() => {
              setAddOpen(!addOpen);
              setLayoutOpen(false);
            }}
            className={cn(
              'flex h-10 items-center gap-1.5 px-2.5 text-[11px] font-medium',
              'text-zinc-500 transition-colors duration-150',
              'hover:text-zinc-300',
              addOpen && 'text-zinc-300',
            )}
          >
            <Plus size={12} strokeWidth={2} />
            <span>New</span>
            <ChevronDown
              size={9}
              className={cn(
                'text-zinc-600 transition-transform duration-150',
                addOpen && 'rotate-180',
              )}
            />
          </button>

          <AnimatePresence>
            {addOpen && (
              <motion.div
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="glass-elevated absolute top-full left-0 z-50 mt-0.5 w-44 overflow-hidden rounded-lg py-1"
              >
                <SectionLabel>Terminal</SectionLabel>
                {profiles.map((profile: TerminalProfile) => (
                  <button
                    key={profile.id}
                    onClick={() => {
                      addPane(profile.id, 'right');
                      setAddOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] text-zinc-400',
                      'transition-colors duration-100 hover:bg-white/[0.04] hover:text-zinc-200',
                    )}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: profile.color || '#6b7280' }}
                    />
                    <span className="font-medium">{profile.name}</span>
                  </button>
                ))}

                <Sep />
                <button
                  onClick={() => {
                    setShowProjectBrowser(true);
                    setAddOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] text-zinc-400',
                    'transition-colors duration-100 hover:bg-white/[0.04] hover:text-zinc-200',
                  )}
                >
                  <FolderOpen
                    size={11}
                    className="text-zinc-600"
                    strokeWidth={1.5}
                  />
                  <span className="font-medium">From Project...</span>
                  <span className="ml-auto font-mono text-[9px] text-zinc-600">
                    ^K
                  </span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Layout dropdown — appears when panes exist */}
        {hasPanes && (
          <>
            <div className="h-3.5 w-px bg-white/[0.06]" />
            <div ref={layoutRef} className="relative">
              <button
                onClick={() => {
                  setLayoutOpen(!layoutOpen);
                  setAddOpen(false);
                }}
                className={cn(
                  'flex h-10 items-center gap-1.5 px-2.5 text-[11px] font-medium',
                  'text-zinc-500 transition-colors duration-150',
                  'hover:text-zinc-300',
                  layoutOpen && 'text-zinc-300',
                )}
              >
                <LayoutGrid size={11} strokeWidth={1.5} />
                <span>Layout</span>
                <ChevronDown
                  size={9}
                  className={cn(
                    'text-zinc-600 transition-transform duration-150',
                    layoutOpen && 'rotate-180',
                  )}
                />
              </button>

              <AnimatePresence>
                {layoutOpen && (
                  <motion.div
                    variants={dropdownVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="glass-elevated absolute top-full left-0 z-50 mt-0.5 w-52 overflow-hidden rounded-lg py-1"
                  >
                    <SectionLabel>Split</SectionLabel>
                    <DropdownItem
                      icon={<PanelRight size={12} />}
                      label="Split Right"
                      shortcut="^\u21E7D"
                      onClick={() => {
                        if (activePaneId) {
                          const pane = panes.find(
                            (p: Pane) => p.id === activePaneId,
                          );
                          if (pane) addPane(pane.profileId, 'right');
                        }
                        setLayoutOpen(false);
                      }}
                    />
                    <DropdownItem
                      icon={<PanelBottom size={12} />}
                      label="Split Below"
                      shortcut="^\u21E7E"
                      onClick={() => {
                        if (activePaneId) {
                          const pane = panes.find(
                            (p: Pane) => p.id === activePaneId,
                          );
                          if (pane) addPane(pane.profileId, 'below');
                        }
                        setLayoutOpen(false);
                      }}
                    />

                    {/* Maximize/Restore */}
                    <DropdownItem
                      icon={
                        maximizedPaneId ? (
                          <Minimize2 size={12} />
                        ) : (
                          <Maximize2 size={12} />
                        )
                      }
                      label={
                        maximizedPaneId ? 'Restore Layout' : 'Maximize Pane'
                      }
                      shortcut="^\u21B5"
                      onClick={() => {
                        if (activePaneId) toggleMaximize(activePaneId);
                        setLayoutOpen(false);
                      }}
                    />

                    <Sep />

                    {/* Clear All — destructive, at the bottom */}
                    <button
                      onClick={() => {
                        if (confirmClear) {
                          clearAllPanes();
                          setConfirmClear(false);
                          setLayoutOpen(false);
                          if (confirmTimerRef.current)
                            clearTimeout(confirmTimerRef.current);
                        } else {
                          setConfirmClear(true);
                          confirmTimerRef.current = setTimeout(
                            () => setConfirmClear(false),
                            3000,
                          );
                        }
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-2.5 py-[6px] text-[11px]',
                        'transition-colors duration-100',
                        confirmClear
                          ? 'bg-red-500/[0.08] text-red-400'
                          : 'text-zinc-500 hover:bg-red-500/[0.06] hover:text-red-400',
                      )}
                    >
                      <Trash2 size={12} className="shrink-0" />
                      <span className="flex-1 font-medium">
                        {confirmClear ? 'Confirm Clear All?' : 'Clear All'}
                      </span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
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

function DropdownItem({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-2.5 py-[6px] text-[11px]',
        'text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-100',
        'transition-colors duration-100',
      )}
    >
      <span className="shrink-0 text-zinc-500">{icon}</span>
      <span className="flex-1 font-medium">{label}</span>
      {shortcut && (
        <span className="font-mono text-[9px] tracking-tight text-zinc-600">
          {shortcut}
        </span>
      )}
    </button>
  );
}
