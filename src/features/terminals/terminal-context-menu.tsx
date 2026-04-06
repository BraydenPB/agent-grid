import { useEffect, useRef } from "react";
import { Copy, ClipboardPaste, Trash2, Search, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContextMenuItem {
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
  separator?: boolean;
}

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
}: TerminalContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, onClose]);

  if (!visible) return null;

  const items: ContextMenuItem[] = [
    {
      label: "Copy",
      icon: <Copy size={13} />,
      shortcut: "Ctrl+Shift+C",
      action: () => { onCopy(); onClose(); },
    },
    {
      label: "Paste",
      icon: <ClipboardPaste size={13} />,
      shortcut: "Ctrl+Shift+V",
      action: () => { onPaste(); onClose(); },
    },
    {
      label: "Find",
      icon: <Search size={13} />,
      shortcut: "Ctrl+Shift+F",
      action: () => { onSearch(); onClose(); },
      separator: true,
    },
    {
      label: "Clear Buffer",
      icon: <Trash2 size={13} />,
      action: () => { onClear(); onClose(); },
    },
    {
      label: "Reset Terminal",
      icon: <TerminalSquare size={13} />,
      action: () => { onReset(); onClose(); },
    },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 glass-elevated rounded-lg py-1 min-w-[180px] animate-in fade-in"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <div key={item.label}>
          {item.separator && i > 0 && (
            <div className="my-1 border-t border-white/[0.06]" />
          )}
          <button
            onClick={item.action}
            disabled={item.label === "Copy" && !hasSelection}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors",
              "hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-default",
              "text-zinc-300"
            )}
          >
            <span className="text-zinc-400">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] text-zinc-600">{item.shortcut}</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
