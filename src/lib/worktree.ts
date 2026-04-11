/**
 * Git worktree operations via Tauri backend commands.
 */

const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
}

export async function listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
  if (!isTauri) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<WorktreeInfo[]>('list_worktrees', { cwd });
}

export async function createWorktree(
  cwd: string,
  branch: string,
  path: string,
): Promise<string> {
  if (!isTauri) throw new Error('Worktrees require Tauri runtime');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('create_worktree', { cwd, branch, path });
}
