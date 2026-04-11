import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, Command } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceStore, getActiveWorkspace } from '@/store/workspace-store';
import { GRID_PRESETS } from '@/lib/grid-presets';

/* ── Action registry ── */
export interface PaletteAction {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

function buildActions(): PaletteAction[] {
  const store = useWorkspaceStore.getState;
  const actions: PaletteAction[] = [];

  // Navigation
  actions.push(
    {
      id: 'focus-next',
      label: 'Focus Next Pane',
      shortcut: 'Ctrl+Tab',
      category: 'Navigation',
      action: () => store().focusNextPane(),
    },
    {
      id: 'focus-prev',
      label: 'Focus Previous Pane',
      shortcut: 'Ctrl+[',
      category: 'Navigation',
      action: () => store().focusPrevPane(),
    },
  );

  // For Alt+1-9 shortcuts
  for (let i = 1; i <= 9; i++) {
    actions.push({
      id: `focus-pane-${i}`,
      label: `Focus Pane ${i}`,
      shortcut: `Alt+${i}`,
      category: 'Navigation',
      action: () => store().focusPaneByIndex(i - 1),
    });
  }

  // Pane management
  actions.push(
    {
      id: 'new-shell',
      label: 'New Shell Terminal',
      shortcut: 'Ctrl+T',
      category: 'Terminals',
      action: () => store().addPane('system-shell', 'right'),
    },
    {
      id: 'close-pane',
      label: 'Close Active Pane',
      shortcut: 'Ctrl+W',
      category: 'Terminals',
      action: () => {
        const s = store();
        const ws = getActiveWorkspace(s);
        if (ws?.activePaneId) s.removePane(ws.activePaneId);
      },
    },
    {
      id: 'split-right',
      label: 'Split Right',
      shortcut: 'Ctrl+Shift+D',
      category: 'Terminals',
      action: () => {
        const s = store();
        const ws = getActiveWorkspace(s);
        const profileId =
          ws?.panes.find((p) => p.id === ws?.activePaneId)?.profileId ??
          'system-shell';
        s.addPane(profileId, 'right');
      },
    },
    {
      id: 'split-below',
      label: 'Split Below',
      shortcut: 'Ctrl+Shift+E',
      category: 'Terminals',
      action: () => {
        const s = store();
        const ws = getActiveWorkspace(s);
        const profileId =
          ws?.panes.find((p) => p.id === ws?.activePaneId)?.profileId ??
          'system-shell';
        s.addPane(profileId, 'below');
      },
    },
    {
      id: 'maximize',
      label: 'Maximize/Restore Pane',
      shortcut: 'Ctrl+Enter',
      category: 'Terminals',
      action: () => {
        const s = store();
        const ws = getActiveWorkspace(s);
        if (ws?.activePaneId) s.toggleMaximize(ws.activePaneId);
      },
    },
    {
      id: 'clear-all',
      label: 'Close All Terminals',
      category: 'Terminals',
      action: () => store().clearAllPanes(),
    },
  );

  // Profiles — launch + directional splits per profile
  const profiles = store().profiles;
  for (const profile of profiles) {
    actions.push(
      {
        id: `launch-${profile.id}`,
        label: `New ${profile.name} Terminal`,
        category: 'Profiles',
        action: () => store().addPane(profile.id, 'right'),
      },
      {
        id: `split-right-${profile.id}`,
        label: `Split Right — ${profile.name}`,
        category: 'Profiles',
        action: () => store().addPane(profile.id, 'right'),
      },
      {
        id: `split-below-${profile.id}`,
        label: `Split Below — ${profile.name}`,
        category: 'Profiles',
        action: () => store().addPane(profile.id, 'below'),
      },
    );
  }

  // Layout presets
  for (const preset of GRID_PRESETS.slice(0, 6)) {
    actions.push({
      id: `preset-${preset.name}`,
      label: `Layout: ${preset.name}`,
      category: 'Layouts',
      action: () => store().applyPreset(preset.name, 'system-shell'),
    });
  }

  // Navigation — directional
  actions.push(
    {
      id: 'nav-up',
      label: 'Navigate Up',
      shortcut: 'Ctrl+Alt+↑',
      category: 'Navigation',
      action: () => store().focusDirection('up'),
    },
    {
      id: 'nav-down',
      label: 'Navigate Down',
      shortcut: 'Ctrl+Alt+↓',
      category: 'Navigation',
      action: () => store().focusDirection('down'),
    },
    {
      id: 'nav-left',
      label: 'Navigate Left',
      shortcut: 'Ctrl+Alt+←',
      category: 'Navigation',
      action: () => store().focusDirection('left'),
    },
    {
      id: 'nav-right',
      label: 'Navigate Right',
      shortcut: 'Ctrl+Alt+→',
      category: 'Navigation',
      action: () => store().focusDirection('right'),
    },
  );

  // Tools
  actions.push(
    {
      id: 'project-browser',
      label: 'Open Project Browser',
      shortcut: 'Ctrl+K',
      category: 'Tools',
      action: () => store().setShowProjectBrowser(true),
    },
    {
      id: 'command-palette',
      label: 'Command Palette',
      shortcut: 'Ctrl+Shift+P',
      category: 'Tools',
      action: () => store().setShowCommandPalette(true),
    },
  );

  return actions;
}

/* ── Fuzzy match with highlight positions ── */
function fuzzyMatch(
  query: string,
  text: string,
): { score: number; indices: number[] } | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  const indices: number[] = [];

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      qi++;
    }
  }

  if (qi !== q.length) return null;

  // Score: prefer consecutive matches, matches at start, and shorter strings
  let consecutive = 0;
  let score = 0;
  for (let i = 0; i < indices.length; i++) {
    const curr = indices[i]!;
    const prev = indices[i - 1];
    if (i > 0 && prev !== undefined && curr === prev + 1) {
      consecutive++;
      score += consecutive * 2;
    } else {
      consecutive = 0;
    }
    if (curr === 0) score += 3;
    if (i > 0 && text[curr - 1] === ' ') score += 2; // word boundary
  }
  score -= text.length * 0.1;

  return { score, indices };
}

