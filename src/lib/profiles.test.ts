import { describe, it, expect } from 'vitest';
import type { TerminalProfile } from '@/types';
import {
  resolveShellCommand,
  DEFAULT_PROFILES,
  createCustomProfile,
} from './profiles';

// Helper: extract the command string passed to bash -c or powershell -Command
function bashCmdString(profile: TerminalProfile): string {
  const { args } = resolveShellCommand(profile, 'linux');
  // args = ['-lc', '<command string>']
  return args[1]!;
}

function psCmdString(profile: TerminalProfile): string {
  const { args } = resolveShellCommand(profile, 'windows');
  // args = ['-NoLogo', '-Command', '& <command string>']
  return args[2]!;
}

// ── __SYSTEM_SHELL__ sentinel ──

describe('resolveShellCommand — __SYSTEM_SHELL__', () => {
  const shell: TerminalProfile = {
    id: 'shell',
    name: 'Shell',
    command: '__SYSTEM_SHELL__',
    args: [],
  };

  it('returns powershell.exe on windows', () => {
    const result = resolveShellCommand(shell, 'windows');
    expect(result.command).toBe('powershell.exe');
    expect(result.args).toEqual([]);
  });

  it('returns /bin/bash -l on linux', () => {
    const result = resolveShellCommand(shell, 'linux');
    expect(result.command).toBe('/bin/bash');
    expect(result.args).toEqual(['-l']);
  });

  it('returns /bin/bash -l on macos', () => {
    const result = resolveShellCommand(shell, 'macos');
    expect(result.command).toBe('/bin/bash');
    expect(result.args).toEqual(['-l']);
  });
});

// ── Non-shell profiles — basic command resolution ──

describe('resolveShellCommand — non-shell profiles', () => {
  const claude: TerminalProfile = {
    id: 'claude',
    name: 'Claude',
    command: 'claude',
    args: [],
  };

  it('wraps in bash -lc on linux', () => {
    const result = resolveShellCommand(claude, 'linux');
    expect(result.command).toBe('/bin/bash');
    expect(result.args[0]).toBe('-lc');
    expect(result.args[1]).toContain('claude');
  });

  it('wraps in powershell -Command with & on windows', () => {
    const result = resolveShellCommand(claude, 'windows');
    expect(result.command).toBe('powershell.exe');
    expect(result.args[0]).toBe('-NoLogo');
    expect(result.args[1]).toBe('-Command');
    expect(result.args[2]).toMatch(/^& /);
  });

  it('passes multiple args quoted individually', () => {
    const profile: TerminalProfile = {
      id: 'test',
      name: 'Test',
      command: 'aider',
      args: ['--model', 'gpt-4'],
    };
    const cmd = bashCmdString(profile);
    // Each part should be individually single-quoted
    expect(cmd).toBe("'aider' '--model' 'gpt-4'");
  });
});

// ── Bash quoting (tested indirectly via resolveShellCommand) ──

describe('bash quoting — injection prevention', () => {
  function quote(arg: string): string {
    const profile: TerminalProfile = {
      id: 'q',
      name: 'q',
      command: arg,
      args: [],
    };
    return bashCmdString(profile);
  }

  it('handles simple strings', () => {
    expect(quote('hello')).toBe("'hello'");
  });

  it('escapes single quotes', () => {
    expect(quote("it's")).toBe("'it'\\''s'");
  });

  it('escapes multiple single quotes', () => {
    expect(quote("a'b'c")).toBe("'a'\\''b'\\''c'");
  });

  it('neutralizes $(command) substitution', () => {
    const result = quote('$(rm -rf /)');
    // Inside single quotes, $ has no special meaning
    expect(result).toBe("'$(rm -rf /)'");
  });

  it('neutralizes backtick substitution', () => {
    const result = quote('`rm -rf /`');
    expect(result).toBe("'`rm -rf /`'");
  });

  it('neutralizes semicolons', () => {
    const result = quote('; rm -rf /');
    expect(result).toBe("'; rm -rf /'");
  });

  it('neutralizes pipes', () => {
    const result = quote('| cat /etc/passwd');
    expect(result).toBe("'| cat /etc/passwd'");
  });

  it('handles newlines', () => {
    const result = quote('line1\nline2');
    expect(result).toBe("'line1\nline2'");
  });

  it('handles null bytes', () => {
    const result = quote('a\0b');
    expect(result).toBe("'a\0b'");
  });

  it('handles empty string', () => {
    expect(quote('')).toBe("''");
  });

  it('handles spaces', () => {
    expect(quote('hello world')).toBe("'hello world'");
  });

  it('handles glob characters * and ?', () => {
    expect(quote('*.txt')).toBe("'*.txt'");
    expect(quote('file?.log')).toBe("'file?.log'");
  });

  it('handles unicode', () => {
    expect(quote('日本語')).toBe("'日本語'");
  });

  it('handles double quotes', () => {
    expect(quote('"hello"')).toBe('\'"hello"\'');
  });

  it('handles backslashes', () => {
    expect(quote('a\\b')).toBe("'a\\b'");
  });

  it('handles ampersand and redirects', () => {
    expect(quote('cmd & rm -rf /')).toBe("'cmd & rm -rf /'");
    expect(quote('cmd > /tmp/out')).toBe("'cmd > /tmp/out'");
  });
});

