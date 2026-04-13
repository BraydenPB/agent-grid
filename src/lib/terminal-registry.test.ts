import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getTerminalEntry,
  setTerminalEntry,
  removeTerminalEntry,
  hasTerminalEntry,
  getRegisteredPaneIds,
  destroyTerminalEntry,
  cleanupOrphanedEntries,
  bufferPtyData,
  flushWriteBuffer,
  setTerminalVisible,
  _MAX_HIDDEN_BUFFER_BYTES,
  type TerminalEntry,
} from './terminal-registry';

/** Create a minimal mock TerminalEntry with spy-able dispose/kill methods */
function mockEntry(overrides: Partial<TerminalEntry> = {}): TerminalEntry {
  return {
    terminal: {
      dispose: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
    } as unknown as TerminalEntry['terminal'],
    fitAddon: {} as TerminalEntry['fitAddon'],
    searchAddon: null,
    serializeAddon: null,
    pty: { kill: vi.fn() } as unknown as TerminalEntry['pty'],
    element: document.createElement('div'),
    ptyDisposables: [{ dispose: vi.fn() }, { dispose: vi.fn() }],
    spawnSeq: 0,
    fontSize: 14,
    profileId: 'system-shell',
    cwd: 'C:\\Users\\test',
    webglAddon: null,
    preferDomRenderer: false,
    writeBuffer: [],
    writeBufferSize: 0,
    writeBufferTruncated: false,
    isVisible: true,
    visibilityObserver: null,
    ...overrides,
  };
}

/** Clean up registry between tests */
function clearRegistry() {
  for (const id of getRegisteredPaneIds()) {
    removeTerminalEntry(id);
  }
}

beforeEach(() => {
  clearRegistry();
});

describe('getTerminalEntry', () => {
  it('returns undefined for unknown pane', () => {
    expect(getTerminalEntry('nonexistent')).toBeUndefined();
  });
});

describe('setTerminalEntry + getTerminalEntry', () => {
  it('stores and retrieves an entry', () => {
    const entry = mockEntry();
    setTerminalEntry('pane-1', entry);
    expect(getTerminalEntry('pane-1')).toBe(entry);
  });

  it('overwrites an existing entry', () => {
    setTerminalEntry('pane-1', mockEntry({ fontSize: 12 }));
    const updated = mockEntry({ fontSize: 18 });
    setTerminalEntry('pane-1', updated);
    expect(getTerminalEntry('pane-1')!.fontSize).toBe(18);
  });
});

describe('hasTerminalEntry', () => {
  it('returns false for unregistered pane', () => {
    expect(hasTerminalEntry('ghost')).toBe(false);
  });

  it('returns true for registered pane', () => {
    setTerminalEntry('pane-1', mockEntry());
    expect(hasTerminalEntry('pane-1')).toBe(true);
  });
});

describe('removeTerminalEntry', () => {
  it('removes and returns the entry', () => {
    const entry = mockEntry();
    setTerminalEntry('pane-1', entry);
    const removed = removeTerminalEntry('pane-1');
    expect(removed).toBe(entry);
    expect(hasTerminalEntry('pane-1')).toBe(false);
  });

  it('returns undefined for unknown pane', () => {
    expect(removeTerminalEntry('nonexistent')).toBeUndefined();
  });
});

