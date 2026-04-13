# feat: add `alva auth login` browser-based authentication flow

## 1. Background

The `alva` CLI currently requires users to manually obtain an API key from the
web UI and run `alva configure --api-key <key>`. This is friction-heavy: the
user must navigate the web app, find the API key settings, copy the key, and
paste it into the terminal. Every CLI tool with a user base (gh, gcloud, stripe,
supabase) provides `<tool> login` for a reason — it's the expected UX.

**Goal:** Add `alva auth login` that opens the user's browser to a frontend
authentication page, waits for a localhost callback containing the API key,
and saves it to the config file.

**Relevant systems:**

- `code/public/toolkit-ts/src/cli/index.ts` — CLI dispatch and command handling
- `code/public/toolkit-ts/src/cli/config.ts` — Config read/write with profile support
- Alva frontend (out of scope) — will host `/cli-auth` page that handles SSO
  login, calls `CreateApiKey` GraphQL mutation, and redirects to localhost

**Constraints:**

- CLI-only change; no backend or frontend modifications in this task
- No new npm dependencies — use Node.js built-in `http`, `url`, `crypto`
- Must work cross-platform (macOS, Linux, Windows)
- Must respect existing `--profile` flag
- **`--base-url` is the API endpoint** (default `https://api-llm.prd.alva.ai`),
  not the frontend origin. The browser login URL must point to the frontend
  (e.g. `https://alva.ai/cli-auth`). The login command derives the frontend
  URL from a separate `--auth-url` flag or a sensible default
  (`https://alva.ai`). This keeps API base URL and frontend origin decoupled.
- The frontend `/cli-auth` page is assumed to exist (or will be built separately)

## 2. End-to-End Behavior

### Primary behavior

User runs `alva auth login`. The CLI:

1. Starts a local HTTP server on a random available port
2. Generates a cryptographic random `state` token
3. Opens the user's default browser to
   `<authUrl>/cli-auth?callback_port=<PORT>&state=<STATE>`
   (where `authUrl` defaults to `https://alva.ai` or is overridden via `--auth-url`)
4. Prints a message: "Opening browser... If it doesn't open, visit: <URL>"
5. Waits for the frontend to redirect to
   `http://localhost:<PORT>/callback?api_key=<KEY>&state=<STATE>`
6. Verifies the `state` matches
7. Saves the API key to `~/.config/alva/config.json` (respecting `--profile`)
8. Prints success: "Logged in successfully. API key saved to profile '<name>'."
9. Shuts down the local HTTP server and exits

### Variants

- `alva auth login --profile staging` — saves the key under the "staging" profile
- `alva auth login --auth-url http://localhost:3000` — uses a custom frontend
  URL for the auth page (for local development)

### Failure modes

- **State mismatch** → reject the callback, print error, keep server running
  for a valid retry
- **Timeout (120s)** → shut down server, print "Login timed out. Run
  `alva auth login` to try again."
- **Browser fails to open** → print the URL manually (always printed regardless)
- **Port binding** — uses port 0 (OS picks a random available port), so
  port conflicts cannot occur by design
- **Callback missing `api_key`** → reject, print error, keep server running
- **User cancels (Ctrl+C)** → clean shutdown of HTTP server

## 3. Findings

- **Existing config infrastructure:** `writeConfig` in `config.ts` already
  handles profile-based config with proper file permissions (0600). The login
  command reuses this directly.
