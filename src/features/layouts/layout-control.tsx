/**
 * Unified, level-aware layout control — one button, one popover, works
 * identically at Level 2 (dashboard) and Level 3 (focused worktree).
 *
 * Click the button → floating picker with thumbnails. At Level 3 the user
 * can also save the current Dockview arrangement as a reusable shape preset.
 *
 * Positioning: consumer is expected to place this inside a `relative`
 * parent; the popover mounts absolutely below the button.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid } from 'lucide-react';
import { useWorkspaceStore, getActiveWorktree } from '@/store/workspace-store';
import { dockviewApiRef } from '@/lib/dockview-api';
import { cn } from '@/lib/utils';
import { BUILTIN_PRESETS } from './builtin-presets';
import { captureDockviewLayout } from './engine';
import { LayoutPicker } from './layout-picker';
import { useLayoutPresets } from './preset-store';
import { leafCount, type LayoutPreset } from './types';

interface LayoutControlProps {
  /** Which surface is this control for? */
  level: 2 | 3;
  className?: string;
  /** Alignment of the popover relative to the button. Default 'end' = right-aligned. */
  align?: 'start' | 'end';
}

export function LayoutControl({
  level,
  className,
  align = 'end',
}: LayoutControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // ── Level-aware state ─────────────────────────────────────────────────
  //
  // Selectors return primitives only. Splitting by `level` is done outside
  // the subscription so Zustand sees stable selector shape regardless of
  // which branch is active.

  const dashboardPreset = useWorkspaceStore((s) => s.activeDashboardPreset);
  const openCount = useWorkspaceStore((s) => s.openProjectIds.length);
  const worktreePreset = useWorkspaceStore(
    (s) => getActiveWorktree(s)?.activePreset ?? null,
  );
  const worktreePaneCount = useWorkspaceStore(
    (s) => getActiveWorktree(s)?.panes.length ?? 0,
  );

  const activePresetName = level === 2 ? dashboardPreset : worktreePreset;
  const tileCount = level === 2 ? openCount : worktreePaneCount;

  const setDashboardPreset = useWorkspaceStore((s) => s.setDashboardPreset);
  const applyPreset = useWorkspaceStore((s) => s.applyPreset);
  const createUserPreset = useLayoutPresets((s) => s.createUserPreset);
  const userPresets = useLayoutPresets((s) => s.userPresets);

  // Look up the active preset's id for the picker's highlight state.
  // Computed from stable slices above, not recomputed per render.
  const currentPresetId = useMemo(() => {
    if (!activePresetName) return null;
    const match = [...BUILTIN_PRESETS, ...userPresets].find(
      (p) => p.name === activePresetName,
    );
    return match?.id ?? null;
  }, [activePresetName, userPresets]);

  // ── Apply / save handlers ─────────────────────────────────────────────

  const handleApply = (preset: LayoutPreset) => {
    if (level === 2) {
      // Dashboard: only apply presets whose leaf count matches the tile
      // count exactly — otherwise the dashboard falls back to auto-tile
      // and the picker's active state wouldn't match reality.
      if (leafCount(preset.tree) === tileCount) {
        setDashboardPreset(preset.name);
      } else {
        // TODO(future): adapt presets to tile counts; for now, clear to auto-tile
        setDashboardPreset(null);
      }
    } else {
      applyPreset(preset.name, 'system-shell');
    }
    setOpen(false);
  };

  const handleSaveCurrent =
    level === 3
      ? (name: string) => {
          const api = dockviewApiRef.current;
          const tree = api ? captureDockviewLayout(api) : null;
          if (!tree) return;
          createUserPreset(name, tree, 'both');
        }
      : undefined;

  // ── Close on outside click / Escape ───────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // ── Button label: show current preset name (or fallback) ──────────────

  const buttonLabel = activePresetName ?? 'Auto';

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors',
          'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200',
          open && 'bg-white/[0.08] text-zinc-200',
        )}
        title={`Layout: ${buttonLabel} (${tileCount} ${tileCount === 1 ? 'pane' : 'panes'})`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <LayoutGrid size={12} strokeWidth={2} />
        <span className="max-w-[120px] truncate">{buttonLabel}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className={cn(
              'absolute top-full z-50 mt-1',
              align === 'end' ? 'right-0' : 'left-0',
            )}
          >
            <LayoutPicker
              scope={level === 2 ? 'dashboard' : 'worktree'}
              currentPresetId={currentPresetId}
              onApply={handleApply}
              filterByLeafCount={tileCount > 0 ? tileCount : null}
              onSaveCurrent={handleSaveCurrent}
              onClose={() => setOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
