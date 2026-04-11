import { useWorkspaceStore, getActiveWorkspace } from '@/store/workspace-store';
import { cn } from '@/lib/utils';

interface ShortcutHint {
  key: string;
  label: string;
}

const PANE_SHORTCUTS: ShortcutHint[] = [
  { key: '^T', label: 'New' },
  { key: '^⇧D', label: 'Split R' },
  { key: '^⇧E', label: 'Split B' },
  { key: '^W', label: 'Close' },
  { key: '^↵', label: 'Max' },
  { key: '^K', label: 'Projects' },
  { key: '^⇧P', label: 'Palette' },
  { key: '^Tab', label: 'Next' },
  { key: '^Alt+↑↓←→', label: 'Navigate' },
];

const EMPTY_SHORTCUTS: ShortcutHint[] = [
  { key: '^K', label: 'Projects' },
  { key: '^⇧P', label: 'Palette' },
];

export function ShortcutBar() {
  const hasPanes = useWorkspaceStore((s) => {
    const ws = getActiveWorkspace(s);
    return (ws?.panes.length ?? 0) > 0;
  });
  const hints = hasPanes ? PANE_SHORTCUTS : EMPTY_SHORTCUTS;

  return (
    <div
      className={cn(
        'flex h-5 shrink-0 items-center justify-center gap-3 px-3',
        'border-t border-white/[0.04] bg-zinc-950',
        'select-none',
      )}
    >
      {hints.map((hint) => (
        <span key={hint.key} className="flex items-center gap-1">
          <kbd className="rounded bg-white/[0.03] px-1 py-px font-mono text-[9px] text-zinc-500">
            {hint.key}
          </kbd>
          <span className="text-[9px] text-zinc-600">{hint.label}</span>
        </span>
      ))}
    </div>
  );
}
