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

/** Escape an argument for safe embedding in a PowerShell -Command string */
function quotePowerShell(arg: string): string {
  return "'" + arg.replace(/'/g, "''") + "'";
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
    const cmdWithArgs = parts.map(quotePowerShell).join(' ');
    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-Command', `& ${cmdWithArgs}`],
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
