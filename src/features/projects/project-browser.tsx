import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
  Folder,
  GitBranch,
  Search,
  Circle,
  ArrowUpRight,
  X,
  Terminal,
  Keyboard,
  Columns2,
  LayoutGrid,
  Rows2,
  Square,
  Command,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';
import { GRID_PRESETS } from '@/lib/grid-presets';
import type { TerminalProfile } from '@/types';

/* ── Types ── */
interface ProjectInfo {
  name: string;
  path: string;
  gitBranch: string | null;
  gitDirty: boolean;
  lastModified: number;
}

/* ── Animation ── */
const ease = [0.16, 1, 0.3, 1] as const;

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.02, delayChildren: 0.04 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease } },
};

/* ── Helpers ── */
function timeAgo(unixSecs: number): string {
  if (!unixSecs) return '';
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return `${Math.floor(diff / 604800)}w`;
}

const PRESET_ICONS: Record<string, React.ReactNode> = {
  Single: <Square size={14} strokeWidth={1.5} />,
  'Side by Side': <Columns2 size={14} strokeWidth={1.5} />,
  '2×2 Grid': <LayoutGrid size={14} strokeWidth={1.5} />,
  '3 Column': <Rows2 size={14} strokeWidth={1.5} className="rotate-90" />,
};

/* ── Main component ── */
interface ProjectBrowserProps {
  overlay?: boolean;
  onClose?: () => void;
}