// ── PowerShell quoting ──

describe('powershell quoting — injection prevention', () => {
  function quote(arg: string): string {
    const profile: TerminalProfile = {
      id: 'q',
      name: 'q',
      command: arg,
      args: [],
    };
    // Extract quoted string from "& 'quoted'"
    const full = psCmdString(profile);
    return full.replace(/^& /, '');
  }

  it('handles simple strings', () => {
    expect(quote('hello')).toBe("'hello'");
  });

  it('escapes single quotes by doubling', () => {
    expect(quote("it's")).toBe("'it''s'");
  });

  it('escapes multiple single quotes', () => {
    expect(quote("a'b'c")).toBe("'a''b''c'");
  });

  it('neutralizes $() substitution', () => {
    expect(quote('$(Get-Process)')).toBe("'$(Get-Process)'");
  });

  it('neutralizes semicolons', () => {
    expect(quote('; Remove-Item -Recurse')).toBe("'; Remove-Item -Recurse'");
  });

  it('handles empty string', () => {
    expect(quote('')).toBe("''");
  });

  it('handles backtick (PS escape char)', () => {
    expect(quote('`whoami`')).toBe("'`whoami`'");
  });

  it('handles pipe', () => {
    expect(quote('| Get-Content')).toBe("'| Get-Content'");
  });
});

// ── PowerShell call operator ──

describe('powershell call operator (&)', () => {
  it('prepends & to the command string', () => {
    const profile: TerminalProfile = {
      id: 'test',
      name: 'Test',
      command: 'claude',
      args: [],
    };
    const cmd = psCmdString(profile);
    expect(cmd).toMatch(/^& 'claude'$/);
  });

  it('prepends & with multiple args', () => {
    const profile: TerminalProfile = {
      id: 'test',
      name: 'Test',
      command: 'aider',
      args: ['--model', 'gpt-4'],
    };
    const cmd = psCmdString(profile);
    expect(cmd).toBe("& 'aider' '--model' 'gpt-4'");
  });
});

// ── DEFAULT_PROFILES ──

describe('DEFAULT_PROFILES', () => {
  it('includes system shell with __SYSTEM_SHELL__ command', () => {
    const shell = DEFAULT_PROFILES.find((p) => p.id === 'system-shell');
    expect(shell).toBeDefined();
    expect(shell!.command).toBe('__SYSTEM_SHELL__');
  });

  it('has unique IDs', () => {
    const ids = DEFAULT_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every profile has required fields', () => {
    for (const p of DEFAULT_PROFILES) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.command).toBeTruthy();
      expect(Array.isArray(p.args)).toBe(true);
    }
  });
});

// ── createCustomProfile ──

describe('createCustomProfile', () => {
  it('creates a profile with generated ID', () => {
    const p = createCustomProfile('My Tool', 'mytool', ['--flag']);
    expect(p.id).toBeTruthy();
    expect(p.name).toBe('My Tool');
    expect(p.command).toBe('mytool');
    expect(p.args).toEqual(['--flag']);
  });

  it('defaults args to empty array', () => {
    const p = createCustomProfile('Shell', 'sh');
    expect(p.args).toEqual([]);
  });

  it('generates unique IDs', () => {
    const a = createCustomProfile('A', 'a');
    const b = createCustomProfile('B', 'b');
    expect(a.id).not.toBe(b.id);
  });
});
