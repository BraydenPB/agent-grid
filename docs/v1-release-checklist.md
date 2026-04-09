# v1.0 Release Checklist

Full audit performed 2026-04-08 before cutting v0.1.0-beta.1. This document tracks what must be resolved before stable v1.0.

## Audit Summary

| Check       | Result                          |
| ----------- | ------------------------------- |
| TypeScript  | Clean (0 errors)                |
| Vite Build  | Clean (1 warning: 1.5MB bundle) |
| Cargo Check | Clean                           |
| ESLint      | 0 errors, 24 warnings           |
| npm audit   | 0 vulnerabilities               |
| cargo-audit | Not installed (add to CI)       |
| Tests       | None exist (infra configured)   |

---

## P0 — Blocking for v1.0

### 1. Test Coverage for Security-Critical Functions

**Status**: Not started
**Why**: Zero test files exist despite full vitest + testing-library infra being configured. Shell quoting, path normalization, and layout persistence are attack surface.

**Files to test**:

- `src/lib/profiles.ts` — `quoteBash()`, `quotePowerShell()`, `resolveShellCommand()`
  - Edge cases: single quotes, backticks, `$(...)`, `; rm -rf /`, newlines, empty strings, unicode
- `src/lib/cwd.ts` — `normalizeCwd()`
  - Edge cases: MSYS paths, UNC paths, `file://` URIs, WSL `/mnt/c` paths, `..` traversal, empty input
- `src/lib/layout-storage.ts` — `loadLayout()`, `saveLayout()`
  - Edge cases: corrupted JSON, missing fields, extra fields, empty arrays, null values
- `src/store/workspace-store.ts` — state transitions
  - Pane add/remove, profile switching, preset application

**Target**: 80%+ coverage on lib/ directory, integration tests for store actions.

### 2. Runtime Validation for Layout Persistence

**Status**: Not started
**Why**: `layout-storage.ts` parses JSON from localStorage with minimal validation (only checks `Array.isArray(data.panes)`). Corrupted data can crash the app.

**Fix**: Add Zod schema or manual validation for all fields in `SavedLayout`. Reject and fall back to default on invalid data.

**File**: `src/lib/layout-storage.ts`

### 3. Clipboard Error Handling

**Status**: Not started
**Why**: `navigator.clipboard.readText()` in `terminal-pane.tsx:208,456` has no `.catch()`. Silently fails if user denies clipboard permission.

**Fix**: Add `.catch()` with user-visible feedback (brief toast or terminal message).

**File**: `src/features/terminals/terminal-pane.tsx`

### 4. Code Signing

**Status**: Not started
**Why**: Unsigned desktop binaries trigger OS security warnings (SmartScreen on Windows, Gatekeeper on macOS). Required for trusted distribution.

**Steps**:

- Windows: Obtain EV code signing certificate, configure in `tauri.conf.json` bundle settings
- macOS: Apple Developer ID certificate, notarization via `xcrun notarytool`
- Add signing to CI/CD pipeline (GitHub Actions)

**Reference**: https://v2.tauri.app/distribute/sign/windows/ and https://v2.tauri.app/distribute/sign/macos/

### 5. Auto-Update Mechanism

**Status**: Not started
**Why**: Users running an older version with a security fix have no way to know or update. Critical for a terminal app that spawns shells.

**Steps**:

- Add `tauri-plugin-updater` to Cargo.toml and package.json
- Configure update endpoint (GitHub Releases or custom server)
- Add update check on app launch + periodic background checks
- UI for "Update available" notification

**Reference**: https://v2.tauri.app/plugin/updater/

---

## P1 — Should Fix Before v1.0

### 6. Bundle Size (1.5MB JS chunk)

**Why**: Single chunk exceeds Vite's 500KB warning by 3x.

**Fix**: Code-split with dynamic imports — lazy-load command palette, project browser, context menu, terminal search. Consider `manualChunks` in Vite config for vendor splitting.

### 7. ESLint Warnings Cleanup (24 warnings)

**Why**: 19 Dockview `any` types, 1 missing useEffect deps, 4 tauri-shim `any`.

**Fix**:

- Type the Dockview API parameters properly in `terminal-grid.tsx` (use `IDockviewPanelProps` etc.)
- Add explicit eslint-disable comment with rationale for the intentional missing deps in `terminal-pane.tsx:636`
- Type the tauri-shim dynamic imports

### 8. PTY Zombie Prevention

**Why**: PTY processes are kept alive on unmount for potential reattach. If `destroyTerminalEntry()` isn't called on pane deletion, zombie processes accumulate.

**Fix**: Add a finalizer or watchdog that kills PTY processes for entries not reattached within N seconds. Or ensure every pane removal path calls `destroyTerminalEntry()`.

**File**: `src/features/terminals/terminal-pane.tsx`, `src/lib/terminal-registry.ts`

### 9. Error Boundary Production Mode

**Why**: Shows full stack traces including file paths. Fine for dev, not for distributed app.

**Fix**: In production builds, show user-friendly message only. Log full stack to console.

**File**: `src/components/error-boundary.tsx`

### 10. Shell Command Allowlist

**Why**: `profile.command` accepts any string. A malicious stored profile could execute arbitrary commands.

**Fix**: Validate against known command names or block path separators. Reject commands containing `/`, `\`, or `..`.

**File**: `src/lib/profiles.ts`

### 11. Upgrade lucide-react to v1.x

**Why**: Currently pinned to `^0.460.0`, v1.0+ is stable. Will drift further if not upgraded now.

---

## P2 — Nice to Have

### 12. cargo-audit in CI

Add `cargo install cargo-audit && cargo audit` to GitHub Actions workflow.

### 13. WSL Path Handling

`cwd.ts` handles MSYS/Cygwin `/c/Users/...` paths but not WSL2 `/mnt/c/...` format.

### 14. Regex DoS Protection in Terminal Search

User-supplied regex with `useRegex=true` could cause catastrophic backtracking on large terminal output. Add timeout or safe-regex validation.

### 15. Workspace Persistence to Filesystem

Move from localStorage to Tauri filesystem API for layout/workspace persistence. More reliable, survives WebView cache clears.

---

## Ecosystem Status (as of 2026-04-08)

| Component        | Version | Status                          | Risk                        |
| ---------------- | ------- | ------------------------------- | --------------------------- |
| Tauri v2         | 2.10.3  | Stable since Oct 2024           | Low                         |
| xterm.js v6      | 6.x     | Industry standard, no CVEs      | Low                         |
| Dockview         | 5.2.0   | Active, zero-dep                | Low                         |
| tauri-plugin-pty | 0.2.1   | Pre-stable, only PTY option     | Medium                      |
| npm ecosystem    | —       | 454K malicious packages in 2025 | Medium (lockfile mitigates) |
