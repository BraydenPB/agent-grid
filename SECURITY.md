# Security Policy

## Supported Versions

Agent Grid is in active pre-release development. Security fixes are applied to
the latest pre-release only.

| Version                                                 | Supported |
| ------------------------------------------------------- | --------- |
| Latest pre-release (`v0.x.x-alpha.*` / `v0.x.x-beta.*`) | Yes       |
| Older pre-releases                                      | No        |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, use GitHub's private vulnerability reporting:
<https://github.com/BraydenPB/agent-grid/security/advisories/new>

Include:

- A description of the issue and the impact
- Steps to reproduce (minimum proof of concept)
- Affected version(s)
- Your contact info for follow-up

You can expect an initial response within 7 days. Once confirmed, we'll work
with you on a coordinated disclosure timeline before publishing a fix.

## Scope

Agent Grid runs with user privileges and spawns PTY processes. The threat
model focuses on:

- **Shell injection** — user-supplied paths, profile arguments, and environment
  must not allow arbitrary command execution outside the requested PTY.
- **Path traversal** — project and worktree paths are canonicalized in the Rust
  backend before use.
- **Webview isolation** — the frontend runs under a strict Content Security
  Policy; Tauri capabilities grant only the PTY plugin, dialog, and OS info.
- **Layout persistence** — serialized layout JSON is validated on load; invalid
  data is rejected rather than executed.

Out of scope:

- Vulnerabilities in CLIs the user chooses to run inside a pane (Claude Code,
  Codex, shell, etc.) — those are upstream issues.
- Exploits that require the user to run Agent Grid with elevated privileges
  against their own filesystem.
