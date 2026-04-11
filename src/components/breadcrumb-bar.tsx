import { ArrowLeft, ChevronRight } from 'lucide-react';
import {
  useWorkspaceStore,
  getActiveProject,
  getActiveWorkspace,
} from '@/store/workspace-store';
import { cn } from '@/lib/utils';

export function BreadcrumbBar() {
  const project = useWorkspaceStore(getActiveProject);
  const workspace = useWorkspaceStore(getActiveWorkspace);
  const goToLevel1 = useWorkspaceStore((s) => s.goToLevel1);

  if (!project) return null;

  return (
    <div
      className={cn(
        'flex h-7 shrink-0 items-center gap-1 px-3',
        'border-b border-white/[0.04] bg-zinc-950/60',
        'text-[11px] select-none',
      )}
    >
      {/* Back button */}
      <button
        onClick={goToLevel1}
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded',
          'text-zinc-600 transition-colors duration-100',
          'hover:bg-white/[0.06] hover:text-zinc-300',
        )}
        title="Back to projects"
      >
        <ArrowLeft size={12} strokeWidth={2} />
      </button>

      {/* Project name */}
      <button
        onClick={goToLevel1}
        className="font-medium text-zinc-400 transition-colors hover:text-zinc-200"
      >
        {project.name}
      </button>

      {/* Separator */}
      <ChevronRight size={10} className="text-zinc-700" />

      {/* Workspace name */}
      <span className="text-zinc-600">{workspace?.name ?? 'Default'}</span>
    </div>
  );
}
