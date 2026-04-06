import type { TerminalProfile } from "@/types";
import { generateId } from "./utils";

// Built-in terminal profiles for popular AI coding tools
export const DEFAULT_PROFILES: TerminalProfile[] = [
  {
    id: "system-shell",
    name: "Shell",
    command: "__SYSTEM_SHELL__",
    args: [],
    color: "#6b7280",
  },
  {
    id: "claude-code",
    name: "Claude Code",
    command: "claude",
    args: [],
    color: "#d97706",
  },
  {
    id: "codex",
    name: "Codex",
    command: "codex",
    args: [],
    color: "#10b981",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    command: "gemini",
    args: [],
    color: "#3b82f6",
  },
  {
    id: "aider",
    name: "Aider",
    command: "aider",
    args: [],
    color: "#8b5cf6",
  },
  {
    id: "opencode",
    name: "OpenCode",
    command: "opencode",
    args: [],
    color: "#ec4899",
  },
];

export function resolveShellCommand(profile: TerminalProfile, osPlatform: string): { command: string; args: string[] } {
  if (profile.command === "__SYSTEM_SHELL__") {
    if (osPlatform === "windows") {
      return { command: "powershell.exe", args: [] };
    }
    return { command: process.env.SHELL || "/bin/bash", args: ["-l"] };
  }
  return { command: profile.command, args: profile.args };
}

export function createCustomProfile(name: string, command: string, args: string[] = []): TerminalProfile {
  return {
    id: generateId(),
    name,
    command,
    args,
    color: "#6b7280",
  };
}