export function ProjectBrowser({
  overlay = false,
  onClose,
}: ProjectBrowserProps) {
  const {
    profiles,
    projectsPath,
    addPane,
    addPaneWithCwd,
    applyPreset,
    setShowProjectBrowser,
    changeDirPaneId,
    setChangeDirPaneId,
    setPendingCwd,
  } = useWorkspaceStore();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectsPath) return;
    let ignore = false;

    setLoading(true);
    setError(null);
    invoke<ProjectInfo[]>('list_projects', { dir: projectsPath })
      .then((result) => {
        if (!ignore) setProjects(result);
      })
      .catch((e) => {
        if (!ignore) setError(String(e));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [projectsPath]);

  useEffect(() => {
    const timer = setTimeout(() => searchRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const filtered = search
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
      )
    : projects;

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const isChangeDirMode = overlay && !!changeDirPaneId;

  const handleLaunch = useCallback(
    (project: ProjectInfo, profile: TerminalProfile) => {
      if (changeDirPaneId && isChangeDirMode) {
        setPendingCwd(changeDirPaneId, project.path);
        setChangeDirPaneId(null);
        onClose?.();
        return;
      }
      addPaneWithCwd(profile.id, project.path);
      if (overlay) onClose?.();
      else setShowProjectBrowser(false);
    },
    [
      changeDirPaneId,
      isChangeDirMode,
      setPendingCwd,
      setChangeDirPaneId,
      onClose,
      addPaneWithCwd,
      overlay,
      setShowProjectBrowser,
    ],
  );

  const handleSelectDirectory = useCallback(
    (project: ProjectInfo) => {
      if (changeDirPaneId && isChangeDirMode) {
        setPendingCwd(changeDirPaneId, project.path);
        setChangeDirPaneId(null);
        onClose?.();
      }
    },
    [
      changeDirPaneId,
      isChangeDirMode,
      setPendingCwd,
      setChangeDirPaneId,
      onClose,
    ],
  );

  // Overlay dismiss
  useEffect(() => {
    if (!overlay) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        onClose?.();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overlay, onClose]);

  // Keyboard
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && overlay) {
        onClose?.();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter') {
        const item = filtered[selectedIndex];
        const defaultProfile = profiles[0];
        if (item && isChangeDirMode) handleSelectDirectory(item);
        else if (item && defaultProfile) handleLaunch(item, defaultProfile);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [
    overlay,
    onClose,
    filtered,
    selectedIndex,
    profiles,
    isChangeDirMode,
    handleSelectDirectory,
    handleLaunch,
  ]);

  // Scroll into view
  useEffect(() => {
    if (!listRef.current) return;
    const rows = listRef.current.querySelectorAll('[data-project-row]');
    rows[selectedIndex]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [selectedIndex]);

  const dirName = projectsPath.split(/[\\/]/).pop() || 'Projects';

  /* ── Overlay mode: command-palette style ── */
  if (overlay) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="absolute inset-0 z-50 flex items-start justify-center pt-[12vh]"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
      >
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.15, ease }}
          className="glass-elevated flex max-h-[70vh] w-[480px] flex-col overflow-hidden rounded-xl"
        >
          {/* Search header */}
          <div
            className="flex h-11 shrink-0 items-center gap-2 px-4"
            style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.04)' }}
          >
            <Search size={13} className="shrink-0 text-zinc-600" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isChangeDirMode ? 'Change directory...' : 'Open project...'
              }
              className="flex-1 border-none bg-transparent text-[12px] text-zinc-200 outline-none placeholder:text-zinc-600"
              spellCheck={false}
            />
            <div className="flex shrink-0 items-center gap-1">
              <Kbd>&uarr;&darr;</Kbd>
              <Kbd>&crarr;</Kbd>
            </div>
            <button
              onClick={onClose}
              className="rounded p-0.5 text-zinc-600 transition-colors duration-100 hover:text-zinc-300"
            >
              <X size={12} strokeWidth={2} />
            </button>
          </div>

          {/* Results */}
          <div className="min-h-0 flex-1 overflow-y-auto py-1" ref={listRef}>
            {loading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState message={error} />
            ) : filtered.length === 0 ? (
              <EmptyState search={search} onClear={() => setSearch('')} />
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {filtered.map((project, i) => (
                  <ProjectRow
                    key={project.path}
                    project={project}
                    profiles={profiles}
                    isSelected={i === selectedIndex}
                    onSelect={() => setSelectedIndex(i)}
                    onLaunch={
                      isChangeDirMode
                        ? () => handleSelectDirectory(project)
                        : (profile) => handleLaunch(project, profile)
                    }
                    compact
                    hideProfiles={isChangeDirMode}
                  />
                ))}
              </motion.div>
            )}
          </div>

          {/* Footer */}
          {!loading && filtered.length > 0 && (
            <div
              className="flex shrink-0 items-center justify-between px-4 py-2 text-[10px] text-zinc-600"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
            >
              <span>
                {filtered.length} project{filtered.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                {isChangeDirMode ? (
                  <div className="flex items-center gap-1">
                    <Folder size={9} />
                    <span>Enter changes directory</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Terminal size={9} />
                    <span>Enter opens Shell</span>
                  </div>
                )}
                <span className="text-zinc-700">|</span>
                <span>Esc to close</span>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    );
  }

  /* ── Full-page mode: landing experience ── */
  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto">
      <div className="w-full max-w-[600px] px-6 pt-10 pb-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease }}
          className="mb-8"
        >
          <div className="mb-3 flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'var(--accent-gradient)' }}
            >
              <Terminal size={16} className="text-white" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-[16px] font-semibold tracking-tight text-zinc-100">
                Agent Grid
              </h1>
              <p className="text-[11px] text-zinc-500">
                Multi-pane AI terminal workspace
              </p>
            </div>
          </div>
        </motion.div>

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease, delay: 0.05 }}
          className="mb-8"
        >
          <p className="mb-3 text-[10px] font-semibold tracking-[0.08em] text-zinc-600 uppercase">
            Quick Start
          </p>
          <div className="grid grid-cols-2 gap-2">
            {/* New terminal — primary CTA */}
            <button
              onClick={() => addPane(profiles[0]!.id)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3.5 py-3 text-left',
                'text-zinc-200 transition-all duration-100',
                'bg-white/[0.04] hover:bg-white/[0.07]',
              )}
              style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.06)' }}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.06]">
                <Terminal
                  size={14}
                  strokeWidth={1.5}
                  className="text-zinc-300"
                />
              </div>
              <div>
                <span className="text-[12px] font-medium">New Terminal</span>
                <span className="block text-[10px] text-zinc-500">Ctrl+T</span>
              </div>
            </button>

            {/* Command palette */}
            <button
              onClick={() =>
                useWorkspaceStore.getState().setShowCommandPalette(true)
              }
              className={cn(
                'flex items-center gap-3 rounded-lg px-3.5 py-3 text-left',
                'text-zinc-200 transition-all duration-100',
                'bg-white/[0.04] hover:bg-white/[0.07]',
              )}
              style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.06)' }}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.06]">
                <Command
                  size={14}
                  strokeWidth={1.5}
                  className="text-zinc-300"
                />
              </div>
              <div>
                <span className="text-[12px] font-medium">Command Palette</span>
                <span className="block text-[10px] text-zinc-500">
                  Ctrl+Shift+P
                </span>
              </div>
            </button>
          </div>

          {/* Preset layout strip */}
          <div className="mt-3 flex items-center gap-1.5">
            <span className="mr-1 text-[10px] text-zinc-600">Layouts:</span>
            {GRID_PRESETS.slice(0, 5).map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset.name, profiles[0]!.id)}
                title={preset.name}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-medium',
                  'text-zinc-500 transition-colors duration-100 hover:text-zinc-300',
                  'hover:bg-white/[0.04]',
                )}
                style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.04)' }}
              >
                {PRESET_ICONS[preset.name] || (
                  <LayoutGrid size={12} strokeWidth={1.5} />
                )}
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* AI Profiles */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease, delay: 0.1 }}
          className="mb-8"
        >
          <p className="mb-3 text-[10px] font-semibold tracking-[0.08em] text-zinc-600 uppercase">
            AI Agents
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => addPane(profile.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2',
                  'text-zinc-400 transition-all duration-100 hover:text-zinc-200',
                  'bg-white/[0.02] hover:bg-white/[0.05]',
                )}
                style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.04)' }}
                title={`Launch ${profile.name}`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: profile.color || '#6b7280' }}
                />
                <span className="text-[11px] font-medium">{profile.name}</span>
                <Zap size={9} className="text-zinc-700" />
              </button>
            ))}
          </div>
        </motion.div>

        {/* Projects section */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease, delay: 0.15 }}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold tracking-[0.08em] text-zinc-600 uppercase">
              Projects
              <span className="ml-1.5 font-normal text-zinc-700">
                {dirName}
              </span>
            </p>
            {!loading && (
              <span className="text-[10px] text-zinc-700">
                {filtered.length}
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search
              size={13}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-600"
            />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className={cn(
                'h-9 w-full rounded-lg pr-3 pl-9 text-[12px] text-zinc-200',
                'transition-all duration-100 outline-none placeholder:text-zinc-600',
                'bg-white/[0.03]',
                'focus:bg-white/[0.05] focus:ring-1 focus:ring-white/[0.1]',
              )}
              style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.05)' }}
            />
          </div>

          {/* Project list */}
          <div
            ref={listRef}
            className="max-h-[40vh] overflow-y-auto rounded-lg"
            style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.04)' }}
          >
            {loading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState message={error} />
            ) : filtered.length === 0 ? (
              <EmptyState search={search} onClear={() => setSearch('')} />
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {filtered.map((project, i) => (
                  <ProjectRow
                    key={project.path}
                    project={project}
                    profiles={profiles}
                    isSelected={i === selectedIndex}
                    onSelect={() => setSelectedIndex(i)}
                    onLaunch={(profile) => handleLaunch(project, profile)}
                  />
                ))}
              </motion.div>
            )}
          </div>

          {/* Keyboard hints */}
          {!loading && filtered.length > 0 && (
            <div className="mt-3 flex items-center gap-4 text-[10px] text-zinc-700">
              <div className="flex items-center gap-1">
                <Kbd>&uarr;&darr;</Kbd>
                <span>navigate</span>
              </div>
              <div className="flex items-center gap-1">
                <Kbd>&crarr;</Kbd>
                <span>open</span>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <Keyboard size={9} />
                <span>hover for profiles</span>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

/* ── Shared components ── */

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="rounded bg-white/[0.03] px-1 py-0.5 font-mono text-[9px] leading-none text-zinc-600"
      style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.05)' }}
    >
      {children}
    </kbd>
  );
}

