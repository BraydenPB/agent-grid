import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, ChevronUp, ChevronDown, CaseSensitive, Regex } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchAddon } from "@xterm/addon-search";

interface TerminalSearchProps {
  searchAddon: SearchAddon | null;
  visible: boolean;
  onClose: () => void;
}

export function TerminalSearch({ searchAddon, visible, onClose }: TerminalSearchProps) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchCount, setMatchCount] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [visible]);

  const doSearch = useCallback(
    (direction: "next" | "previous") => {
      if (!searchAddon || !query) return;
      const opts = { caseSensitive, regex: useRegex, incremental: direction === "next" };
      const found =
        direction === "next"
          ? searchAddon.findNext(query, opts)
          : searchAddon.findPrevious(query, opts);
      setMatchCount(found ? "" : "No results");
    },
    [searchAddon, query, caseSensitive, useRegex]
  );

  useEffect(() => {
    if (!query) {
      searchAddon?.clearDecorations();
      setMatchCount("");
      return;
    }
    doSearch("next");
  }, [query, caseSensitive, useRegex, doSearch, searchAddon]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSearch(e.shiftKey ? "previous" : "next");
    } else if (e.key === "Escape") {
      e.preventDefault();
      searchAddon?.clearDecorations();
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <div
      className={cn(
        "absolute top-10 right-2 z-20 flex items-center gap-1 px-2 py-1.5 rounded-lg",
        "glass-elevated"
      )}
      style={{ minWidth: 260 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Search size={13} className="text-zinc-500 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search…"
        className="bg-transparent border-none outline-none text-[12px] text-zinc-200 placeholder:text-zinc-600 w-full min-w-0 px-1"
        spellCheck={false}
      />
      {matchCount && (
        <span className="text-[10px] text-zinc-500 shrink-0">{matchCount}</span>
      )}
      <button
        onClick={() => setCaseSensitive(!caseSensitive)}
        className={cn(
          "p-0.5 rounded transition-colors",
          caseSensitive ? "text-blue-400 bg-blue-400/10" : "text-zinc-500 hover:text-zinc-300"
        )}
        title="Match case"
      >
        <CaseSensitive size={14} />
      </button>
      <button
        onClick={() => setUseRegex(!useRegex)}
        className={cn(
          "p-0.5 rounded transition-colors",
          useRegex ? "text-blue-400 bg-blue-400/10" : "text-zinc-500 hover:text-zinc-300"
        )}
        title="Use regex"
      >
        <Regex size={14} />
      </button>
      <button
        onClick={() => doSearch("previous")}
        className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
        title="Previous match (Shift+Enter)"
      >
        <ChevronUp size={14} />
      </button>
      <button
        onClick={() => doSearch("next")}
        className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
        title="Next match (Enter)"
      >
        <ChevronDown size={14} />
      </button>
      <button
        onClick={() => {
          searchAddon?.clearDecorations();
          onClose();
        }}
        className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
        title="Close (Esc)"
      >
        <X size={14} />
      </button>
    </div>
  );
}
