# Task List: `alva auth login`

Companion to `2026-04-13-auth-login.md`.

## Task 1: Core auth module — `src/cli/auth.ts`

**Complexity:** normal
**Dependencies:** none

**Files:** `src/cli/auth.ts`, `test/auth.test.ts`

**What to do:** Create `auth.ts` with the core login logic. The module
exports `handleAuthLogin(args, deps?)` which:

1. Parses `--profile` and `--auth-url` flags from args
2. Generates a 32-byte hex state via `crypto.randomBytes`
3. Starts an HTTP server on port 0
4. Opens the browser to `<authUrl>/cli-auth?callback_port=<PORT>&state=<STATE>`
5. Waits for a GET to `/callback?api_key=<KEY>&state=<STATE>` (timeout: 120s)
6. Validates state, saves API key via `writeConfig`, returns result

All side effects (createServer, exec, writeConfig deps) are injectable via
a `deps` parameter for testability, with real implementations as defaults.

The callback server responds with a small HTML page (success or error) so
the user sees feedback in the browser.

**Steps:**

- [ ] Write failing tests in `test/auth.test.ts`:
  - Happy path: valid callback resolves with api key, writeConfig called
  - State mismatch: server responds 400, promise not resolved
  - Missing api_key: server responds 400, promise not resolved
  - Timeout: rejects with timeout error
  - --profile flag: saves under correct profile
  - --auth-url flag: browser opened with correct URL
  - openBrowser failure: error swallowed
  - Server listen error: rejects with error
  - generateState: returns 64-char hex
- [ ] Run tests, verify they fail: `npm test -- test/auth.test.ts`
- [ ] Implement `auth.ts` with dependency injection
- [ ] Run tests, verify they pass: `npm test -- test/auth.test.ts`
- [ ] Run linting: `npm run lint`

## Task 2: Wire into CLI dispatch — `src/cli/index.ts`

**Complexity:** simple
**Dependencies:** Task 1

**Files:** `src/cli/index.ts`, `test/cli.test.ts`

**What to do:** Add `auth login` routing to the CLI:

1. Add `auth` to `HELP_TEXT` command list
2. Add `auth` entry to `COMMAND_HELP` with usage text
3. In `main()`, add `auth` handling before `loadConfig` (same pattern as
   `configure` at line 1116) — route `auth login` to `handleAuthLogin`,
   route `auth --help` / `auth login --help` to help text
4. Handle bare `auth` (no subcommand) by showing help

**Steps:**

- [ ] Write failing tests in `test/cli.test.ts`:
  - `auth login --help` returns help text
  - `auth --help` returns help text
  - `auth` without subcommand shows help
  - Top-level help mentions `auth`
- [ ] Run tests, verify they fail: `npm test -- test/cli.test.ts`
- [ ] Implement the routing in `index.ts`
- [ ] Run tests, verify they pass: `npm test -- test/cli.test.ts`
- [ ] Run full test suite: `npm test`
- [ ] Run linting: `npm run lint`

## Dependency Graph

```text
Task 1 (auth.ts + tests)  ──── Task 2 (wire into index.ts)
```

Sequential — Task 2 imports from Task 1.