function LoadingState() {
  return (
    <div className="flex h-24 items-center justify-center">
      <div className="flex items-center gap-2 text-[11px] text-zinc-600">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          className="h-3 w-3 rounded-full border-[1.5px] border-zinc-700 border-t-zinc-500"
        />
        Scanning...
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center">
      <p className="text-[11px] text-red-400/70">{message}</p>
    </div>
  );
}

function EmptyState({
  search,
  onClear,
}: {
  search: string;
  onClear: () => void;
}) {
  return (
    <div className="flex h-24 flex-col items-center justify-center gap-1">
      <p className="text-[11px] text-zinc-600">
        {search ? 'No matches' : 'No projects found'}
      </p>
      {search && (
        <button
          onClick={onClear}
          className="text-[10px] text-zinc-500 transition-colors duration-100 hover:text-zinc-300"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}

/* ── Project Row ── */
function ProjectRow({
  project,
  profiles,
  isSelected,
  onSelect,
  onLaunch,
  compact,
  hideProfiles,
}: {
  project: ProjectInfo;
  profiles: TerminalProfile[];
  isSelected: boolean;
  onSelect: () => void;
  onLaunch: (profile: TerminalProfile) => void;
  compact?: boolean;
  hideProfiles?: boolean;
}) {
  return (
    <motion.div
      variants={fadeUp}
      data-project-row
      onMouseEnter={onSelect}
      className={cn(
        'group flex cursor-default items-center gap-3 px-3 py-2 transition-colors duration-75',
        isSelected ? 'bg-white/[0.04]' : 'bg-transparent',
        compact ? 'mx-1 rounded-md' : '',
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded',
          project.gitBranch ? 'bg-blue-500/[0.06]' : 'bg-white/[0.02]',
        )}
      >
        <Folder
          size={12}
          className={project.gitBranch ? 'text-blue-400/50' : 'text-zinc-600'}
          strokeWidth={1.5}
        />
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-[11px] leading-tight font-medium text-zinc-200">
          {project.name}
        </span>
        {project.gitBranch && (
          <div className="flex shrink-0 items-center gap-1">
            <GitBranch size={9} className="text-zinc-700" strokeWidth={2} />
            <span className="max-w-[70px] truncate text-[10px] leading-tight text-zinc-600">
              {project.gitBranch}
            </span>
            {project.gitDirty && (
              <Circle
                size={3}
                className="fill-amber-500/60 text-amber-500/60"
              />
            )}
          </div>
        )}
      </div>

      {/* Timestamp */}
      {project.lastModified > 0 && (
        <span
          className={cn(
            'shrink-0 text-[10px] leading-tight tabular-nums transition-opacity duration-75',
            isSelected ? 'text-zinc-600 opacity-0' : 'text-zinc-700',
          )}
        >
          {timeAgo(project.lastModified)}
        </span>
      )}

      {/* Profile pills — visible on select, hidden in change-dir mode */}
      {!hideProfiles && (
        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5 transition-opacity duration-75',
            isSelected ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          {profiles.slice(0, 4).map((profile) => (
            <button
              key={profile.id}
              onClick={(e) => {
                e.stopPropagation();
                onLaunch(profile);
              }}
              title={profile.name}
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                'transition-colors duration-75',
                'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200',
              )}
            >
              <span
                className="h-[5px] w-[5px] shrink-0 rounded-full"
                style={{ backgroundColor: profile.color || '#6b7280' }}
              />
              <span className="leading-none">{profile.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Quick open */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onLaunch(profiles[0]!);
        }}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded',
          'transition-all duration-75',
          isSelected
            ? 'text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300'
            : 'opacity-0',
        )}
        title="Open with Shell"
      >
        <ArrowUpRight size={11} strokeWidth={2} />
      </button>
    </motion.div>
  );
}