describe('getRegisteredPaneIds', () => {
  it('returns empty array when registry is empty', () => {
    expect(getRegisteredPaneIds()).toEqual([]);
  });

  it('returns all registered pane IDs', () => {
    setTerminalEntry('a', mockEntry());
    setTerminalEntry('b', mockEntry());
    setTerminalEntry('c', mockEntry());
    expect(getRegisteredPaneIds().sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('destroyTerminalEntry', () => {
  it('disposes terminal, kills PTY, and removes from registry', () => {
    const entry = mockEntry();
    setTerminalEntry('pane-1', entry);

    destroyTerminalEntry('pane-1');

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(entry.terminal.dispose).toHaveBeenCalledOnce();
    expect(entry.pty!.kill).toHaveBeenCalledOnce();
    for (const d of entry.ptyDisposables) {
      expect(d.dispose).toHaveBeenCalledOnce();
    }
    expect(hasTerminalEntry('pane-1')).toBe(false);
  });

  it('handles entry with null pty', () => {
    const entry = mockEntry({ pty: null });
    setTerminalEntry('pane-1', entry);
    // Should not throw
    destroyTerminalEntry('pane-1');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(entry.terminal.dispose).toHaveBeenCalledOnce();
    expect(hasTerminalEntry('pane-1')).toBe(false);
  });

  it('is a no-op for unknown pane', () => {
    // Should not throw
    destroyTerminalEntry('nonexistent');
  });
});

describe('cleanupOrphanedEntries', () => {
  it('removes entries not in the active list', () => {
    const orphan = mockEntry();
    setTerminalEntry('keep-1', mockEntry());
    setTerminalEntry('keep-2', mockEntry());
    setTerminalEntry('orphan-1', orphan);

    cleanupOrphanedEntries(['keep-1', 'keep-2']);

    expect(hasTerminalEntry('keep-1')).toBe(true);
    expect(hasTerminalEntry('keep-2')).toBe(true);
    expect(hasTerminalEntry('orphan-1')).toBe(false);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(orphan.terminal.dispose).toHaveBeenCalledOnce();
  });

  it('removes all entries when active list is empty', () => {
    setTerminalEntry('a', mockEntry());
    setTerminalEntry('b', mockEntry());

    cleanupOrphanedEntries([]);

    expect(getRegisteredPaneIds()).toEqual([]);
  });

  it('keeps all entries when all are active', () => {
    setTerminalEntry('a', mockEntry());
    setTerminalEntry('b', mockEntry());

    cleanupOrphanedEntries(['a', 'b']);

    expect(getRegisteredPaneIds().sort()).toEqual(['a', 'b']);
  });
});

describe('hidden-pane write buffering', () => {
  it('queues data without writing to the terminal', () => {
    const entry = mockEntry();
    setTerminalEntry('pane-1', entry);

    bufferPtyData('pane-1', new Uint8Array([1, 2, 3]));
    bufferPtyData('pane-1', new Uint8Array([4, 5]));

    expect(entry.writeBuffer.length).toBe(2);
    expect(entry.writeBufferSize).toBe(5);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(entry.terminal.write).not.toHaveBeenCalled();
  });

  it('flushes buffered data to the terminal in order', () => {
    const entry = mockEntry();
    setTerminalEntry('pane-1', entry);

    const a = new Uint8Array([1]);
    const b = new Uint8Array([2]);
    bufferPtyData('pane-1', a);
    bufferPtyData('pane-1', b);

    flushWriteBuffer('pane-1');

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(entry.terminal.write).toHaveBeenNthCalledWith(1, a);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(entry.terminal.write).toHaveBeenNthCalledWith(2, b);
    expect(entry.writeBuffer.length).toBe(0);
    expect(entry.writeBufferSize).toBe(0);
  });

  it('setTerminalVisible(true) flushes on hidden→visible transition', () => {
    const entry = mockEntry({ isVisible: false });
    setTerminalEntry('pane-1', entry);
    bufferPtyData('pane-1', new Uint8Array([42]));

    setTerminalVisible('pane-1', true);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(entry.terminal.write).toHaveBeenCalledOnce();
    expect(entry.writeBuffer.length).toBe(0);
  });

  it('setTerminalVisible(false) does not flush', () => {
    const entry = mockEntry();
    setTerminalEntry('pane-1', entry);
    bufferPtyData('pane-1', new Uint8Array([7]));
    // Already visible → toggling to hidden should not flush
    setTerminalVisible('pane-1', false);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(entry.terminal.write).not.toHaveBeenCalled();
  });

  it('truncates oldest chunks when buffer exceeds byte cap and resets on flush', () => {
    const entry = mockEntry();
    setTerminalEntry('pane-1', entry);

    const chunkSize = 1024 * 1024; // 1MB
    const chunks = Math.ceil(_MAX_HIDDEN_BUFFER_BYTES / chunkSize) + 2;
    for (let i = 0; i < chunks; i++) {
      bufferPtyData('pane-1', new Uint8Array(chunkSize));
    }

    expect(entry.writeBufferSize).toBeLessThanOrEqual(_MAX_HIDDEN_BUFFER_BYTES);
    expect(entry.writeBufferTruncated).toBe(true);

    flushWriteBuffer('pane-1');

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(entry.terminal.reset).toHaveBeenCalledOnce();
    expect(entry.writeBufferTruncated).toBe(false);
  });
});