- **Existing command pattern:** `handleConfigure` in `index.ts` shows the
  pattern — exported async function, receives args, returns a result object.
  `main()` handles the `configure` command before loading config (since it
  doesn't need existing auth). `auth login` needs the same pre-auth treatment.
- **No existing auth commands:** The CLI has no `auth` command group yet. This
  is the first.
- **Cross-platform browser open:** `child_process.exec` with platform detection:
  `open` (macOS), `xdg-open` (Linux), `start` (Windows). No npm dependency
  needed.
- **CreateApiKey on backend:** The GraphQL mutation
  `CreateApiKey(name, scopes, expiresAt)` returns `{ plainKey, apiKey }`.
  The frontend will call this after SSO login and pass `plainKey` in the
  callback. The CLI never interacts with this directly.
- **Scope shape:** Single-service (toolkit-ts only). The frontend `/cli-auth`
  page is a separate task.

**Reference files for implementation:**

- Handler pattern: `handleConfigure` in `cli/index.ts:514-558`
- Test pattern: `test/cli.test.ts`
- Config pattern: `writeConfig` in `cli/config.ts:72-124`

## 4. Change Specification

### Affected modules

**toolkit-ts** (single service, no cross-service impact):

- `src/cli/auth.ts` **(new)** — `handleAuthLogin()` function containing:
  - `generateState()` — 32-byte hex random state via `crypto.randomBytes`
  - `openBrowser(url)` — cross-platform browser open via `child_process.exec`
  - `startCallbackServer(state, opts)` — creates `http.createServer`, listens
    on port 0, returns a promise that resolves with the API key on valid
    callback or rejects on timeout
  - `handleAuthLogin(args, deps?)` — orchestrator: parse flags, start server,
    open browser, await callback, save config, return result

- `src/cli/index.ts` **(modified)** —
  - Add `auth` entry to `HELP_TEXT` and `COMMAND_HELP`
  - Add `auth login` routing in `main()` before `loadConfig` (same pattern
    as `configure` — `auth login` doesn't need existing auth)
  - Import and call `handleAuthLogin`

- `test/auth.test.ts` **(new)** — unit tests for `handleAuthLogin`

### API changes

None. This is a CLI-only change. No new REST/GraphQL/gRPC endpoints.

### Database impact

None.

### Configuration changes

- New CLI flag `--auth-url <url>` on `auth login` — overrides the default
  frontend URL (`https://alva.ai`). Not persisted to config file.
- Existing `--profile` flag is respected for saving the API key.

### Backward compatibility

Fully backward compatible. New command, no changes to existing commands.

### Error path analysis

```
METHOD/CODEPATH              | WHAT CAN GO WRONG           | HANDLING                    | USER SEES
-----------------------------|-----------------------------|-----------------------------|---------------------------
handleAuthLogin()            | Missing args (none required)| Proceed with defaults       | Normal flow
startCallbackServer()        | Server listen error         | Reject promise              | "Failed to start server: <err>"
                             | Timeout (120s)              | Close server, reject        | "Login timed out..."
                             | Callback missing api_key    | 400 response, keep running  | Browser shows error, CLI waits
                             | State mismatch              | 400 response, keep running  | Browser shows error, CLI waits
                             | Valid callback               | Resolve with api_key        | Success
openBrowser()                | exec fails (no browser)     | Swallow error, log URL      | "If it doesn't open, visit: <URL>"
writeConfig()                | mkdir/write fails            | Throw, caught by main()     | "CLI_ERROR: <message>"
```

No critical gaps — every error path has explicit handling.

## 5. Testability Design & Test Plan

### Testability design

- **Module boundary:** `handleAuthLogin` in `auth.ts` is the primary seam.
  It accepts a `deps` parameter (same pattern as `handleConfigure`) for
  injecting: `writeConfig` deps (env, homedir, mkdir, writeFile, readFile),
  `createServer` (injectable HTTP server factory), and `openBrowser`
  (injectable function).
- **Isolation strategy:** Tests inject a mock HTTP server that never binds
  a real port. The callback logic is tested by directly invoking the
  server's request handler with mock req/res objects. `openBrowser` is
  a no-op stub. `writeConfig` deps use in-memory mocks (same as
  `handleConfigure` tests).
- **Side-effect boundaries:**
  - `http.createServer` + `server.listen` — injected via deps
  - `child_process.exec` for browser open — injected via deps
  - `writeConfig` filesystem calls — injected via deps (already proven
    pattern from `handleConfigure`)

### Code path coverage

```
CODE PATH COVERAGE
===========================
[+] src/cli/auth.ts
    |
    +-- handleAuthLogin()
    |   +-- [PLAN] Happy path: valid callback with matching state  -- auth.test.ts
    |   +-- [PLAN] Error: state mismatch                          -- auth.test.ts
    |   +-- [PLAN] Error: callback missing api_key                -- auth.test.ts
    |   +-- [PLAN] Error: timeout                                 -- auth.test.ts
    |   +-- [PLAN] --profile flag respected                       -- auth.test.ts
    |   +-- [PLAN] --auth-url flag overrides default              -- auth.test.ts
    |   +-- [PLAN] Error: server listen failure                   -- auth.test.ts
    |
    +-- openBrowser()
    |   +-- [PLAN] Calls platform-appropriate command             -- auth.test.ts
    |   +-- [PLAN] Swallows errors gracefully                     -- auth.test.ts
    |
    +-- generateState()
        +-- [PLAN] Returns 64-char hex string                    -- auth.test.ts

[+] src/cli/index.ts (modified)
    |
    +-- main() routing
    |   +-- [PLAN] "auth login" dispatches to handleAuthLogin    -- cli.test.ts
    |   +-- [PLAN] "auth login --help" shows help text           -- cli.test.ts
    |   +-- [PLAN] "auth" without subcommand shows help          -- cli.test.ts
```

### Unit tests

| Test case           | Input                                                      | Expected behavior                                                                                 |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Happy path login    | Valid callback with `api_key=alva_abc&state=<matching>`    | Resolves with `{status: "logged_in", apiKey: "alva_abc", profile: "default"}`, writeConfig called |
| State mismatch      | Callback with `state=wrong`                                | Server responds 400, promise stays pending (not resolved)                                         |
| Missing api_key     | Callback with `state=<matching>` but no `api_key`          | Server responds 400, promise stays pending                                                        |
| Timeout             | No callback within timeout period                          | Rejects with timeout error message                                                                |
| --profile flag      | `["auth", "login", "--profile", "staging"]`                | Config saved under "staging" profile                                                              |
| --auth-url flag     | `["auth", "login", "--auth-url", "http://localhost:3000"]` | Browser opened with `http://localhost:3000/cli-auth?...`                                          |
| openBrowser success | Normal exec                                                | `exec` called with platform-appropriate command and the URL                                       |
| openBrowser failure | exec rejects                                               | Error swallowed, no throw                                                                         |
| generateState       | No input                                                   | Returns 64-character hex string (32 bytes)                                                        |

### Integration / E2E tests

**E2E Required: no** — single-service CLI change with no backend interaction.
The frontend `/cli-auth` page doesn't exist yet, so end-to-end testing of
the full flow is not possible. Unit tests with dependency injection provide
sufficient coverage.

### Edge cases

| Edge case                        | Expected behavior                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| Multiple callbacks (first valid) | First valid callback resolves, server shuts down, subsequent requests get connection refused |
| Ctrl+C during wait               | Process exits cleanly, server closed                                                         |
| Very long api_key in query param | Accepted (no length limit on CLI side)                                                       |

## 6. Human Interaction

### Initial thoughts

User requested "create cli func about auth login that visit a link and then
callback with a link contains api key."

### Iteration feedback

- Command should be `alva auth login` (not `alva login`) for extensibility
- Confirmed Option A: CLI + Frontend only (no backend changes)
- Confirmed Approach B: separate `cli/auth.ts` module
- State parameter: yes. PKCE: no (not applicable, frontend handles OAuth)

## 7. Outcome

### Changes made

**Source code:**

- `src/cli/auth.ts` **(new)** — Core auth login module. Exports
  `generateState()`, `handleAuthLogin(args, deps?)`, `AuthLoginDeps`,
  `AuthLoginResult`. Implements: local HTTP server on port 0, state CSRF
  token, cross-platform browser open, callback validation, config save
  via `writeConfig`. All side effects injectable via `deps` parameter.

- `src/cli/index.ts` **(modified)** — Added `auth` to `HELP_TEXT`,
  `COMMAND_HELP` entry for `auth login`, `auth` routing in both `main()`
  (before `loadConfig`, matching `configure` pattern) and `dispatch()`
  (for help/bare command handling). Import of `handleAuthLogin` from
  `./auth.js`.

**Test code:**

- `test/auth.test.ts` **(new)** — 10 test cases for the auth module.
- `test/cli.test.ts` **(modified)** — 4 test cases for CLI routing/help.

### Tests added

| Test case                         | File         | Verifies                                                     |
| --------------------------------- | ------------ | ------------------------------------------------------------ |
| generateState returns 64-char hex | auth.test.ts | `crypto.randomBytes(32)` produces valid hex                  |
| Happy path login                  | auth.test.ts | Valid callback resolves with `logged_in`, writeConfig called |
| State mismatch                    | auth.test.ts | 400 response, promise stays pending                          |
| Missing api_key                   | auth.test.ts | 400 response, promise stays pending                          |
| Timeout                           | auth.test.ts | Rejects with timeout error after configured duration         |
| --profile flag                    | auth.test.ts | Config saved under named profile                             |
| --auth-url flag                   | auth.test.ts | Browser URL uses custom auth URL                             |
| openBrowser success               | auth.test.ts | `openBrowser` called with correct URL params                 |
| openBrowser failure               | auth.test.ts | Error swallowed, login completes on callback                 |
| Server listen error               | auth.test.ts | Rejects with the server error                                |
| auth login --help                 | cli.test.ts  | Returns help text for auth login                             |
| auth --help                       | cli.test.ts  | Returns help text for auth                                   |
| auth without subcommand           | cli.test.ts  | Shows help                                                   |
| Top-level help mentions auth      | cli.test.ts  | `auth` appears in main help text                             |

All 14 planned test cases from section 5 coverage diagram are implemented.
Zero gaps.

### Migration

Not applicable — no database changes.

## 8. Remaining Tasks

- **Frontend `/cli-auth` page** — The CLI opens a browser to
  `<authUrl>/cli-auth?callback_port=PORT&state=STATE`. This page must
  handle SSO login, call `CreateApiKey` GraphQL mutation, and redirect to
  `http://localhost:PORT/callback?api_key=KEY&state=STATE`. This is a
  separate frontend task.
- **`alva auth logout`** — Future command to revoke the API key and clear
  the config profile. Not needed for MVP.
- **`alva auth status`** — Future command to show current auth state
  (which profile, whether key is valid). Not needed for MVP.
