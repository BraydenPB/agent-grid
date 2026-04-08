import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  X,
  ChevronUp,
  ChevronDown,
  CaseSensitive,
  Regex,
} from 'lucide-react';
import type { SearchAddon } from '@xterm/addon-search';
import { cn } from '@/lib/utils';

interface TerminalSearchProps {
  searchAddon: SearchAddon | null;
  visible: boolean;
  onClose: () => void;
}

export function TerminalSearch({
  searchAddon,
  visible,
  onClose,
}: TerminalSearchProps) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchCount, setMatchCount] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [visible]);

  const doSearch = useCallback(
    (direction: 'next' | 'previous') => {
      if (!searchAddon || !query) return;
      const opts = {
        caseSensitive,
        regex: useRegex,
        incremental: direction === 'next',
      };
      const found =
        direction === 'next'
          ? searchAddon.findNext(query, opts)
          : searchAddon.findPrevious(query, opts);
      setMatchCount(found ? '' : 'No results');
    },
    [searchAddon, query, caseSensitive, useRegex],
  );

  useEffect(() => {
    if (!query) {
      searchAddon?.clearDecorations();
      setMatchCount('');
      return;
    }
    doSearch('next');
  }, [query, caseSensitive, useRegex, doSearch, searchAddon]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch(e.shiftKey ? 'previous' : 'next');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      searchAddon?.clearDecorations();
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <div
      role="search"
      className="glass-elevated absolute top-8 right-2 z-20 flex items-center gap-1 rounded-md px-2 py-1"
      style={{ minWidth: 220 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Search size={12} className="shrink-0 text-zinc-600" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find..."
        className="w-full min-w-0 border-none bg-transparent px-1 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600"
        spellCheck={false}
      />
      {matchCount && (
        <span className="shrink-0 text-[9px] whitespace-nowrap text-zinc-600">
          {matchCount}
        </span>
      )}
      <ToggleBtn
        active={caseSensitive}
        onClick={() => setCaseSensitive(!caseSensitive)}
        title="Match case"
      >
        <CaseSensitive size={13} />
      </ToggleBtn>
      <ToggleBtn
        active={useRegex}
        onClick={() => setUseRegex(!useRegex)}
        title="Regex"
      >
        <Regex size={13} />
      </ToggleBtn>
      <IconBtn
        onClick={() => doSearch('previous')}
        title="Previous (Shift+Enter)"
      >
        <ChevronUp size={13} />
      </IconBtn>
      <IconBtn onClick={() => doSearch('next')} title="Next (Enter)">
        <ChevronDown size={13} />
      </IconBtn>
      <IconBtn
        onClick={() => {
          searchAddon?.clearDecorations();
          onClose();
        }}
        title="Close (Esc)"
      >
        <X size={13} />
      </IconBtn>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded p-0.5 text-zinc-500 transition-colors duration-100 hover:text-zinc-300"
    >
      {children}
    </button>
  );
}

function ToggleBtn({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'rounded p-0.5 transition-colors duration-100',
        active
          ? 'bg-blue-400/[0.08] text-blue-400'
          : 'text-zinc-500 hover:text-zinc-300',
      )}
    >
      {children}
    </button>
  );
}
