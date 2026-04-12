import { useState, useEffect, useMemo } from 'react';
import {
  FolderOpen,
  GitBranch,
  Circle,
  Plus,
  Folder,
  RefreshCw,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspace-store';
import { openFolderDialog } from '@/lib/tauri-shim';
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
  onOpen: () => void;
}

function ProjectCard({ scanned, isOpen, onOpen }: ProjectCardProps) {
  return (
    <button
      onClick={onOpen}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl',
        'border border-white/[0.06] bg-white/[0.02]',
        'transition-all duration-150',
        'hover:border-white/[0.10] hover:bg-white/[0.04]',
        'text-left',
        isOpen && 'ring-1 ring-blue-500/40',
      )}
    >
      <div className="relative flex h-28 w-full items-center justify-center overflow-hidden bg-[#0a0a0f]">
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
    </button>
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

  const [scanned, setScanned] = useState<ScannedProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  return (
    <div className="flex h-full flex-col overflow-auto">
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

      {/* Body */}
      <div className="flex-1 px-8 py-6">
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
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {scannedWithState.map(({ scanned, project, isOpen }) => (
              <ProjectCard
                key={scanned.path}
                scanned={scanned}
                isOpen={isOpen}
                onOpen={() => handleOpen(scanned, project)}
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
                  onOpen={() => openProject(project.id)}
                />
              );
            })}
            <AddFromElsewhereCard />
          </div>
        )}
      </div>
    </div>
  );
}
