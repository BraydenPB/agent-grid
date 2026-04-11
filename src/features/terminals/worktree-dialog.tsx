import { useState, useRef, useEffect, useCallback } from 'react';
import { GitBranch, X, Loader2, FolderOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  listWorktrees,
  createWorktree,
  type WorktreeInfo,
} from '@/lib/worktree';
import { cn } from '@/lib/utils';

interface WorktreeDialogProps {
  cwd: string;
  onClose: () => void;
  onCreated: (worktreePath: string) => void;
}

export function WorktreeDialog({
  cwd,
  onClose,
  onCreated,
}: WorktreeDialogProps) {
  const [branch, setBranch] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listWorktrees(cwd)
      .then((wts) => {
        if (!cancelled) {
          setWorktrees(wts);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const projectName = cwd.split(/[\\/]/).pop() || 'project';

  const handleCreate = useCallback(async () => {
    if (!branch.trim()) return;
    setCreating(true);
    setError(null);

    // Default path: sibling directory named project.branch
    const safeBranch = branch.trim().replace(/[/\\]/g, '-');
    const parentDir = cwd.replace(/[\\/][^\\/]+$/, '');
    const wtPath = `${parentDir}/${projectName}.${safeBranch}`;

    try {
      const createdPath = await createWorktree(cwd, branch.trim(), wtPath);
      onCreated(createdPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCreating(false);
    }
  }, [branch, cwd, projectName, onCreated]);

  const handleOpenExisting = useCallback(
    (wt: WorktreeInfo) => {
      onCreated(wt.path);
    },
    [onCreated],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className={cn(
          'w-[400px] rounded-lg border border-white/[0.08]',
          'bg-zinc-900 shadow-2xl',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <GitBranch size={14} className="text-zinc-400" />
            <span className="text-[12px] font-medium text-zinc-200">
              Worktrees
            </span>
            <span className="text-[10px] text-zinc-600">{projectName}</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"
          >
            <X size={12} />
          </button>
        </div>

        {/* Existing worktrees */}
        {worktrees.length > 0 && (
          <div className="border-b border-white/[0.06] px-4 py-2">
            <span className="text-[10px] font-medium tracking-wider text-zinc-600 uppercase">
              Existing
            </span>
            <div className="mt-1.5 space-y-1">
              {worktrees.map((wt) => (
                <button
                  key={wt.path}
                  onClick={() => handleOpenExisting(wt)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5',
                    'text-left transition-colors',
                    'hover:bg-white/[0.06]',
                  )}
                >
                  <FolderOpen size={10} className="shrink-0 text-zinc-600" />
                  <span className="truncate text-[11px] text-zinc-400">
                    {wt.branch || '(no branch)'}
                  </span>
                  {wt.isMain && (
                    <span className="rounded bg-white/[0.06] px-1 text-[9px] text-zinc-600">
                      main
                    </span>
                  )}
                  <span className="ml-auto truncate text-[9px] text-zinc-700">
                    {wt.path.split(/[\\/]/).pop()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 px-4 py-3">
            <Loader2 size={12} className="animate-spin text-zinc-600" />
            <span className="text-[11px] text-zinc-600">
              Loading worktrees...
            </span>
          </div>
        )}

        {/* Create new */}
        <div className="px-4 py-3">
          <span className="text-[10px] font-medium tracking-wider text-zinc-600 uppercase">
            Create New Worktree
          </span>
          <div className="mt-2 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
                if (e.key === 'Escape') onClose();
              }}
              placeholder="Branch name..."
              disabled={creating}
              className={cn(
                'flex-1 rounded border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5',
                'text-[11px] text-zinc-200 placeholder:text-zinc-700',
                'outline-none focus:border-blue-500/40',
                creating && 'opacity-50',
              )}
              spellCheck={false}
            />
            <button
              onClick={() => void handleCreate()}
              disabled={creating || !branch.trim()}
              className={cn(
                'flex items-center gap-1.5 rounded px-3 py-1.5',
                'text-[11px] font-medium transition-colors',
                creating || !branch.trim()
                  ? 'bg-white/[0.04] text-zinc-700'
                  : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30',
              )}
            >
              {creating ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <GitBranch size={10} />
              )}
              Create
            </button>
          </div>
          {error && (
            <p className="mt-2 text-[10px] leading-relaxed text-red-400">
              {error}
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