function HighlightedText({
  text,
  indices,
}: {
  text: string;
  indices: number[];
}) {
  const indexSet = new Set(indices);
  return (
    <span>
      {text.split('').map((char, i) =>
        indexSet.has(i) ? (
          <span key={i} className="font-semibold text-blue-400">
            {char}
          </span>
        ) : (
          <span key={i}>{char}</span>
        ),
      )}
    </span>
  );
}

/* ── Component ── */
const ease = [0.16, 1, 0.3, 1] as const;

interface CommandPaletteProps {
  onClose: () => void;
}

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const actions = useMemo(() => buildActions(), []);

  const filtered = useMemo(() => {
    if (!search.trim())
      return actions.map((a) => ({ action: a, indices: [] as number[] }));

    const results: {
      action: PaletteAction;
      indices: number[];
      score: number;
    }[] = [];
    for (const action of actions) {
      // Search against label and category
      const labelMatch = fuzzyMatch(search, action.label);
      const catMatch = fuzzyMatch(search, `${action.category} ${action.label}`);
      const best = [labelMatch, catMatch]
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .sort((a, b) => b.score - a.score)[0];

      if (best) {
        // Use label match indices if available, otherwise empty
        results.push({
          action,
          indices: labelMatch?.indices ?? [],
          score: best.score,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }, [search, actions]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Focus input
  useEffect(() => {
    const timer = setTimeout(() => searchRef.current?.focus(), 50);
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

  const executeAction = useCallback(
    (action: PaletteAction) => {
      onClose();
      // Delay action slightly to let the palette close animation start
      requestAnimationFrame(() => action.action());
    },
    [onClose],
  );

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter') {
        const item = filtered[selectedIndex];
        if (item) {
          e.preventDefault();
          executeAction(item.action);
        }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, filtered, selectedIndex, executeAction]);

  // Scroll into view
  useEffect(() => {
    if (!listRef.current) return;
    const rows = listRef.current.querySelectorAll('[data-action-row]');
    rows[selectedIndex]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [selectedIndex]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: { category: string; items: typeof filtered }[] = [];
    const catMap = new Map<string, typeof filtered>();

    for (const item of filtered) {
      const cat = item.action.category;
      if (!catMap.has(cat)) {
        catMap.set(cat, []);
        groups.push({ category: cat, items: catMap.get(cat)! });
      }
      catMap.get(cat)!.push(item);
    }

    return groups;
  }, [filtered]);

  let globalIndex = 0;

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
        className="glass-elevated flex max-h-[60vh] w-[480px] flex-col overflow-hidden rounded-xl"
      >
        {/* Search header */}
        <div
          className="flex h-11 shrink-0 items-center gap-2 px-4"
          style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.04)' }}
        >
          <Command size={13} className="shrink-0 text-zinc-600" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 border-none bg-transparent text-[12px] text-zinc-200 outline-none placeholder:text-zinc-600"
            spellCheck={false}
          />
          <kbd className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-zinc-600">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Search size={20} className="mx-auto mb-2 text-zinc-700" />
              <p className="text-[11px] text-zinc-600">No matching commands</p>
            </div>
          ) : (
            grouped.map(({ category, items }) => (
              <div key={category}>
                <div className="px-3 py-1.5">
                  <span className="text-[9px] font-semibold tracking-wider text-zinc-600 uppercase">
                    {category}
                  </span>
                </div>
                {items.map((item) => {
                  const idx = globalIndex++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={item.action.id}
                      role="option"
                      aria-selected={isSelected}
                      data-action-row
                      onClick={() => executeAction(item.action)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') executeAction(item.action);
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      tabIndex={-1}
                      className={cn(
                        'mx-1 flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5',
                        'transition-colors duration-75',
                        isSelected
                          ? 'bg-white/[0.06]'
                          : 'hover:bg-white/[0.03]',
                      )}
                    >
                      <span
                        className={cn(
                          'truncate text-[12px]',
                          isSelected ? 'text-zinc-200' : 'text-zinc-400',
                        )}
                      >
                        {search && item.indices.length > 0 ? (
                          <HighlightedText
                            text={item.action.label}
                            indices={item.indices}
                          />
                        ) : (
                          item.action.label
                        )}
                      </span>
                      {item.action.shortcut && (
                        <kbd
                          className={cn(
                            'ml-3 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px]',
                            isSelected
                              ? 'bg-white/[0.06] text-zinc-400'
                              : 'bg-white/[0.03] text-zinc-600',
                          )}
                        >
                          {item.action.shortcut}
                        </kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex h-8 shrink-0 items-center gap-3 border-t border-white/[0.04] px-4">
          <span className="text-[9px] text-zinc-600">
            <kbd className="rounded bg-white/[0.03] px-1 py-px font-mono">
              ↑↓
            </kbd>{' '}
            navigate
          </span>
          <span className="text-[9px] text-zinc-600">
            <kbd className="rounded bg-white/[0.03] px-1 py-px font-mono">
              ↵
            </kbd>{' '}
            execute
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
