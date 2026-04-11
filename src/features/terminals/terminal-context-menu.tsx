import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  ClipboardPaste,
  Trash2,
  Search,
  TerminalSquare,
  FolderOpen,
  PanelRight,
  PanelBottom,
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  Palette,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useWorkspaceStore,
  getActiveWorkspace,
  getActiveProject,
} from '@/store/workspace-store';
import type { TerminalProfile } from '@/types';

const VIEWPORT_PAD = 8;

const ease = [0.16, 1, 0.3, 1] as const;

const menuMotion = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.1, ease } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.07 } },
};

const submenuMotion = {
  hidden: { opacity: 0, x: -4 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.08, ease } },
  exit: { opacity: 0, x: -4, transition: { duration: 0.05 } },
};

const PRESET_COLORS = [
  '#f87171', // Red
  '#fb923c', // Orange
  '#fbbf24', // Amber
  '#a3e635', // Lime
  '#34d399', // Emerald
  '#22d3ee', // Cyan
  '#38bdf8', // Sky
  '#818cf8', // Indigo
  '#a78bfa', // Violet
  '#f472b6', // Pink
  '#fb7185', // Rose
  '#94a3b8', // Slate
];

interface TerminalContextMenuProps {
  x: number;
  y: number;
  visible: boolean;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onClear: () => void;
  onSearch: () => void;
  onReset: () => void;
  hasSelection: boolean;
  profileId: string;
  paneId: string;
  onSwitchProfile: (profile: TerminalProfile) => void;
  cwd: string;
  onChangeDirectory: () => void;
  onSplitRight: () => void;
  onSplitBelow: () => void;
  onClose_pane: () => void;
}

