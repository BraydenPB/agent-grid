import { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FolderOpen,
  GitBranch,
  Circle,
  Plus,
  Folder,
  RefreshCw,
  Check,
  LayoutGrid,
  Columns2,
  Rows2,
  Square,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace-store';
import { openFolderDialog } from '@/lib/tauri-shim';
import { GRID_PRESETS } from '@/lib/grid-presets';
import { cn } from '@/lib/utils';

interface ScannedProject {
  name: string;
  path: string;
  gitBranch: string | null;
  gitDirty: boolean;
  lastModified: number;
}

function timeAgo(unixSecs: number): string {
  if (!unixSecs) return '';
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return `${Math.floor(diff / 604800)}w`;
}

interface ProjectCardProps {
  scanned: ScannedProject;
  isOpen: boolean;
  isSelected: boolean;
  selectionActive: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onRangeSelect: () => void;
}

function ProjectCard({
  scanned,
  isOpen,
  isSelected,
  selectionActive,
  onOpen,
  onToggleSelect,
  onRangeSelect,
}: ProjectCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      onRangeSelect();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onToggleSelect();
      return;
    }
    onOpen();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-xl',
        'border border-white/[0.06] bg-white/[0.02]',
        'transition-all duration-150',
        'hover:border-white/[0.10] hover:bg-white/[0.04]',
        'text-left',
        'outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
        isSelected
          ? 'ring-2 ring-blue-500/70'
          : isOpen && 'ring-1 ring-blue-500/40',
      )}
    >
      <div className="relative flex h-28 w-full items-center justify-center overflow-hidden bg-[#0a0a0f]">
        {/* Selection checkbox — visible on hover, when selected, or while a selection is active */}
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={isSelected ? 'Deselect project' : 'Select project'}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={cn(
            'absolute top-2 left-2 flex h-5 w-5 cursor-pointer items-center justify-center rounded-[5px]',
            'transition-all duration-100',
            isSelected || selectionActive
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100',
            isSelected
              ? 'border border-blue-500 bg-blue-500'
              : 'border border-white/30 bg-zinc-900/70 hover:border-white/60',
          )}
          title={isSelected ? 'Deselect' : 'Select'}
        >
          {isSelected && (
            <Check size={12} className="text-white" strokeWidth={3} />
          )}
        </button>
        <Folder size={28} className="text-zinc-700" strokeWidth={1.5} />
        {isOpen && (
          <span className="absolute top-2 right-2 rounded-full bg-blue-500/20 px-2 py-0.5 text-[9px] font-medium text-blue-400">
            Open
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-zinc-950/80 to-transparent" />
      </div>

      <div className="flex flex-col gap-1.5 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-zinc-200">
            {scanned.name}
          </span>
          {scanned.lastModified > 0 && (
            <span className="shrink-0 text-[10px] text-zinc-600">
              {timeAgo(scanned.lastModified)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {scanned.gitBranch && (
            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
              <GitBranch size={9} strokeWidth={2} />
              <span className="max-w-[100px] truncate">
                {scanned.gitBranch}
              </span>
              {scanned.gitDirty && (
                <Circle
                  size={5}
                  className="fill-yellow-500/80 text-yellow-500/80"
                  strokeWidth={0}
                />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AddFromElsewhereCard() {
  const addProject = useWorkspaceStore((s) => s.addProject);

  const handleAdd = async () => {
    try {
      const folderPath = await openFolderDialog();
      if (!folderPath) return;
      const name = folderPath.split(/[\\/]/).pop() || 'New Project';
      addProject(name, folderPath);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      onClick={() => void handleAdd()}
      className={cn(
        'group flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-xl p-5',
        'border border-dashed border-white/[0.08]',
        'transition-all duration-150',
        'hover:border-white/[0.15] hover:bg-white/[0.02]',
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] transition-colors group-hover:bg-white/[0.06]">
        <Plus size={18} className="text-zinc-600 group-hover:text-zinc-400" />
      </div>
      <span className="text-[11px] font-medium text-zinc-600 group-hover:text-zinc-400">
        Add from elsewhere
      </span>
    </button>
  );
}

export function FolderBrowser() {
  const rootFolderPath = useWorkspaceStore((s) => s.rootFolderPath);
  const setRootFolderPath = useWorkspaceStore((s) => s.setRootFolderPath);
  const setProjectsPath = useWorkspaceStore((s) => s.setProjectsPath);
  const projects = useWorkspaceStore((s) => s.projects);
  const openProjectIds = useWorkspaceStore((s) => s.openProjectIds);
  const openProject = useWorkspaceStore((s) => s.openProject);
  const addProject = useWorkspaceStore((s) => s.addProject);
  const openProjectsAction = useWorkspaceStore((s) => s.openProjects);

  const [scanned, setScanned] = useState<ScannedProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Multi-select state (keyed by path — unique across scanned + external)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  const [presetName, setPresetName] = useState<string | null>(null);

  // Scan the root folder
  useEffect(() => {
    if (!rootFolderPath) return;
    let ignore = false;

    setLoading(true);
    setError(null);
    void import('@tauri-apps/api/core')
      .then(({ invoke }) =>
        invoke<ScannedProject[]>('list_projects', { dir: rootFolderPath }),
      )
      .then((result) => {
        if (!ignore) setScanned(result);
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
  }, [rootFolderPath, refreshKey]);

  // Map scanned folders to existing projects (by path) for open-state detection
  const scannedWithState = useMemo(() => {
    return scanned.map((s) => {
      const existing = projects.find((p) => p.path === s.path);
      return {
        scanned: s,
        project: existing,
        isOpen: existing ? openProjectIds.includes(existing.id) : false,
      };
    });
  }, [scanned, projects, openProjectIds]);

  // Projects that don't match any scanned folder (added from elsewhere)
  const externalProjects = useMemo(() => {
    const scannedPaths = new Set(scanned.map((s) => s.path));
    return projects.filter((p) => !scannedPaths.has(p.path));
  }, [projects, scanned]);

  const handleOpen = (
    scannedProject: ScannedProject,
    existing: (typeof projects)[number] | undefined,
  ) => {
    if (existing) {
      openProject(existing.id);
    } else {
      // Create project from scanned folder, then it auto-opens
      addProject(scannedProject.name, scannedProject.path);
    }
  };

  const handleChangeFolder = async () => {
    try {
      const folderPath = await openFolderDialog();
      if (!folderPath) return;
      setRootFolderPath(folderPath);
      setProjectsPath(folderPath);
    } catch {
      /* ignore */
    }
  };

  /* ── Multi-select ── */

  // Paths in display order (scanned first, then external). Used for range-select.
  const orderedPaths = useMemo(() => {
    const scannedPaths = scannedWithState.map((s) => s.scanned.path);
    const externalPaths = externalProjects.map((p) => p.path);
    return [...scannedPaths, ...externalPaths];
  }, [scannedWithState, externalProjects]);

  const handleToggleSelect = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setAnchorPath(path);
  }, []);

  const handleRangeSelect = useCallback(
    (path: string) => {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (!anchorPath) {
          next.add(path);
          return next;
        }
        const startIdx = orderedPaths.indexOf(anchorPath);
        const endIdx = orderedPaths.indexOf(path);
        if (startIdx === -1 || endIdx === -1) {
          next.add(path);
          return next;
        }
        const [lo, hi] =
          startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        for (let i = lo; i <= hi; i++) {
          const p = orderedPaths[i];
          if (p) next.add(p);
        }
        return next;
      });
      // Do not move anchor on range-select; keeps subsequent ranges consistent.
    },
    [anchorPath, orderedPaths],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedPaths(new Set());
    setAnchorPath(null);
    setPresetName(null);
  }, []);

  // Esc clears selection when anything is selected.
  useEffect(() => {
    if (selectedPaths.size === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClearSelection();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedPaths.size, handleClearSelection]);

  // If a selected path is no longer in the ordered list (folder removed), drop it.
  useEffect(() => {
    setSelectedPaths((prev) => {
      const valid = new Set<string>();
      for (const p of prev) if (orderedPaths.includes(p)) valid.add(p);
      return valid.size === prev.size ? prev : valid;
    });
  }, [orderedPaths]);

  const handleOpenSelected = useCallback(() => {
    if (selectedPaths.size === 0) return;
    const store = useWorkspaceStore.getState();
    const ids: string[] = [];
    for (const path of selectedPaths) {
      const existing = store.projects.find((p) => p.path === path);
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const scannedItem = scanned.find((s) => s.path === path);
      const name =
        scannedItem?.name ?? path.split(/[\\/]/).pop() ?? 'New Project';
      ids.push(store.addProject(name, path));
    }
    openProjectsAction(ids, presetName);
    handleClearSelection();
  }, [
    selectedPaths,
    scanned,
    presetName,
    openProjectsAction,
    handleClearSelection,
  ]);

  // Presets that exactly fit (existing open + new selected) count.
  const availablePresets = useMemo(() => {
    const desiredCount = openProjectIds.length + selectedPaths.size;
    return GRID_PRESETS.filter((p) => p.panelCount === desiredCount);
  }, [openProjectIds.length, selectedPaths.size]);

  // Reset preset when the chosen one stops fitting the current count.
  useEffect(() => {
    if (!presetName) return;
    if (!availablePresets.some((p) => p.name === presetName)) {
      setPresetName(null);
    }
  }, [availablePresets, presetName]);

  const selectionActive = selectedPaths.size > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.04] px-8 py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-sm font-medium text-zinc-300">Projects</h2>
          <button
            onClick={() => void handleChangeFolder()}
            className="flex items-center gap-1.5 text-left text-[11px] text-zinc-600 transition-colors hover:text-zinc-400"
            title="Click to change root folder"
          >
            <FolderOpen size={11} strokeWidth={1.5} />
            <span className="truncate font-mono">
              {rootFolderPath ?? 'No folder selected'}
            </span>
          </button>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            'text-zinc-600 transition-colors duration-100',
            'hover:bg-white/[0.06] hover:text-zinc-300',
            'disabled:opacity-50',
          )}
          title="Refresh"
        >
          <RefreshCw
            size={12}
            strokeWidth={2}
            className={loading ? 'animate-spin' : ''}
          />
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {!rootFolderPath ? (
          <div className="flex h-full items-center justify-center">
            <button
              onClick={() => void handleChangeFolder()}
              className={cn(
                'flex flex-col items-center gap-4 rounded-xl p-8',
                'border border-dashed border-white/[0.08]',
                'hover:border-white/[0.15] hover:bg-white/[0.02]',
                'transition-colors',
              )}
            >
              <FolderOpen
                size={32}
                className="text-zinc-600"
                strokeWidth={1.5}
              />
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm font-medium text-zinc-400">
                  Choose a projects folder
                </span>
                <span className="text-[11px] text-zinc-600">
                  e.g. ~/Desktop/Projects
                </span>
              </div>
            </button>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-sm text-red-400/80">Couldn't read folder</p>
              <p className="max-w-md text-[11px] text-zinc-600">{error}</p>
            </div>
          </div>
        ) : loading && scanned.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-600">Scanning folder...</p>
          </div>
        ) : scanned.length === 0 && externalProjects.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-sm font-medium text-zinc-400">
                No projects found
              </p>
              <p className="text-[11px] text-zinc-600">
                This folder contains no subfolders
              </p>
            </div>
            <AddFromElsewhereCard />
          </div>
        ) : (
          <>
            {/* Multi-select hint — shown only when nothing is selected */}
            {!selectionActive && orderedPaths.length > 1 && (
              <p className="mb-3 text-[11px] text-zinc-600">
                Click to open · Ctrl/⌘-click or checkbox to select multiple ·
                Shift-click for range
              </p>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {scannedWithState.map(({ scanned, project, isOpen }) => (
                <ProjectCard
                  key={scanned.path}
                  scanned={scanned}
                  isOpen={isOpen}
                  isSelected={selectedPaths.has(scanned.path)}
                  selectionActive={selectionActive}
                  onOpen={() => handleOpen(scanned, project)}
                  onToggleSelect={() => handleToggleSelect(scanned.path)}
                  onRangeSelect={() => handleRangeSelect(scanned.path)}
                />
              ))}
              {externalProjects.map((project) => {
                const isOpen = openProjectIds.includes(project.id);
                const scannedShape: ScannedProject = {
                  name: project.name,
                  path: project.path,
                  gitBranch: null,
                  gitDirty: false,
                  lastModified: 0,
                };
                return (
                  <ProjectCard
                    key={project.id}
                    scanned={scannedShape}
                    isOpen={isOpen}
                    isSelected={selectedPaths.has(project.path)}
                    selectionActive={selectionActive}
                    onOpen={() => openProject(project.id)}
                    onToggleSelect={() => handleToggleSelect(project.path)}
                    onRangeSelect={() => handleRangeSelect(project.path)}
                  />
                );
              })}
              <AddFromElsewhereCard />
            </div>
          </>
        )}
      </div>

      {/* Selection action bar — slides in when selection is non-empty */}
      <AnimatePresence>
        {selectionActive && (
          <SelectionActionBar
            count={selectedPaths.size}
            availablePresets={availablePresets}
            presetName={presetName}
            onPickPreset={setPresetName}
            onOpen={handleOpenSelected}
            onClear={handleClearSelection}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Selection action bar ── */

const PRESET_ICON_MAP: Record<string, React.ReactNode> = {
  Single: <Square size={12} strokeWidth={1.75} />,
  'Side by Side': <Columns2 size={12} strokeWidth={1.75} />,
  '2×2 Grid': <LayoutGrid size={12} strokeWidth={1.75} />,
  '1 + 2 Stack': <LayoutGrid size={12} strokeWidth={1.75} />,
  '3 Column': <Rows2 size={12} strokeWidth={1.75} className="rotate-90" />,
  '2×3 Grid': <LayoutGrid size={12} strokeWidth={1.75} />,
  '2×4 Grid (8 panes)': <LayoutGrid size={12} strokeWidth={1.75} />,
};

interface SelectionActionBarProps {
  count: number;
  availablePresets: typeof GRID_PRESETS;
  presetName: string | null;
  onPickPreset: (name: string | null) => void;
  onOpen: () => void;
  onClear: () => void;
}

function SelectionActionBar({
  count,
  availablePresets,
  presetName,
  onPickPreset,
  onOpen,
  onClear,
}: SelectionActionBarProps) {
  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 24, opacity: 0 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.06] bg-zinc-950/95 px-6 py-3 backdrop-blur-sm"
    >
      <span className="text-[12px] text-zinc-300">
        <strong className="font-semibold text-zinc-100">{count}</strong>{' '}
        selected
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-medium tracking-wide text-zinc-600 uppercase">
          Layout
        </span>
        {availablePresets.map((preset) => (
          <button
            key={preset.name}
            onClick={() => onPickPreset(preset.name)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium',
              'transition-colors duration-100',
              presetName === preset.name
                ? 'bg-blue-500/25 text-blue-200 ring-1 ring-blue-400/40'
                : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200',
            )}
            title={`Open in ${preset.name} layout`}
          >
            {PRESET_ICON_MAP[preset.name] ?? (
              <LayoutGrid size={12} strokeWidth={1.75} />
            )}
            <span>{preset.name}</span>
          </button>
        ))}
        <button
          onClick={() => onPickPreset(null)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium',
            'transition-colors duration-100',
            presetName === null
              ? 'bg-blue-500/25 text-blue-200 ring-1 ring-blue-400/40'
              : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200',
          )}
          title="Auto-tile based on project count"
        >
          <LayoutGrid size={12} strokeWidth={1.75} />
          <span>Auto tile</span>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onClear}
          className="rounded-md px-3 py-1.5 text-[11px] text-zinc-500 transition-colors duration-100 hover:bg-white/[0.04] hover:text-zinc-300"
        >
          Clear
        </button>
        <button
          onClick={onOpen}
          className={cn(
            'rounded-md px-3.5 py-1.5 text-[11px] font-semibold',
            'bg-blue-500 text-white transition-colors duration-100',
            'hover:bg-blue-400',
          )}
        >
          Open {count} {count === 1 ? 'project' : 'projects'}
        </button>
      </div>
    </motion.div>
  );
}
