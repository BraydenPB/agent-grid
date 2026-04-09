# v1.0 Release Roadmap

Created: 2026-04-08 (after v0.1.0-beta.1 audit)
Status: In progress

## Context

Full security and dependency audit was performed before cutting v0.1.0-beta.1. The app is architecturally sound, security-conscious, and functionally complete for beta use. This document tracks what must be resolved before a stable v1.0 release.

## P0 — Blocking for v1.0

### 1. Test Coverage for Security-Critical Functions

**Why**: Zero test files exist despite full vitest + testing-library infra being configured. Shell quoting, path normalization, and layout persistence are attack surface — they need regression tests.

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

**Why**: `layout-storage.ts` parses JSON from localStorage with minimal validation (only checks `Array.isArray(data.panes)`). Corrupted data can crash the app.

**Fix**: Add Zod schema or manual validation for all fields in `SavedLayout`. Reject and fall back to default on invalid data. Consider try/catch around `JSON.parse` with structured error recovery.

**File**: `src/lib/layout-storage.ts`

### 3. Clipboard Error Handling

**Why**: `navigator.clipboard.readText()` in `terminal-pane.tsx:208,456` has no `.catch()`. Silently fails if user denies clipboard permission.

**Fix**: Add `.catch()` with user-visible feedback (e.g., brief toast or terminal message).

**File**: `src/features/terminals/terminal-pane.tsx`

### 4. Code Signing

**Why**: Unsigned desktop binaries trigger OS security warnings (SmartScreen on Windows, Gatekeeper on macOS). Required for trusted distribution.

**Steps**:

- Windows: Obtain EV code signing certificate, configure in `tauri.conf.json` bundle settings
- macOS: Apple Developer ID certificate, notarization via `xcrun notarytool`
- Add signing to CI/CD pipeline (GitHub Actions)

**Reference**: https://v2.tauri.app/distribute/sign/windows/ and https://v2.tauri.app/distribute/sign/macos/

### 5. Auto-Update Mechanism

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

**Why**: Single chunk exceeds Vite's 500KB warning by 3x. Affects initial load time in WebView.

**Fix**: Code-split with dynamic imports — lazy-load command palette, project browser, context menu, terminal search. Consider `manualChunks` in Vite config for vendor splitting.

### 7. ESLint Warnings Cleanup

**Why**: 24 warnings (19 Dockview `any` types, 1 missing useEffect deps, 4 tauri-shim `any`).

**Fix**:

- Type the Dockview API parameters properly in `terminal-grid.tsx` (use `IDockviewPanelProps` etc.)
- Add explicit eslint-disable comment with rationale for the intentional missing deps in `terminal-pane.tsx:636`
- Type the tauri-shim dynamic imports

### 8. PTY Zombie Prevention

**Why**: PTY processes are kept alive on unmount for potential reattach. If `destroyTerminalEntry()` isn't called on pane deletion, zombie processes accumulate.

**Fix**: Add a finalizer or watchdog that kills PTY processes for entries not reattached within N seconds. Or ensure every pane removal path calls `destroyTerminalEntry()`.

**File**: `src/features/terminals/terminal-pane.tsx`, `src/lib/terminal-registry.ts`

### 9. Error Boundary Production Mode

**Why**: Shows full stack traces including file paths and dependency names. Fine for dev, not for distributed app.

**Fix**: In production builds, show user-friendly message only. Log full stack to console. Consider opt-in crash reporting (Sentry or similar).

**File**: `src/components/error-boundary.tsx`

### 10. Shell Command Allowlist

**Why**: `profile.command` in `resolveShellCommand()` accepts any string. A malicious stored profile could execute arbitrary commands.

**Fix**: Validate against known command names or block path separators. At minimum, reject commands containing `/`, `\`, or `..`.

**File**: `src/lib/profiles.ts`

### 11. Upgrade lucide-react to v1.x

**Why**: Currently pinned to `^0.460.0`, v1.0+ is stable. Will drift further if not upgraded now.

---

## P2 — Nice to Have

### 12. cargo-audit in CI

Add `cargo install cargo-audit && cargo audit` to GitHub Actions workflow. Currently not installed locally.

### 13. WSL Path Handling

`cwd.ts` handles MSYS/Cygwin `/c/Users/...` paths but not WSL2 `/mnt/c/...` format.

### 14. Regex DoS Protection in Terminal Search

User-supplied regex with `useRegex=true` could cause catastrophic backtracking on large terminal output. Add timeout or safe-regex validation.

### 15. Custom Layout Saving

Let users save current Dockview layout as a named preset. Requires layout persistence + stored presets list.

### 16. Workspace Persistence to Filesystem

Move from localStorage to Tauri filesystem API for layout/workspace persistence. More reliable, survives WebView cache clears.

---

## Architecture Notes for Future Sessions

See `.claude/layout-refactor.md` for component tree, state flow, key files, and Dockview API reference. That document is still accurate as of v0.1.0-beta.1.

### Key Security Properties to Maintain

1. **CSP stays strict** — don't add `unsafe-eval` or wildcard origins
2. **Shell args always quoted** — never interpolate user input directly into shell strings
3. **Tauri permissions stay minimal** — don't add filesystem/shell-execute unless truly needed
4. **Path inputs always canonicalized** — resolve before any filesystem operation
5. **PTY spawning uses spawnSeq** — always check sequence number in async callbacks
