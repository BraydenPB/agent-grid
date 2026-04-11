import { Plus, FolderOpen } from 'lucide-react';
import { useWorkspaceStore, getActiveProject } from '@/store/workspace-store';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';

function ProjectCard({ project }: { project: Project }) {
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const isActive = useWorkspaceStore(
    (s) => getActiveProject(s)?.id === project.id,
  );

  const dirName = project.path?.split(/[\\/]/).pop() || project.name;

  return (
    <button
      onClick={() => setActiveProject(project.id)}
      className={cn(
        'group relative flex flex-col items-start gap-3 rounded-xl p-5',
        'border border-white/[0.06] bg-white/[0.02]',
        'transition-all duration-150',
        'hover:border-white/[0.10] hover:bg-white/[0.04]',
        isActive && 'ring-1 ring-blue-500/30',
      )}
    >
      {/* Color accent bar */}
      {project.color && (
        <span
          className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl"
          style={{ backgroundColor: project.color }}
        />
      )}

      {/* Icon */}
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04]">
        <FolderOpen size={18} className="text-zinc-500" strokeWidth={1.5} />
      </div>

      {/* Name */}
      <div className="flex flex-col items-start gap-1">
        <span className="text-sm font-medium text-zinc-200">
          {project.name}
        </span>
        {project.path && (
          <span className="text-[11px] leading-tight text-zinc-600">
            {dirName}
          </span>
        )}
      </div>

      {/* Workspace count */}
      <span className="text-[10px] text-zinc-600">
        {project.workspaceIds.length} workspace
        {project.workspaceIds.length !== 1 ? 's' : ''}
      </span>
    </button>
  );
}

function AddProjectCard() {
  const addProject = useWorkspaceStore((s) => s.addProject);

  const handleAdd = () => {
    // TODO: PR 3 will add native folder picker via @tauri-apps/plugin-dialog
    const name = window.prompt('Project name:', 'New Project');
    if (name) {
      addProject(name.trim() || 'New Project', '');
    }
  };

  return (
    <button
      onClick={handleAdd}
      className={cn(
        'group flex flex-col items-center justify-center gap-3 rounded-xl p-5',
        'border border-dashed border-white/[0.08]',
        'transition-all duration-150',
        'hover:border-white/[0.15] hover:bg-white/[0.02]',
        'min-h-[140px]',
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] transition-colors group-hover:bg-white/[0.06]">
        <Plus size={18} className="text-zinc-600 group-hover:text-zinc-400" />
      </div>
      <span className="text-[11px] font-medium text-zinc-600 group-hover:text-zinc-400">
        Add Project
      </span>
    </button>
  );
}

export function ProjectGrid() {
  const projects = useWorkspaceStore((s) => s.projects);

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-auto p-8">
      {projects.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center gap-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04]">
            <FolderOpen size={28} className="text-zinc-600" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-lg font-medium text-zinc-300">No projects</h2>
            <p className="text-sm text-zinc-600">
              Add a project folder to get started
            </p>
          </div>
          <AddProjectCard />
        </div>
      ) : (
        /* Project grid */
        <div className="w-full max-w-4xl">
          <h2 className="mb-6 text-sm font-medium text-zinc-500">Projects</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
            <AddProjectCard />
          </div>
        </div>
      )}
    </div>
  );
}
