import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, Loader2 } from 'lucide-react';
import { createWorktree } from '@/lib/worktree';
import { useWorkspaceStore, getActiveProject } from '@/store/workspace-store';
import { cn } from '@/lib/utils';

const ease = [0.16, 1, 0.3, 1] as const;

interface WorktreeDialogProps {
  onClose: () => void;
}

export function WorktreeDialog({ onClose }: WorktreeDialogProps) {
  const [branch, setBranch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const project = useWorkspaceStore(getActiveProject);
  const addWorktreeWorkspace = useWorkspaceStore((s) => s.addWorktreeWorkspace);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    const trimmed = branch.trim();
    if (!trimmed || !project?.path) return;

    setLoading(true);
    setError(null);

    // Derive worktree path: sibling directory named after the branch
    const sep = project.path.includes('/') ? '/' : '\\';
    const parentDir = project.path.split(sep).slice(0, -1).join(sep);
    const worktreePath = parentDir + sep + trimmed;

    try {
      const absPath = await createWorktree(project.path, trimmed, worktreePath);
      addWorktreeWorkspace(absPath, trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, [branch, project, addWorktreeWorkspace]);

  if (!project?.path) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="absolute inset-0 z-[60] flex items-start justify-center pt-[12vh]"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
    >
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, y: -6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98 }}
        transition={{ duration: 0.15, ease }}
        className="glass-elevated w-[380px] overflow-hidden rounded-xl"
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.04)' }}
        >
          <GitBranch size={14} className="text-zinc-500" />
          <span className="text-[12px] font-medium text-zinc-200">
            New Worktree
          </span>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="worktree-branch-input"
              className="text-[11px] font-medium text-zinc-500"
            >
              Branch name
            </label>
            <input
              id="worktree-branch-input"
              ref={inputRef}
              type="text"
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
              placeholder="feature/my-branch"
              className={cn(
                'rounded-lg border bg-white/[0.02] px-3 py-2 text-[12px] text-zinc-200 outline-none',
                'placeholder:text-zinc-700',
                'focus:border-blue-500/40',
                error ? 'border-red-500/40' : 'border-white/[0.08]',
              )}
              spellCheck={false}
              disabled={loading}
            />
          </div>

          {/* Preview path */}
          {branch.trim() && (
            <div className="text-[10px] text-zinc-600">
              Worktree will be created at:{' '}
              <span className="text-zinc-500">.../{branch.trim()}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md bg-red-500/[0.08] px-3 py-2 text-[11px] text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.04] px-4 py-3">
          <button
            onClick={onClose}
            disabled={loading}
            className={cn(
              'rounded-lg px-3 py-1.5 text-[11px] font-medium text-zinc-400',
              'transition-colors hover:bg-white/[0.04] hover:text-zinc-200',
            )}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={loading || !branch.trim()}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium',
              'transition-colors',
              'bg-blue-500/20 text-blue-400',
              'hover:bg-blue-500/30',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
          >
            {loading && <Loader2 size={11} className="animate-spin" />}
            Create
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
