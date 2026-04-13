import { useState, useEffect, useRef } from 'react';
import { PanelRight, PanelBottom, Bookmark, X, Trash2 } from 'lucide-react';
import { useWorkspaceStore, getActiveWorktree } from '@/store/workspace-store';
import {
  BUILTIN_PRESETS,
  PresetThumbnail,
  captureDockviewLayout,
  useLayoutPresets,
} from '@/features/layouts';
import { dockviewApiRef } from '@/lib/dockview-api';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const profiles = useWorkspaceStore((s) => s.profiles);
  const addPane = useWorkspaceStore((s) => s.addPane);
  const applyPreset = useWorkspaceStore((s) => s.applyPreset);
  const clearAllPanes = useWorkspaceStore((s) => s.clearAllPanes);
  const activeWorktree = useWorkspaceStore(getActiveWorktree);
  const activePreset = activeWorktree?.activePreset ?? null;
  const customLayouts = useWorkspaceStore((s) => s.customLayouts);
  const saveCustomLayout = useWorkspaceStore((s) => s.saveCustomLayout);
  const deleteCustomLayout = useWorkspaceStore((s) => s.deleteCustomLayout);
  const applyCustomLayout = useWorkspaceStore((s) => s.applyCustomLayout);
  const userPresets = useLayoutPresets((s) => s.userPresets);
  const createUserPreset = useLayoutPresets((s) => s.createUserPreset);
  const deleteUserPreset = useLayoutPresets((s) => s.deleteUserPreset);
  const hasPanes = (activeWorktree?.panes.length ?? 0) > 0;
  const [splitDirection, setSplitDirection] = useState<'right' | 'below'>(
    'right',
  );
  const [confirmClear, setConfirmClear] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [layoutName, setLayoutName] = useState('');
  const layoutNameRef = useRef<HTMLInputElement>(null);
  const [savingShape, setSavingShape] = useState(false);
  const [shapeName, setShapeName] = useState('');
  const shapeNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (savingShape) shapeNameRef.current?.focus();
  }, [savingShape]);

  function handleSaveShape(e: React.FormEvent) {
    e.preventDefault();
    const name = shapeName.trim();
    if (!name) return;
    const api = dockviewApiRef.current;
    const tree = api ? captureDockviewLayout(api) : null;
    if (!tree) {
      setSavingShape(false);
      setShapeName('');
      return;
    }
    createUserPreset(name, tree, 'both');
    setShapeName('');
    setSavingShape(false);
  }

  useEffect(() => {
    if (!hasPanes) setConfirmClear(false);
  }, [hasPanes]);

  useEffect(() => {
    if (savingLayout) layoutNameRef.current?.focus();
  }, [savingLayout]);

  function handleSaveLayout(e: React.FormEvent) {
    e.preventDefault();
    const name = layoutName.trim();
    if (!name) return;
    saveCustomLayout(name);
    setLayoutName('');
    setSavingLayout(false);
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900 select-none">
      {/* Split direction toggle */}
      {hasPanes && (
        <div className="p-3 pb-0">
          <h2 className="mb-2 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
            Split Direction
          </h2>
          <div className="flex gap-1">
            <button
              onClick={() => setSplitDirection('right')}
              className={cn(
                'flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium',
                'transition-all duration-150',
                splitDirection === 'right'
                  ? 'bg-zinc-800 text-zinc-200'
                  : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300',
              )}
            >
              <PanelRight size={12} strokeWidth={2} />
              Right
            </button>
            <button
              onClick={() => setSplitDirection('below')}
              className={cn(
                'flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium',
                'transition-all duration-150',
                splitDirection === 'below'
                  ? 'bg-zinc-800 text-zinc-200'
                  : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300',
              )}
            >
              <PanelBottom size={12} strokeWidth={2} />
              Below
            </button>
          </div>
        </div>
      )}

      {/* Profiles section */}
      <div className="p-3">
        <h2 className="mb-2 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
          {hasPanes ? 'Split Terminal' : 'Add Terminal'}
        </h2>
        <div className="flex flex-col gap-1">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => addPane(profile.id, splitDirection)}
              className={cn(
                'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left',
                'text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100',
                'transition-colors',
              )}
            >
              {profile.color && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: profile.color }}
                />
              )}
              <span className="truncate">{profile.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mx-3 border-t border-zinc-800" />

      {/* Layout presets — visual thumbnails */}
      <div className="p-3">
        <h2 className="mb-2 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
          Layouts
        </h2>
        <div className="grid grid-cols-2 gap-1.5">
          {BUILTIN_PRESETS.map((preset) => {
            const isActive = activePreset === preset.name;
            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.name, 'system-shell')}
                title={preset.description ?? preset.name}
                className={cn(
                  'group flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors',
                  isActive
                    ? 'border-blue-500/50 bg-blue-500/[0.08]'
                    : 'border-transparent bg-zinc-800/40 hover:border-zinc-700 hover:bg-zinc-800',
                )}
              >
                <PresetThumbnail
                  tree={preset.tree}
                  size={36}
                  highlighted={isActive}
                />
                <span
                  className={cn(
                    'line-clamp-1 w-full text-center text-[9px]',
                    isActive ? 'text-blue-200' : 'text-zinc-400',
                  )}
                >
                  {preset.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* User-saved shape presets */}
        {userPresets.length > 0 && (
          <div className="mt-3 border-t border-zinc-800 pt-3">
            <h3 className="mb-1.5 text-[9px] font-semibold tracking-wider text-zinc-600 uppercase">
              My Shapes
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {userPresets.map((preset) => {
                const isActive = activePreset === preset.name;
                return (
                  <div key={preset.id} className="group relative">
                    <button
                      onClick={() => {
                        applyPreset(preset.name, 'system-shell');
                      }}
                      title={preset.name}
                      className={cn(
                        'flex w-full flex-col items-center gap-1 rounded-md border p-1.5 transition-colors',
                        isActive
                          ? 'border-blue-500/50 bg-blue-500/[0.08]'
                          : 'border-transparent bg-zinc-800/40 hover:border-zinc-700 hover:bg-zinc-800',
                      )}
                    >
                      <PresetThumbnail
                        tree={preset.tree}
                        size={36}
                        highlighted={isActive}
                      />
                      <span
                        className={cn(
                          'line-clamp-1 w-full text-center text-[9px]',
                          isActive ? 'text-blue-200' : 'text-zinc-400',
                        )}
                      >
                        {preset.name}
                      </span>
                    </button>
                    <button
                      onClick={() => deleteUserPreset(preset.id)}
                      className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded bg-zinc-900/90 text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                      title="Delete preset"
                    >
                      <Trash2 size={9} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Save current arrangement as a shape preset */}
        {hasPanes && (
          <div className="mt-2">
            {savingShape ? (
              <form onSubmit={handleSaveShape} className="flex gap-1">
                <input
                  ref={shapeNameRef}
                  type="text"
                  value={shapeName}
                  onChange={(e) => setShapeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSavingShape(false);
                      setShapeName('');
                    }
                  }}
                  placeholder="Shape name…"
                  className={cn(
                    'min-w-0 flex-1 rounded-md px-2 py-1 text-[11px]',
                    'bg-zinc-800 text-zinc-200 placeholder:text-zinc-600',
                    'border border-zinc-700 outline-none focus:border-blue-500/50',
                  )}
                  spellCheck={false}
                />
                <button
                  type="submit"
                  disabled={!shapeName.trim()}
                  className="rounded-md bg-blue-500/20 px-2 py-1 text-[11px] text-blue-400 transition-colors hover:bg-blue-500/30 disabled:opacity-40"
                >
                  Save
                </button>
              </form>
            ) : (
              <button
                onClick={() => setSavingShape(true)}
                className={cn(
                  'mt-2 flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5',
                  'text-[11px] text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300',
                  'transition-colors',
                )}
                title="Save the current split arrangement as a reusable shape"
              >
                <Bookmark size={10} strokeWidth={2} />
                Save current shape…
              </button>
            )}
          </div>
        )}

        {/* Save current layout */}
        {hasPanes && (
          <div className="mt-2">
            {savingLayout ? (
              <form onSubmit={handleSaveLayout} className="flex gap-1">
                <input
                  ref={layoutNameRef}
                  type="text"
                  value={layoutName}
                  onChange={(e) => setLayoutName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSavingLayout(false);
                      setLayoutName('');
                    }
                  }}
                  placeholder="Layout name…"
                  className={cn(
                    'min-w-0 flex-1 rounded-md px-2 py-1 text-[11px]',
                    'bg-zinc-800 text-zinc-200 placeholder:text-zinc-600',
                    'border border-zinc-700 outline-none focus:border-blue-500/50',
                  )}
                  spellCheck={false}
                />
                <button
                  type="submit"
                  disabled={!layoutName.trim()}
                  className="rounded-md bg-blue-500/20 px-2 py-1 text-[11px] text-blue-400 transition-colors hover:bg-blue-500/30 disabled:opacity-40"
                >
                  Save
                </button>
              </form>
            ) : (
              <button
                onClick={() => setSavingLayout(true)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5',
                  'text-[11px] text-zinc-600 hover:bg-zinc-800/50 hover:text-zinc-400',
                  'transition-colors',
                )}
              >
                <Bookmark size={10} strokeWidth={2} />
                Save current layout…
              </button>
            )}
          </div>
        )}
      </div>

      {/* Saved layouts */}
      {customLayouts.length > 0 && (
        <>
          <div className="mx-3 border-t border-zinc-800" />
          <div className="p-3">
            <h2 className="mb-2 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
              Saved
            </h2>
            <div className="flex flex-col gap-1">
              {customLayouts.map((layout) => (
                <div key={layout.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => applyCustomLayout(layout)}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-left',
                      'text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200',
                    )}
                  >
                    <span className="truncate">{layout.name}</span>
                    <span className="shrink-0 text-xs text-zinc-600">
                      {layout.workspaces.reduce(
                        (n, w) => n + w.panes.length,
                        0,
                      )}
                    </span>
                  </button>
                  <button
                    onClick={() => deleteCustomLayout(layout.id)}
                    className="rounded p-1 text-zinc-700 opacity-0 transition-all group-hover:opacity-100 hover:text-zinc-400"
                    title="Delete saved layout"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Clear all */}
      {hasPanes && (
        <>
          <div className="mx-3 border-t border-zinc-800" />
          <div className="p-3">
            {confirmClear ? (
              <div className="flex flex-col gap-1">
                <p className="mb-0.5 text-center text-[11px] text-zinc-400">
                  Close all terminals?
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      clearAllPanes();
                      setConfirmClear(false);
                    }}
                    className="flex-1 rounded-md bg-red-500/20 px-2 py-1.5 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/30"
                  >
                    Close All
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="flex-1 rounded-md px-2 py-1.5 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-800/50 hover:text-zinc-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className={cn(
                  'flex w-full items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5',
                  'text-sm text-red-400/70 hover:bg-red-500/10 hover:text-red-400',
                  'transition-colors',
                )}
              >
                Close All Terminals
              </button>
            )}
          </div>
        </>
      )}

      <div className="mt-auto border-t border-zinc-800 p-3">
        <p className="text-center text-[10px] text-zinc-600">
          Agent Grid v0.1.0
        </p>
      </div>
    </aside>
  );
}