export function TerminalContextMenu({
  x,
  y,
  visible,
  onClose,
  onCopy,
  onPaste,
  onClear,
  onSearch,
  onReset,
  hasSelection,
  profileId,
  paneId,
  onSwitchProfile,
  cwd,
  onChangeDirectory,
  onSplitRight,
  onSplitBelow,
  onClose_pane,
}: TerminalContextMenuProps) {
  const profiles = useWorkspaceStore((s) => s.profiles);
  const updatePaneColor = useWorkspaceStore((s) => s.updatePaneColor);
  const paneColorOverride = useWorkspaceStore((s) => {
    const ws = getActiveWorkspace(s);
    return ws?.panes.find((p) => p.id === paneId)?.colorOverride;
  });
  const currentProfile =
    profiles.find((p) => p.id === profileId) ?? profiles[0]!;
  const effectiveColor = paneColorOverride ?? currentProfile.color ?? '#6b7280';

  const setMainPane = useWorkspaceStore((s) => s.setMainPane);
  const isMainPane = useWorkspaceStore(
    (s) => getActiveProject(s)?.mainPaneId === paneId,
  );

  const handleColorUpdate = useCallback(
    (color: string) => {
      updatePaneColor(paneId, color);
    },
    [paneId, updatePaneColor],
  );

  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<'profile' | null>(null);
  const submenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [flipSub, setFlipSub] = useState(false);
  const [subOffsetY, setSubOffsetY] = useState(0);
  const [menuRight, setMenuRight] = useState(0);
  const [colorPickerProfileId, setColorPickerProfileId] = useState<
    string | null
  >(null);
  const [customHex, setCustomHex] = useState('');
  const [showInlineColors, setShowInlineColors] = useState(false);
  const [inlineHex, setInlineHex] = useState('');

  // Measure menu after render and clamp to viewport
  useLayoutEffect(() => {
    if (!visible || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let cx = x;
    let cy = y;

    // Flip left if overflowing right
    if (cx + rect.width > vw - VIEWPORT_PAD) {
      cx = Math.max(VIEWPORT_PAD, vw - rect.width - VIEWPORT_PAD);
    }
    // Flip up if overflowing bottom
    if (cy + rect.height > vh - VIEWPORT_PAD) {
      cy = Math.max(VIEWPORT_PAD, vh - rect.height - VIEWPORT_PAD);
    }

    // Store the menu's right edge so submenu can measure against it
    setMenuRight(cx + rect.width);
    setPos({ x: cx, y: cy });
  }, [visible, x, y]);

  // Measure submenu and clamp within viewport (both axes)
  useLayoutEffect(() => {
    if (!submenu || !submenuRef.current) {
      setSubOffsetY(0);
      setFlipSub(false);
      return;
    }
    const rect = submenuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Flip left if the actual submenu overflows the right edge
    setFlipSub(menuRight + rect.width + 4 > vw - VIEWPORT_PAD);

    if (rect.bottom > vh - VIEWPORT_PAD) {
      setSubOffsetY(-(rect.bottom - vh + VIEWPORT_PAD));
    } else if (rect.top < VIEWPORT_PAD) {
      setSubOffsetY(VIEWPORT_PAD - rect.top);
    } else {
      setSubOffsetY(0);
    }
  }, [submenu, menuRight]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        onClose();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) {
      setSubmenu(null);
      setColorPickerProfileId(null);
      setCustomHex('');
      setShowInlineColors(false);
      setInlineHex('');
    }
  }, [visible]);

  const openSub = useCallback(() => {
    if (submenuTimer.current) clearTimeout(submenuTimer.current);
    setSubmenu('profile');
  }, []);

  const closeSub = useCallback(() => {
    submenuTimer.current = setTimeout(() => setSubmenu(null), 120);
  }, []);

  const keepSub = useCallback(() => {
    if (submenuTimer.current) clearTimeout(submenuTimer.current);
  }, []);

  const pickerProfile = colorPickerProfileId
    ? (profiles.find((p) => p.id === colorPickerProfileId) ?? null)
    : null;

  const applyCustomHex = useCallback(() => {
    if (!pickerProfile || customHex.length < 3) return;
    let hex = customHex;
    if (hex.length === 3) {
      hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!;
    }
    handleColorUpdate(`#${hex}`);
    setColorPickerProfileId(null);
    setCustomHex('');
  }, [pickerProfile, customHex, handleColorUpdate]);

  const applyInlineHex = useCallback(() => {
    if (inlineHex.length < 3) return;
    let hex = inlineHex;
    if (hex.length === 3) {
      hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!;
    }
    handleColorUpdate(`#${hex}`);
    setShowInlineColors(false);
    setInlineHex('');
  }, [inlineHex, handleColorUpdate]);

  const act = useCallback(
    (fn: () => void) => () => {
      fn();
      onClose();
    },
    [onClose],
  );

  if (!visible) return null;

  const cwdLabel = cwd ? cwd.split(/[\\/]/).pop() || cwd : 'Default';

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      className="fixed z-[100]"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <motion.div
        variants={menuMotion}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="glass-elevated min-w-[200px] overflow-visible rounded-lg py-1"
      >
        {/* Profile switcher */}
        <div
          className="relative"
          onMouseEnter={openSub}
          onMouseLeave={closeSub}
        >
          <button
            className={cn(
              'flex w-full items-center gap-2 px-2.5 py-[5px] text-left text-[11px]',
              'text-zinc-200 transition-colors duration-100 hover:bg-white/[0.04]',
            )}
            aria-label="Switch profile"
          >
            <span
              className="h-[5px] w-[5px] shrink-0 rounded-full"
              style={{
                backgroundColor: effectiveColor,
              }}
            />
            <span className="flex-1 truncate font-medium">
              {currentProfile.name}
            </span>
            <ChevronRight size={10} className="text-zinc-600" />
          </button>

          <AnimatePresence>
            {submenu === 'profile' && (
              <motion.div
                ref={submenuRef}
                variants={submenuMotion}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={cn(
                  'glass-elevated absolute max-h-[calc(100vh-16px)] overflow-hidden rounded-lg py-1',
                  flipSub ? 'right-full mr-1' : 'left-full ml-1',
                  colorPickerProfileId
                    ? 'min-w-[180px]'
                    : 'max-w-[220px] min-w-[160px]',
                )}
                style={{ top: subOffsetY }}
                onMouseEnter={keepSub}
                onMouseLeave={closeSub}
              >
                {!colorPickerProfileId ? (
                  /* ── Profile list ── */
                  <div className="overflow-y-auto">
                    {profiles.map((p) => {
                      const active = p.id === currentProfile.id;
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            'flex w-full items-center gap-0 text-[11px]',
                            'transition-colors duration-100',
                            active
                              ? 'bg-white/[0.04] text-zinc-200'
                              : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200',
                          )}
                        >
                          {/* Clickable dot — opens color picker */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setColorPickerProfileId(p.id);
                              setCustomHex(
                                (p.color || '#6b7280').replace('#', ''),
                              );
                            }}
                            className="group/dot flex shrink-0 cursor-pointer items-center justify-center py-[5px] pr-1 pl-2.5"
                            title="Change color"
                          >
                            <span
                              className="block h-[5px] w-[5px] rounded-full ring-white/25 transition-all group-hover/dot:h-[7px] group-hover/dot:w-[7px] group-hover/dot:ring-2"
                              style={{
                                backgroundColor: p.color || '#6b7280',
                              }}
                            />
                          </button>
                          {/* Clickable name — switches profile */}
                          <button
                            onClick={() => {
                              if (!active) onSwitchProfile(p);
                              onClose();
                            }}
                            className="flex flex-1 items-center gap-2 py-[5px] pr-2.5"
                          >
                            <span className="flex-1 truncate text-left font-medium">
                              {p.name}
                            </span>
                            {active && (
                              <Check
                                size={10}
                                className="shrink-0 text-blue-400"
                              />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ── Color picker ── */
                  <div>
                    {/* Header: back + profile name */}
                    <button
                      onClick={() => {
                        setColorPickerProfileId(null);
                        setCustomHex('');
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-2.5 py-[5px] text-left text-[11px]',
                        'text-zinc-200 transition-colors duration-100 hover:bg-white/[0.04]',
                      )}
                    >
                      <ChevronLeft size={10} className="text-zinc-500" />
                      <span
                        className="h-[5px] w-[5px] shrink-0 rounded-full"
                        style={{
                          backgroundColor: pickerProfile?.color || '#6b7280',
                        }}
                      />
                      <span className="font-medium">{pickerProfile?.name}</span>
                    </button>

                    <div className="mx-2 my-0.5 h-px bg-white/[0.04]" />

                    {/* Swatch grid */}
                    <div className="grid grid-cols-6 gap-1.5 px-2.5 py-2">
                      {PRESET_COLORS.map((color) => {
                        const isActive =
                          color.toLowerCase() ===
                          pickerProfile?.color?.toLowerCase();
                        return (
                          <button
                            key={color}
                            onClick={() => {
                              handleColorUpdate(color);
                              setColorPickerProfileId(null);
                              setCustomHex('');
                            }}
                            className={cn(
                              'flex h-[18px] w-[18px] items-center justify-center rounded-full transition-all hover:scale-125',
                              isActive &&
                                'ring-[1.5px] ring-white/50 ring-offset-1 ring-offset-zinc-900',
                            )}
                            style={{ backgroundColor: color }}
                            title={color}
                          >
                            {isActive && (
                              <Check
                                size={8}
                                strokeWidth={3}
                                className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mx-2 my-0.5 h-px bg-white/[0.04]" />

                    {/* Custom hex input */}
                    <div className="flex items-center gap-1 px-2.5 py-1.5">
                      <span className="text-[10px] text-zinc-600">#</span>
                      <input
                        type="text"
                        value={customHex}
                        onChange={(e) =>
                          setCustomHex(
                            e.target.value.replace(/[^0-9a-fA-F]/g, ''),
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') applyCustomHex();
                        }}
                        className="flex-1 bg-transparent text-[11px] text-zinc-300 outline-none placeholder:text-zinc-700"
                        placeholder="custom hex"
                        maxLength={6}
                      />
                      {customHex.length >= 3 && (
                        <>
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{
                              backgroundColor: `#${customHex}`,
                            }}
                          />
                          <button
                            onClick={applyCustomHex}
                            className="text-zinc-500 transition-colors hover:text-zinc-200"
                          >
                            <Check size={10} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Item
          icon={<FolderOpen size={12} />}
          label={cwdLabel}
          hint="Browse"
          onClick={act(onChangeDirectory)}
        />

        {/* Color picker — expands inline */}
        <button
          onClick={() => {
            setShowInlineColors((v) => !v);
            setInlineHex(effectiveColor.replace('#', ''));
          }}
          className={cn(
            'flex w-full items-center gap-2 px-2.5 py-[5px] text-left text-[11px]',
            'transition-colors duration-100',
            showInlineColors
              ? 'bg-white/[0.04] text-zinc-100'
              : 'text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-100',
          )}
        >
          <span className="shrink-0 text-zinc-500">
            <Palette size={12} />
          </span>
          <span className="flex-1 font-medium">Color</span>
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: effectiveColor,
            }}
          />
        </button>
        {showInlineColors && (
          <div>
            {/* Swatch grid */}
            <div className="grid grid-cols-6 gap-1.5 px-2.5 py-2">
              {PRESET_COLORS.map((color) => {
                const isActive =
                  color.toLowerCase() === effectiveColor.toLowerCase();
                return (
                  <button
                    key={color}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleColorUpdate(color);
                    }}
                    className={cn(
                      'flex h-[18px] w-[18px] items-center justify-center rounded-full transition-all hover:scale-125',
                      isActive &&
                        'ring-[1.5px] ring-white/50 ring-offset-1 ring-offset-zinc-900',
                    )}
                    style={{ backgroundColor: color }}
                    title={color}
                  >
                    {isActive && (
                      <Check
                        size={8}
                        strokeWidth={3}
                        className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                      />
                    )}
                  </button>
                );
              })}
            </div>
            {/* Custom hex */}
            <div className="flex items-center gap-1 px-2.5 pb-1.5">
              <span className="text-[10px] text-zinc-600">#</span>
              <input
                type="text"
                value={inlineHex}
                onChange={(e) =>
                  setInlineHex(e.target.value.replace(/[^0-9a-fA-F]/g, ''))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyInlineHex();
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-transparent text-[11px] text-zinc-300 outline-none placeholder:text-zinc-700"
                placeholder="custom hex"
                maxLength={6}
              />
              {inlineHex.length >= 3 && (
                <>
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: `#${inlineHex}` }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      applyInlineHex();
                    }}
                    className="text-zinc-500 transition-colors hover:text-zinc-200"
                  >
                    <Check size={10} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Set as Main Terminal */}
        <Item
          icon={<Star size={12} />}
          label={isMainPane ? 'Main Terminal' : 'Set as Main'}
          hint={isMainPane ? '\u2713' : undefined}
          onClick={act(() => setMainPane(paneId))}
        />

        <Sep />

        {/* Layout */}
        <Item
          icon={<PanelRight size={12} />}
          label="Split Right"
          shortcut="^\u21E7D"
          onClick={act(onSplitRight)}
        />
        <Item
          icon={<PanelBottom size={12} />}
          label="Split Below"
          shortcut="^\u21E7E"
          onClick={act(onSplitBelow)}
        />

        <Sep />

        {/* Edit */}
        <Item
          icon={<Copy size={12} />}
          label="Copy"
          shortcut="^\u21E7C"
          onClick={act(onCopy)}
          disabled={!hasSelection}
        />
        <Item
          icon={<ClipboardPaste size={12} />}
          label="Paste"
          shortcut="^\u21E7V"
          onClick={act(onPaste)}
        />
        <Item
          icon={<Search size={12} />}
          label="Find"
          shortcut="^\u21E7F"
          onClick={act(onSearch)}
        />

        <Sep />

        {/* Terminal actions */}
        <Item
          icon={<Trash2 size={12} />}
          label="Clear"
          onClick={act(onClear)}
        />
        <Item
          icon={<TerminalSquare size={12} />}
          label="Reset"
          onClick={act(onReset)}
        />
        <Item
          icon={<X size={12} />}
          label="Close Pane"
          shortcut="^\u21E7W"
          onClick={act(onClose_pane)}
          variant="danger"
        />
      </motion.div>
    </div>,
    document.body,
  );
}

/* ── Workspace toggle ── */

/* ── Primitives ── */

function Sep() {
  return <div className="mx-2 my-0.5 h-px bg-white/[0.04]" />;
}

function Item({
  icon,
  label,
  shortcut,
  hint,
  onClick,
  disabled,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'danger';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 px-2.5 py-[5px] text-left text-[11px]',
        'transition-colors duration-100',
        'disabled:pointer-events-none disabled:opacity-20',
        variant === 'danger'
          ? 'text-zinc-400 hover:bg-red-500/[0.06] hover:text-red-400'
          : 'text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-100',
      )}
    >
      <span
        className={cn(
          'shrink-0',
          variant === 'danger' ? 'text-zinc-600' : 'text-zinc-500',
        )}
      >
        {icon}
      </span>
      <span className="flex-1 font-medium">{label}</span>
      {hint && <span className="text-[10px] text-zinc-600">{hint}</span>}
      {shortcut && (
        <span className="font-mono text-[10px] tracking-tight text-zinc-600">
          {shortcut}
        </span>
      )}
    </button>
  );
}
