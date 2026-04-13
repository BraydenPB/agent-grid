/**
 * User-facing layout picker — grid of preset thumbnails, with support for
 * saving the current arrangement as a named preset and deleting / renaming
 * user presets.
 *
 * Stateless about which preset is applied: the parent passes `currentPresetId`
 * and an `onApply` callback.
 */

import { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUILTIN_PRESETS } from './builtin-presets';
import { useLayoutPresets } from './preset-store';
import { PresetThumbnail } from './preset-thumbnail';
import { leafCount, type LayoutPreset } from './types';

interface LayoutPickerProps {
  scope: 'dashboard' | 'worktree';
  currentPresetId: string | null;
  onApply: (preset: LayoutPreset) => void;
  /**
   * Only show presets whose leaf count matches this value. When `null`,
   * no filter is applied (all scoped presets shown).
   *
   * Applying a preset that doesn't match the current count is destructive
   * (adds or drops panes), so the default UX is to filter strictly.
   */
  filterByLeafCount?: number | null;
  /**
   * If provided, a "Save current layout" button appears. The callback
   * receives the chosen name; the parent is responsible for capturing the
   * current layout tree and calling `createUserPreset` on the store.
   */
  onSaveCurrent?: (name: string) => void;
  onClose?: () => void;
  className?: string;
}

export function LayoutPicker({
  scope,
  currentPresetId,
  onApply,
  filterByLeafCount = null,
  onSaveCurrent,
  onClose,
  className,
}: LayoutPickerProps) {
  // Subscribe to a STABLE slice (the user-presets array itself) and compute
  // the combined+filtered list locally. If we called `s.presetsForScope(scope)`
  // in the selector, it would return a new array on every store notification
  // and trigger a render loop in consumers that subscribe shallow-by-value.
  const userPresets = useLayoutPresets((s) => s.userPresets);
  const renameUserPreset = useLayoutPresets((s) => s.renameUserPreset);
  const deleteUserPreset = useLayoutPresets((s) => s.deleteUserPreset);
  const presets = useMemo(() => {
    const scoped = [...BUILTIN_PRESETS, ...userPresets].filter(
      (p) => p.scope === scope || p.scope === 'both',
    );
    if (filterByLeafCount === null) return scoped;
    return scoped.filter((p) => leafCount(p.tree) === filterByLeafCount);
  }, [userPresets, scope, filterByLeafCount]);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingName, setSavingName] = useState<string | null>(null);

  const commitRename = (id: string) => {
    const v = renameValue.trim();
    if (v) renameUserPreset(id, v);
    setRenaming(null);
  };

  return (
    <div
      className={cn(
        'flex w-[320px] flex-col gap-2 rounded-lg border border-white/[0.08] bg-zinc-950/95 p-3 shadow-2xl backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
          Layouts
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
            aria-label="Close layout picker"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {presets.length === 0 && (
        <div className="rounded border border-dashed border-white/[0.08] px-3 py-6 text-center text-[11px] text-zinc-500">
          {filterByLeafCount === null ? (
            <>No saved presets in this scope yet.</>
          ) : (
            <>
              No presets for {filterByLeafCount}{' '}
              {filterByLeafCount === 1 ? 'pane' : 'panes'}.
              {onSaveCurrent && (
                <span className="mt-1 block text-zinc-600">
                  Save your current arrangement below to add one.
                </span>
              )}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {presets.map((preset) => {
          const isActive = preset.id === currentPresetId;
          const isRenaming = renaming === preset.id;
          return (
            <div
              key={preset.id}
              className={cn(
                'group relative flex flex-col items-stretch gap-1 rounded-md border p-2 text-left transition-colors',
                isActive
                  ? 'border-blue-500/60 bg-blue-500/[0.06]'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]',
              )}
            >
              <button
                type="button"
                onClick={() => onApply(preset)}
                className="flex flex-col items-center gap-1 focus:outline-none"
                title={preset.description ?? preset.name}
              >
                <PresetThumbnail tree={preset.tree} highlighted={isActive} />
                {!isRenaming && (
                  <span
                    className={cn(
                      'line-clamp-1 w-full text-center text-[10px]',
                      isActive ? 'text-blue-200' : 'text-zinc-400',
                    )}
                  >
                    {preset.name}
                  </span>
                )}
              </button>

              {isRenaming && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    commitRename(preset.id);
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- input appears only after user clicks rename/save, focus is expected
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(preset.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    className="min-w-0 flex-1 rounded border border-white/[0.08] bg-zinc-900 px-1 py-0.5 text-[10px] text-zinc-200 outline-none focus:border-blue-500/60"
                  />
                </form>
              )}

              {!preset.builtin && !isRenaming && (
                <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => {
                      setRenameValue(preset.name);
                      setRenaming(preset.id);
                    }}
                    className="flex h-4 w-4 items-center justify-center rounded bg-zinc-900/80 text-zinc-400 hover:text-zinc-200"
                    title="Rename"
                  >
                    <Pencil size={9} />
                  </button>
                  <button
                    onClick={() => deleteUserPreset(preset.id)}
                    className="flex h-4 w-4 items-center justify-center rounded bg-zinc-900/80 text-zinc-400 hover:text-red-300"
                    title="Delete"
                  >
                    <Trash2 size={9} />
                  </button>
                </div>
              )}

              {isActive && (
                <div className="absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500/80 text-white">
                  <Check size={10} strokeWidth={3} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {onSaveCurrent && (
        <div className="border-t border-white/[0.06] pt-2">
          {savingName === null ? (
            <button
              onClick={() => setSavingName('')}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-white/[0.10] px-2 py-1.5 text-[11px] text-zinc-400 transition-colors hover:border-white/[0.20] hover:text-zinc-200"
            >
              <Plus size={11} />
              Save current as preset
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = savingName.trim();
                if (name) {
                  onSaveCurrent(name);
                  setSavingName(null);
                }
              }}
              className="flex items-center gap-1.5"
            >
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus -- input appears only after user clicks "Save current", focus is expected
                autoFocus
                value={savingName}
                onChange={(e) => setSavingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSavingName(null);
                }}
                placeholder="Preset name…"
                className="min-w-0 flex-1 rounded border border-white/[0.10] bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-blue-500/60"
              />
              <button
                type="submit"
                className="rounded bg-blue-500/80 px-2 py-1 text-[11px] text-white hover:bg-blue-500"
              >
                Save
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
