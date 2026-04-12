import { ArrowLeft } from 'lucide-react';
import { useWorkspaceStore, getActiveProject } from '@/store/workspace-store';
import { cn } from '@/lib/utils';

export function BreadcrumbBar() {
  const project = useWorkspaceStore(getActiveProject);
  const goToDashboard = useWorkspaceStore((s) => s.goToDashboard);

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
        onClick={goToDashboard}
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded',
          'text-zinc-600 transition-colors duration-100',
          'hover:bg-white/[0.06] hover:text-zinc-300',
        )}
        title="Back to dashboard"
      >
        <ArrowLeft size={12} strokeWidth={2} />
      </button>

      {/* Project name */}
      <span className="font-medium text-zinc-400">{project.name}</span>
    </div>
  );
}
