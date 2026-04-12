import type { TerminalProfile } from '@/types';
import { generateId } from './utils';

// Built-in terminal profiles for popular AI coding tools
export const DEFAULT_PROFILES: TerminalProfile[] = [
  {
    id: 'system-shell',
    name: 'Shell',
    command: '__SYSTEM_SHELL__',
    args: [],
    color: '#6b7280',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    args: [],
    color: '#d97706',
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    args: [],
    color: '#10b981',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    command: 'gemini',
    args: [],
    color: '#3b82f6',
  },
  {
    id: 'aider',
    name: 'Aider',
    command: 'aider',
    args: [],
    color: '#8b5cf6',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    args: [],
    color: '#ec4899',
  },
];

/** Escape an argument for safe embedding in a bash -c string */
function quoteBash(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/** Escape an argument for safe embedding in a cmd.exe /C command string */
function quoteCmd(arg: string): string {
  if (arg === '') return '""';
  // No special characters — return as-is
  if (!/[ \t"&|<>^%!()@,;=]/.test(arg)) return arg;
  // Wrap in double quotes; escape % (variable expansion) and " (quote literal)
  return '"' + arg.replace(/%/g, '%%').replace(/"/g, '""') + '"';
}

export function resolveShellCommand(
  profile: TerminalProfile,
  osPlatform: string,
): { command: string; args: string[] } {
  if (profile.command === '__SYSTEM_SHELL__') {
    if (osPlatform === 'windows') {
      return { command: 'powershell.exe', args: [] };
    }
    // macOS/Linux — use default shell
    return { command: '/bin/bash', args: ['-l'] };
  }

  // Non-shell profiles: spawn through the system shell so that PATH
  // resolution, .cmd shims (Windows), and login-profile env vars all work.
  // Each argument is individually quoted to prevent shell metacharacter injection.
  const parts = [profile.command, ...profile.args];
  if (osPlatform === 'windows') {
    // Use cmd.exe /C — PowerShell's -Command mode creates a non-interactive
    // session that doesn't properly handle interactive CLI tools in a conpty.
    // cmd.exe /C handles .cmd shims natively and inherits the conpty correctly.
    // Build a single escaped command string (mirroring the bash -lc approach)
    // so that spaces, &, |, %, etc. in paths/args are safe.
    const cmdString = parts.map(quoteCmd).join(' ');
    return {
      command: 'cmd.exe',
      args: ['/C', cmdString],
    };
  }
  const cmdWithArgs = parts.map(quoteBash).join(' ');
  return { command: '/bin/bash', args: ['-lc', cmdWithArgs] };
}

export function createCustomProfile(
  name: string,
  command: string,
  args: string[] = [],
): TerminalProfile {
  return {
    id: generateId(),
    name,
    command,
    args,
    color: '#6b7280',
  };
}
