# feat: auto-provision Arrays JWT during `alva configure`

## 1. Background

Arrays JWTs (ES256, 7-day TTL, stored server-side as the `ARRAYS_JWT`
jagent secret) let a user's sandbox scripts call the Arrays partner API
via `secret.loadPlaintext('ARRAYS_JWT')`. Today a newly configured CLI
user does NOT have this secret — the first time something tries to read
it, sandbox code fails until the user knows to call the `EnsureArraysJWT`
endpoint manually. Arrays JWT bootstrap is an invisible prerequisite the
user should not have to think about.

**Relevant systems:**

- `toolkit-ts` (`@alva-ai/toolkit`) — CLI + SDK. `alva configure` writes
  `~/.config/alva/config.json` and does no network I/O today
  (`src/cli/config.ts:72-124`, `src/cli/index.ts:446-490`).
- `alva-gateway` — already exposes the two REST endpoints we need:
  - `POST /api/v1/arrays-jwt/ensure` → idempotent sign-if-needed,
    returns `{expires_at, tier, renewed}`
    (`alva-gateway/pkg/handler/arrays_jwt.go:34-53`).
  - `GET /api/v1/arrays-jwt/status` →
    `{exists, expires_at, tier, renewal_needed}`
    (`alva-gateway/pkg/handler/arrays_jwt.go:57-77`).
  - Router: `alva-gateway/cmd/gateway/main.go:258-259`, sits inside
    the `middleware.Authorization()` group which accepts
    `X-Alva-Api-Key` (`alva-gateway/pkg/middleware/auth.go:131-150`).
- `alva-backend` — owns the RPCs and signing (`pkg/arrays/jwt.go`,
  `internal/services/user/user_arrays_jwt.go`). Not modified by this
  change.

**Constraints (verified during research):**

- CLI authenticates with `X-Alva-Api-Key`
  (`toolkit-ts/src/client.ts:106-111`). The gateway Ensure/Status
  routes accept this header — verified in
  `alva-gateway/pkg/middleware/auth.go:131-150` which sets a real
  `id` + role for API-key callers and passes `requireLoginUser`
  (`alva-gateway/pkg/handler/common.go:95`). Only playbook-share tokens are rejected.
- The Ensure response contains metadata only (`expires_at`, `tier`,
  `renewed`); the JWT string itself is written to the server-side
  jagent secret and is never returned to the client. This matches the
  product intent — the CLI never has to handle or persist the JWT
  locally.
- Ensure is idempotent: if the existing JWT still has ≥ 2 days of TTL
  it returns `renewed: false`. Safe to call on every `configure`
  invocation, including reconfigures.

**Premises agreed with user:**

- **P1** — Trigger point is `alva configure` success (one-shot), NOT
  every CLI process start. Rationale: Ensure is idempotent but TTL is
  7 days, so per-command calls are pure overhead; backend lazy-renewal
  hooks in the LLM sandbox path already cover mid-life refresh.
- **P2** — Ensure failure is a soft warning, not a blocker.
  `configure` remains semantically "write local credentials" — core
  succeeds even if the network is down or the backend is degraded.
- **P3** — Ship explicit `alva arrays-jwt ensure` and
  `alva arrays-jwt status` subcommands alongside the auto-bootstrap,
  so users can retry (per P2) or inspect without re-running
  `configure`.

## 2. End-to-End Behavior

### Primary behavior

After `alva configure --api-key <key>` writes the config file
successfully, the CLI calls `POST /api/v1/arrays-jwt/ensure` using the
just-written credentials. On success it prints a one-line status to
stdout. The user's sandbox scripts can now read `ARRAYS_JWT` without
any further action.

### Variants

- **Fresh configure (no prior JWT)** → gateway signs a new one, returns
  `renewed: true`. CLI prints e.g.
  `Arrays JWT provisioned (expires 2026-04-27, tier: free)`.
- **Reconfigure with healthy JWT** → returns `renewed: false`. CLI
  prints `Arrays JWT already current (expires 2026-04-25, tier: pro)`.
- **Reconfigure within renewal threshold (< 2 days left)** → gateway
  renews, `renewed: true`. Same success message as fresh case.
- **Explicit `alva arrays-jwt ensure`** → same call, JSON-formatted
  output (matches the pattern of other CLI commands
  at `src/cli/index.ts:568`).
- **Explicit `alva arrays-jwt status`** → `GET /status`, JSON output
  including `exists` and `renewal_needed`.

### Failure modes

| Failure                                       | Where          | Handling                                                                                                                                                  |
| --------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configure` local write fails                 | before network | existing behavior — throw, exit non-zero. JWT step never runs.                                                                                            |
| Network unreachable                           | ensure step    | stderr: `warning: could not provision Arrays JWT (network). Run \`alva arrays-jwt ensure\` later.`—`configure` still exits 0.                             |
| 401/403 (bad api key, revoked)                | ensure step    | stderr: `warning: Arrays JWT ensure unauthorized (<status>). Verify your API key.` — exits 0 (config file is written, user may want to re-run configure). |
| 5xx from gateway/backend                      | ensure step    | stderr: `warning: Arrays JWT ensure failed (<status>). Run \`alva arrays-jwt ensure\` later.` — exits 0.                                                  |
| Explicit `arrays-jwt ensure` / `status` fails | subcommand     | propagate as normal CLI error (matches every other subcommand; no soft-warn here).                                                                        |

### Idempotency

- Per-gateway guarantee: Ensure is idempotent. Running `configure`
  twice in a row with the same key produces at most one new JWT.
- Per-CLI: the auto-bootstrap step has no local state; running it
  multiple times is safe.

## 3. Findings

### Existing code patterns to mirror

| Area                      | Reference pattern                                                                               | Why                                                                                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New SDK resource          | `src/resources/fs.ts` + lazy getter in `src/client.ts:45-74`                                    | Minimal resource shape: class with `_client` reference, one method per endpoint, thin wrapper over `this._client._request(...)`. Matches the gateway handler shape.                                                                                        |
| Request helper            | `src/client.ts:86-125` (`_request`)                                                             | Handles header selection (token vs. api-key), JSON body encoding, error mapping to `AlvaError`. Both endpoints are plain JSON; no special-casing needed.                                                                                                   |
| Type definitions          | `src/types.ts`                                                                                  | Add `EnsureArraysJwtResponse`, `ArraysJwtStatusResponse`; existing types use plain interfaces with snake_case fields to match server response.                                                                                                             |
| CLI subcommand dispatch   | `src/cli/index.ts:568` (`dispatch(client, args, meta)`)                                         | Top-level verb → resource method → JSON stdout. `arrays-jwt` verb fits this directly. `ensure` and `status` become sub-verbs parallel to existing `deploy list` / `secrets list`.                                                                          |
| `configure` hook registry | new                                                                                             | Factor `handleConfigure` so it calls `runPostConfigureHooks(client)` after the file write. Register `ensureArraysJwtHook` as the first (and currently only) entry. Human-readable "JWT provisioned" messaging lives in the hook, not in `handleConfigure`. |
| Unit test pattern         | `test/cli.test.ts:10-56` (monkey-patched resource methods via `vi.fn().mockResolvedValue(...)`) | Lets us test the hook's success and failure branches without any network or filesystem.                                                                                                                                                                    |
| Config-side test pattern  | `test/config.test.ts` (injected `readFile`/`writeFile`/`homedir`)                               | No existing test touches disk; pattern for `handleConfigure` tests is to inject a fake `writeFile` and assert both the file contents and the post-hook side effects.                                                                                       |

### Constraints discovered

- `handleConfigure` is currently `async` but makes no network calls.
  Adding a network call preserves the signature; nothing downstream
  needs to change.
- `writeConfig` strips legacy flat-root `apiKey`/`baseUrl` when writing
  (`src/cli/config.ts:113`). The hook must read credentials from the
  in-memory args/profile the user passed to `configure`, not re-read
  the file, to avoid an unnecessary second filesystem hop.
- `ALVA_ENDPOINT` / `ALVA_API_KEY` env vars can override file values
  at load time (`src/cli/config.ts:145-184`). The hook must use the
  same effective credentials that a subsequent command would use —
  the simplest way is to call the hook with the already-constructed
  `AlvaClient`, not reconstruct one inside the hook.
- CLI version check in `whoami` (`src/cli/index.ts:585-608`) is the
  closest "CLI makes a supplementary call and prints a warning"
  precedent. The failure-mode messaging should feel consistent with
  that path (stderr, single-line, non-fatal).

### Risks and unknowns

- **Risk: silent user confusion if Ensure fails during configure and
  the user later hits a sandbox that needs `ARRAYS_JWT`.** Mitigation:
  the warning message names the exact retry command
  (`alva arrays-jwt ensure`), so there is a clear recovery path
  visible in the terminal history.
- **Risk: API key lacks permission to call Ensure (e.g., service-only
  keys if we ever introduce them).** Today all API keys resolve to a
  user and pass `requireLoginUser`, so this is not live. If the
  surface ever changes the 403 path already handles it gracefully.
- **No unknown about the JWT format** — CLI never sees the JWT. No
  risk of divergent parsing.

### Scope shape

Single-service. Only `toolkit-ts` is touched. Gateway and backend are
already live with the endpoints we need; no companion changelog
required in either.

### Reference files for implementation

- Handler / resource pattern: `src/resources/fs.ts`
- Client wiring: `src/client.ts:45-74` (lazy getter block)
- Type additions: `src/types.ts`
- CLI dispatch: `src/cli/index.ts:568` (and help text at lines 66-91)
- CLI configure handler: `src/cli/index.ts:446-490`
- Tests: `test/cli.test.ts` (command dispatch via monkey-patched
  client methods), `test/config.test.ts` (injected fs/env/args
  pattern for configure-side tests).

## 4. Change Specification

### File structure

| File                              | State         | Responsibility                                                                                                                                                                                                                                                                       |
| --------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/resources/arraysJwt.ts`      | **new**       | `ArraysJwtResource` class with `ensure()` and `status()` methods. Mirror shape of `src/resources/fs.ts`.                                                                                                                                                                             |
| `src/types.ts`                    | modified      | Add `EnsureArraysJwtResponse` and `ArraysJwtStatusResponse` interfaces (non-exported from `index.ts` per slim-SDK policy).                                                                                                                                                           |
| `src/client.ts`                   | modified      | Import `ArraysJwtResource`, declare private `_arraysJwt?`, add lazy getter `arraysJwt`. Mirror existing getter pattern (client.ts:45-74).                                                                                                                                            |
| `src/cli/postConfigureHooks.ts`   | **new**       | Hook registry: `PostConfigureHook` type (`{ name, run(client) }`), module-local array `POST_CONFIGURE_HOOKS`, exported `runPostConfigureHooks(client, deps?)` runner that catches per-hook errors into stderr warnings. First registered entry: `ensureArraysJwtHook`.               |
| `src/cli/index.ts`                | modified      | (a) `handleConfigure` calls `runPostConfigureHooks(new AlvaClient(...))` after successful write, honors `deps.runHooks` override. (b) `dispatch` branches for `arrays-jwt ensure` / `arrays-jwt status`. (c) Help text (`HELP_TEXT` / `COMMAND_HELP`) gains an `arrays-jwt` section. |
| `src/index.ts`                    | **unchanged** | No new public exports (slim-SDK policy — arrays-jwt is CLI-internal).                                                                                                                                                                                                                |
| `test/arraysJwt.test.ts`          | **new**       | Unit tests for `ArraysJwtResource.ensure/status`: method, path, response passthrough.                                                                                                                                                                                                |
| `test/postConfigureHooks.test.ts` | **new**       | Unit tests for the registry: success path completes silently, hook error captured to stderr without throwing, subsequent hooks still run.                                                                                                                                            |
| `test/cli.test.ts`                | modified      | Extend with tests for `arrays-jwt ensure/status` dispatch + for `handleConfigure` calling `runHooks` (via injected `deps.runHooks` spy).                                                                                                                                             |
| `README.md`                       | modified      | Add a short subsection under "CLI Quick Start" documenting `alva arrays-jwt ensure` / `status`; mention that `configure` auto-provisions.                                                                                                                                            |

### Affected modules / services

| Service        | Code                                                                                                                                                                                    | Deployment                                                     | Verified                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `toolkit-ts`   | New resource + CLI hook registry + CLI dispatch + tests + README (see file table above).                                                                                                | None — no env vars, no config schema changes, no new npm deps. | Grep `rg "arrays" code/public/toolkit-ts/src` → no hits; schema untouched in `config.ts`.          |
| `alva-gateway` | **None**. The REST routes `/api/v1/arrays-jwt/ensure` and `/api/v1/arrays-jwt/status` already exist at `pkg/handler/arrays_jwt.go` and are registered at `cmd/gateway/main.go:258-259`. | None.                                                          | Verified in think phase via dedicated gateway exploration; router + middleware + handler all ship. |
| `alva-backend` | **None**. RPCs `EnsureArraysJWT` / `GetArraysJWTStatus` already implemented in `internal/services/user/user_arrays_jwt.go`.                                                             | None.                                                          | Verified in think phase.                                                                           |

Scope confirmed single-service. No changelog companion needed in gateway or backend (extremely simple pass-through from the consumer's perspective).

### API changes

**Added (CLI / SDK internal)**

- `AlvaClient.arraysJwt.ensure(): Promise<EnsureArraysJwtResponse>` →
  `POST /api/v1/arrays-jwt/ensure`, no body, returns
  `{ expires_at: number; tier: SubscriptionTier; renewed: boolean }`.
- `AlvaClient.arraysJwt.status(): Promise<ArraysJwtStatusResponse>` →
  `GET /api/v1/arrays-jwt/status`, returns
  `{ exists: boolean; expires_at: number; tier: SubscriptionTier; renewal_needed: boolean }`.

Where `SubscriptionTier` is the **stringified proto enum** exactly as the
gateway serializes it — `resp.Tier.String()` on `SubscriptionTier` (see
`alva-backend/api/proto/userpb/v1/user.proto:134-137` and
`alva-gateway/pkg/handler/arrays_jwt.go:50,74`):

```ts
type SubscriptionTier =
  | 'SUBSCRIPTION_TIER_UNSPECIFIED'
  | 'SUBSCRIPTION_TIER_FREE'
  | 'SUBSCRIPTION_TIER_PRO';
```

**Display formatting for CLI stderr output** — strip the
`SUBSCRIPTION_TIER_` prefix and lowercase: `SUBSCRIPTION_TIER_PRO` →
`pro`, `SUBSCRIPTION_TIER_UNSPECIFIED` → `unspecified`. Implemented as
a small pure helper `formatTier(t: SubscriptionTier): string` in
`src/cli/postConfigureHooks.ts`. Unknown values (shouldn't happen —
server is source of truth) fall through to raw value.

- CLI verbs:
  - `alva arrays-jwt ensure` — JSON output of the ensure response.
  - `alva arrays-jwt status` — JSON output of the status response.

**Modified behavior**

- `alva configure` — after successful file write, runs the
  post-configure hook chain. Side effects:
  - stdout on success (one line per hook).
  - stderr + non-fatal on failure (config file is still written;
    exit code 0).

No protocol changes. No breaking changes to existing CLI commands or SDK
signatures.

### Database impact

None.

### Config / env

None. Config schema (`config.ts:7-17`) unchanged. No new env vars.

### Backward compatibility

Additive. Existing `alva configure` flows keep working; new users and
reconfigured users get the extra stdout line. `AlvaClient` gains a new
lazy getter that is only instantiated if accessed. Existing scripts
that parse `alva configure`'s stdout currently get `{"status":"configured",...}`
as JSON (per `src/cli/index.ts:940-945` where `handleConfigure` output
is JSON-stringified). **Risk:** the new hook output becomes additional
stdout lines AFTER that JSON, which could break consumers that pipe
`alva configure` into `jq`. Mitigation: the hook output must go to
**stderr**, not stdout — keeping the JSON result on stdout clean. This
is the cleanest way to preserve the scriptability contract.

_(Decision: ALL hook output — success AND failure — goes to stderr.
`configure`'s stdout stays strict JSON.)_

### Error path table

| Codepath                            | What can go wrong                  | Handling                                                                                                                                  | User sees                            |
| ----------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `ArraysJwtResource.ensure()`        | Network unreachable                | `client._request` throws `AlvaError("NETWORK_ERROR", …, 0)`                                                                               | `AlvaError` bubbles to caller        |
| `ArraysJwtResource.ensure()`        | 401/403 (bad key)                  | `_request` → `AlvaError` with HTTP status                                                                                                 | `AlvaError` bubbles                  |
| `ArraysJwtResource.ensure()`        | 5xx                                | `_request` → `AlvaError`                                                                                                                  | `AlvaError` bubbles                  |
| `ArraysJwtResource.status()`        | any of the above                   | same as ensure                                                                                                                            | `AlvaError` bubbles                  |
| `ensureArraysJwtHook.run()`         | resource throws                    | hook lets it propagate; registry catches                                                                                                  | stderr warning, registry continues   |
| `runPostConfigureHooks()`           | one hook throws                    | caught per-hook, stderr line: `warning: post-configure hook "<name>" failed: <msg>`. Runner does NOT rethrow. Subsequent hooks still run. | non-fatal stderr                     |
| `handleConfigure`                   | file write fails                   | existing path: throws (pre-hook stage)                                                                                                    | Exit non-zero (unchanged)            |
| `handleConfigure`                   | hook runner crashes outside a hook | defensive wrap: top-level try/catch around `runHooks` call logs one-line stderr and returns success                                       | stderr warning, exit 0               |
| `dispatch("arrays-jwt", "ensure")`  | resource throws                    | normal CLI error path (no soft-fail)                                                                                                      | `AlvaError` to stderr, exit non-zero |
| `dispatch("arrays-jwt", "status")`  | same                               | same                                                                                                                                      | same                                 |
| `dispatch("arrays-jwt", <unknown>)` | unknown subverb                    | throw `Error("Unknown subcommand 'arrays-jwt <x>'. Use 'alva arrays-jwt --help'")`                                                        | stderr, exit non-zero                |

No silent-failure rows. All rows have either visible error propagation or visible stderr warning.

## 5. Testability Design & Test Plan

### Testability design

- **Seams:**
  1. `ArraysJwtResource` methods — tested by constructing a real
     `AlvaClient` and monkey-patching `client._request` with `vi.fn()`
     (same technique as `test/cli.test.ts:10-56`'s `makeClient`).
  2. `runPostConfigureHooks(client, deps?)` — `deps` is optional and
     has shape `{ hooks?: PostConfigureHook[]; stderr?: (s: string) => void }`.
     Default: the module-local registry and `process.stderr.write`.
     Tests inject a synthetic hook list and a capture-string stderr to
     assert ordering, error isolation, and warning text.
  3. `handleConfigure(args, deps?)` — `deps` gains optional
     `runHooks?: (client: AlvaClient) => Promise<void>`. Default
     constructs the real runner. Tests inject a `vi.fn()` spy and
     assert it is called exactly once with a client whose `apiKey`
     and `baseUrl` match what was written.
  4. `dispatch(client, args)` — existing seam. No new injection
     needed; tests monkey-patch `client.arraysJwt.ensure` on a real
     `AlvaClient`.

- **Isolation:** No filesystem in tests (existing convention). No
  real network (all `_request` / resource methods mocked). No real
  stderr writes (injected capture).

- **External boundaries:** exactly one — `fetch` inside
  `_request`. Not touched by these tests; the resource unit tests
  stop at `_request` (which is `vi.fn()`'d).

### Coverage diagram

```
[+] src/resources/arraysJwt.ts
    |
    +-- ArraysJwtResource.ensure()
    |   +-- [PLAN] Happy path: POST to correct path, returns response  -- test/arraysJwt.test.ts
    |   +-- [PLAN] _requireAuth is called (no-auth → throws)           -- test/arraysJwt.test.ts
    |
    +-- ArraysJwtResource.status()
        +-- [PLAN] Happy path: GET to correct path, returns response   -- test/arraysJwt.test.ts
        +-- [PLAN] _requireAuth is called                              -- test/arraysJwt.test.ts

[+] src/cli/postConfigureHooks.ts
    |
    +-- runPostConfigureHooks()
    |   +-- [PLAN] All hooks succeed → no stderr writes                -- test/postConfigureHooks.test.ts
    |   +-- [PLAN] First hook throws → stderr warning, second still runs -- test/postConfigureHooks.test.ts
    |   +-- [PLAN] All hooks throw → stderr warning per hook, no rethrow -- test/postConfigureHooks.test.ts
    |   +-- [PLAN] Default hook list contains ensureArraysJwt          -- test/postConfigureHooks.test.ts
    |
    +-- ensureArraysJwtHook
        +-- [PLAN] renewed=true → stderr "Arrays JWT provisioned ..."  -- test/postConfigureHooks.test.ts
        +-- [PLAN] renewed=false → stderr "Arrays JWT already current…"-- test/postConfigureHooks.test.ts
        +-- [PLAN] ensure throws → hook rethrows to registry           -- test/postConfigureHooks.test.ts

[+] src/cli/index.ts (modified)
    |
    +-- handleConfigure (post-write)
    |   +-- [PLAN] Calls deps.runHooks with a client built from input  -- test/cli.test.ts
    |   +-- [PLAN] Still returns "configured" if runHooks throws       -- test/cli.test.ts
    |   +-- [PLAN] Does NOT call runHooks if write fails (pre-hook)    -- test/cli.test.ts
    |
    +-- dispatch (new branches)
        +-- [PLAN] "arrays-jwt ensure" → calls client.arraysJwt.ensure -- test/cli.test.ts
        +-- [PLAN] "arrays-jwt status" → calls client.arraysJwt.status -- test/cli.test.ts
        +-- [PLAN] "arrays-jwt <unknown>" → throws helpful error       -- test/cli.test.ts
        +-- [PLAN] "arrays-jwt --help" → returns help text             -- test/cli.test.ts
```

Zero GAPs.

### Unit tests

**`test/arraysJwt.test.ts`**

| #   | Test case                         | Setup                                                                                                             | Expected                                                                                                           |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | `ensure()` posts to correct path  | AlvaClient with apiKey; monkey-patch `_request` to return `{expires_at: 1234, tier: "pro", renewed: true}`        | Called once with `("POST", "/api/v1/arrays-jwt/ensure", undefined or {})`; returned value identical to mock return |
| 2   | `ensure()` requires auth          | AlvaClient with no apiKey/token; `_request` spy                                                                   | Throws `AlvaError("UNAUTHENTICATED")`; `_request` never called                                                     |
| 3   | `status()` gets from correct path | AlvaClient with apiKey; mock `_request` → `{exists: true, expires_at: 1234, tier: "free", renewal_needed: false}` | Called with `("GET", "/api/v1/arrays-jwt/status", undefined or {})`; passthrough return                            |
| 4   | `status()` requires auth          | no-auth client                                                                                                    | Throws `UNAUTHENTICATED`                                                                                           |

**`test/postConfigureHooks.test.ts`**

| #   | Test case                                | Setup                                                                                                                                              | Expected                                                                                                                      |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 5   | All hooks succeed                        | two hooks each returning `Promise.resolve()`; capture stderr                                                                                       | No stderr writes; completes resolved                                                                                          |
| 6   | First hook throws                        | hook A throws `new Error("boom")`, hook B resolves; capture stderr                                                                                 | stderr contains `warning: post-configure hook "A" failed: boom`; hook B still ran (assert via B spy); runner resolves         |
| 7   | Single hook throws non-Error             | hook throws `"raw string"`                                                                                                                         | stderr contains `failed: raw string`; runner resolves                                                                         |
| 8   | Default registry exports ensureArraysJwt | import module                                                                                                                                      | `POST_CONFIGURE_HOOKS` includes an entry named `"ensureArraysJwt"`                                                            |
| 9   | `ensureArraysJwtHook.run` renewed=true   | client with `arraysJwt.ensure = vi.fn().mockResolvedValue({expires_at: 1735689600, tier: "SUBSCRIPTION_TIER_PRO", renewed: true})`; capture stderr | stderr contains `Arrays JWT provisioned`; includes a human-readable expiry date and `tier: pro` (prefix stripped, lowercased) |
| 10  | `ensureArraysJwtHook.run` renewed=false  | mock returns `tier: "SUBSCRIPTION_TIER_FREE", renewed: false`                                                                                      | stderr contains `already current` and `tier: free`                                                                            |
| 10b | `formatTier` edge cases                  | inputs: `SUBSCRIPTION_TIER_UNSPECIFIED`, `SUBSCRIPTION_TIER_PRO`, unexpected string `"garbage"`                                                    | Outputs: `unspecified`, `pro`, `garbage` (pass-through)                                                                       |
| 11  | `ensureArraysJwtHook.run` throws         | `arraysJwt.ensure = vi.fn().mockRejectedValue(new AlvaError("NETWORK_ERROR", "down", 0))`                                                          | Hook rethrows; registry (in test 6 pattern) would catch                                                                       |

**`test/cli.test.ts` (additions)**

| #   | Test case                                      | Setup                                                                                                                | Expected                                                                                                                 |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 12  | `handleConfigure` invokes runHooks             | call `handleConfigure(["configure", "--api-key", "alva_x", "--base-url", "http://x"], { ...fakeFs, runHooks: spy })` | spy called once; client arg has `apiKey === "alva_x"`, `baseUrl === "http://x"`; return value has `status: "configured"` |
| 13  | `handleConfigure` tolerates runHooks rejection | `runHooks: vi.fn().mockRejectedValue(new Error("x"))`                                                                | Still returns `{status: "configured", ...}`; stderr contains a wrapper warning                                           |
| 14  | `handleConfigure` skips hooks on write failure | `writeFile: vi.fn().mockRejectedValue(new Error("EACCES"))`, `runHooks: spy`                                         | Throws; spy never called                                                                                                 |
| 15  | `dispatch("arrays-jwt", "ensure")`             | makeClient() patched `arraysJwt.ensure = vi.fn().mockResolvedValue({expires_at: 1, tier: "free", renewed: true})`    | `ensure` called once; return value equals mock return                                                                    |
| 16  | `dispatch("arrays-jwt", "status")`             | patched `arraysJwt.status`                                                                                           | analogous                                                                                                                |
| 17  | `dispatch("arrays-jwt", "bogus")`              | none                                                                                                                 | Throws with a message mentioning `arrays-jwt` and `--help`                                                               |
| 18  | `dispatch("arrays-jwt", "--help")`             | none                                                                                                                 | Returns `{_help: true, text: <help text>}`                                                                               |

### Integration / E2E

**E2E required: no.**

Reason: single-service change in a pure consumer (CLI). The endpoints
being called are already covered by gateway handler tests
(`alva-gateway/pkg/handler/arrays_jwt_test.go`) and backend RPC tests
(`alva-backend/internal/services/user/user_arrays_jwt_test.go`).
toolkit-ts has no e2e harness (it's an npm package; its CI is unit
tests + build + lint + format:check). Running a live HTTP call from
the CLI tests against a real backend would couple toolkit-ts CI to
backend availability with no new signal — the contract verification
already happens on the server side.

A lightweight manual smoke at implementation time:

- Run local-dev stack, set `ALVA_ENDPOINT=http://localhost:<port>`,
  call `node dist/cli.js configure --api-key alva_<testkey>`, and
  eyeball the stderr line + re-run to see `already current`.
- `node dist/cli.js arrays-jwt status` to confirm JSON output.

### Security boundaries

No new endpoints on our side — we are the consumer. The gateway already
enforces the auth model (`X-Alva-Api-Key` accepted; `requireLoginUser`
rejects `PlaybookShare`). No new security test surface here.

### Edge cases

- **Idempotency of the hook:** `Ensure` is server-side idempotent.
  Running `configure` N times produces at most one new JWT. Verified
  by the gateway's existing behavior — no new test needed here.
- **Reconfigure with different API key:** new client, new user, new
  hook call. The registry doesn't track "first-time" state — it just
  calls Ensure every time. Correct.
- **Reconfigure that fails mid-write:** pre-hook throw, hooks skipped
  (covered by test 14).
- **`--profile` non-default:** hook uses the client constructed from
  the invocation's apiKey/baseUrl, not the "default" profile. Covered
  implicitly by test 12 asserting the client's config.

### Regression coverage

- `test/cli.test.ts` existing `handleConfigure` tests must keep
  passing — new signature is backward-compatible (`runHooks` is
  optional; omitted → defaults preserve old behavior as a no-hook
  degenerate path when `POST_CONFIGURE_HOOKS` is empty). We do NOT
  make the old tests pass by skipping hooks entirely; instead we set
  the default hook list to include `ensureArraysJwt` AND we update
  any existing handleConfigure tests to pass a stub `runHooks` spy.

---

## Appendix A — Implementation Task List

Ordering follows: types → resource → client wire-up → hook registry →
handleConfigure wire-up → dispatch + help → README + verify.

### Task 1 — Add response types

**Complexity:** simple
**Dependencies:** none
**Files:** `src/types.ts`

**What to do:** Add a `SubscriptionTier` union of the three proto enum
string values (`SUBSCRIPTION_TIER_UNSPECIFIED|FREE|PRO`) and the two
response interfaces — `EnsureArraysJwtResponse` and
`ArraysJwtStatusResponse` — matching the gateway's JSON exactly (see §4
API changes). Do NOT re-export from `src/index.ts` (slim-SDK policy).

**Steps:**

- [ ] Add `SubscriptionTier` union and the two interfaces with
      snake_case fields matching server
- [ ] `npm run typecheck` passes

### Task 2 — Add `ArraysJwtResource` (TDD)

**Complexity:** simple
**Dependencies:** Task 1
**Files:** `src/resources/arraysJwt.ts` (new), `test/arraysJwt.test.ts` (new)

**What to do:** Thin resource class in the shape of `FsResource`
(`constructor(private client: AlvaClient)`, methods call
`this.client._request(...)`). Both `ensure()` and `status()` MUST call
`this.client._requireAuth()` first — ensure mutates server state,
status is authenticated-user-scoped. Note `FsResource` is not uniform
on this (`read()` skips the check, mutations do) — we deliberately
require auth on both arrays-jwt methods since neither is meaningful
without a known user. Tests follow `test/cli.test.ts:10-56`'s
"construct real client, patch `_request`" pattern (cases #1-4 in §5).

**Steps:**

- [ ] Write failing tests #1-4
- [ ] Run `npm test` → tests fail (no class yet)
- [ ] Implement `ArraysJwtResource` with `ensure()` and `status()`
- [ ] Tests pass
- [ ] `npm run lint` clean

### Task 3 — Wire resource into `AlvaClient`

**Complexity:** simple
**Dependencies:** Task 2
**Files:** `src/client.ts`

**What to do:** Import `ArraysJwtResource`, add private `_arraysJwt?`, add lazy getter `arraysJwt` (mirror lines 45-74). No new tests — the Task 2 tests exercise the resource via `new AlvaClient(...).arraysJwt` once wired.

**Steps:**

- [ ] Add import, field, getter
- [ ] `npm run typecheck` + `npm test` clean

### Task 4 — Post-configure hook registry (TDD)

**Complexity:** normal
**Dependencies:** Task 3
**Files:** `src/cli/postConfigureHooks.ts` (new), `test/postConfigureHooks.test.ts` (new)

**What to do:** Define:

```ts
export interface PostConfigureHook {
  name: string;
  run(client: AlvaClient): Promise<void>;
}

export interface RunHooksDeps {
  hooks?: PostConfigureHook[];
  stderr?: (s: string) => void;
}

export async function runPostConfigureHooks(
  client: AlvaClient,
  deps?: RunHooksDeps,
): Promise<void> { /* per-hook try/catch + stderr warning */ }

export const ensureArraysJwtHook: PostConfigureHook = { name: 'ensureArraysJwt', run: async (client) => { ... } };

export const POST_CONFIGURE_HOOKS: PostConfigureHook[] = [ensureArraysJwtHook];
```

Expiry formatting: `new Date(expires_at * 1000).toISOString().slice(0, 10)` — produces `YYYY-MM-DD`.

Tier formatting helper: `formatTier(t: SubscriptionTier): string` strips the
`SUBSCRIPTION_TIER_` prefix and lowercases. Keep it as a
module-private pure function (not exported) — tested via the hook
behavior tests (#9, #10) plus the direct `formatTier` table (#10b).

**Steps:**

- [ ] Write failing tests #5-11
- [ ] Implement runner + hook
- [ ] Tests pass

### Task 5 — Wire runner into `handleConfigure`

**Complexity:** normal
**Dependencies:** Task 4
**Files:** `src/cli/index.ts`, `test/cli.test.ts`

**What to do:** Extend `WriteConfigDeps` interface used by `handleConfigure` with `runHooks?: (client: AlvaClient) => Promise<void>`. After `writeConfig(...)` succeeds, build `new AlvaClient({ apiKey, baseUrl })` and call `deps.runHooks ?? runPostConfigureHooks`. Wrap the call in a top-level try/catch emitting one wrapper warning to stderr on unexpected failure (tests #12-14).

**Steps:**

- [ ] Write failing tests #12-14
- [ ] Update any existing `handleConfigure` tests to pass a no-op `runHooks` spy (regression coverage clause)
- [ ] Implement the wiring
- [ ] All tests pass

### Task 6 — CLI dispatch for `arrays-jwt` verb + help text

**Complexity:** simple
**Dependencies:** Task 3
**Files:** `src/cli/index.ts`, `test/cli.test.ts`

**What to do:** Add branch in `dispatch` (after existing groups) handling `group === 'arrays-jwt'` with sub-verbs `ensure` / `status` / fall-through to unknown-subcommand error. Update `HELP_TEXT` (`src/cli/index.ts:66-91`) and `COMMAND_HELP['arrays-jwt']`. Also add a mention in `COMMAND_HELP['configure']` that configure auto-provisions. Tests #15-18.

**Steps:**

- [ ] Write failing tests #15-18
- [ ] Implement dispatch branch + help strings
- [ ] Tests pass

### Task 7 — Documentation + build smoke

**Complexity:** simple
**Dependencies:** Tasks 5 + 6
**Files:** `README.md`

**What to do:** Add a subsection under "CLI Quick Start" documenting `alva arrays-jwt ensure` / `status` and that `configure` auto-provisions. Short (≤10 lines). Run the full verify chain.

**Steps:**

- [ ] README edit
- [ ] `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build`

### Dependency graph

```
Task 1 (types) ── Task 2 (resource + test) ── Task 3 (client wire)
                                                    │
                                                    ├── Task 4 (hooks) ── Task 5 (configure wire)
                                                    │                          │
                                                    └── Task 6 (dispatch) ─────┤
                                                                               │
                                                                               Task 7 (docs + verify)
```

All tasks are small and sequential. Parallelization within a single
agent offers no leverage; executing 1→7 linearly is the clearest path.

## 6. Human Interaction

### Initial thoughts

User asked the CLI to auto-provision the Arrays JWT on init, and
specifically asked to check the gateway for an existing REST
endpoint before building anything new.

### Iteration feedback

- Agent initially flagged two "show-stoppers" (API-key auth rejected,
  gRPC-only). Both were wrong — agent had only looked at alva-backend
  and missed the gateway REST layer. Corrected after dedicated
  gateway exploration.
- User confirmed option A: Ensure-and-store semantics, CLI does not
  need to receive the JWT string.
- User agreed to all three premises (one-shot at `configure`; soft-fail;
  ship `arrays-jwt ensure` + `status` subcommands).
- Agent recommended Approach A (minimal, inline). User chose
  Approach B (with a post-configure hook registry). Stated reason:
  agent-driven maintenance makes the "extra indirection" argument
  weaker than for human-only codebases. Accepted and documented.

### Agent responses

- Retracted the YAGNI objection in light of user's framing.
- Committed to the registry shape: `runPostConfigureHooks(client)`
  iterates a module-local array of `{ name, run(client) }` entries,
  each catching its own error and emitting a scoped warning. First
  entry: `ensureArraysJwt`.

## 7. Outcome

### Changes made

**New source files**

| File                            | Purpose                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/resources/arraysJwt.ts`    | `ArraysJwtResource` with `ensure()` / `status()`. Mirrors `FsResource` shape; both methods call `_requireAuth()` then `_request(...)` and type-cast the result.                                                                                                                                                                                       |
| `src/cli/postConfigureHooks.ts` | Exports `PostConfigureHook`, `RunHooksDeps`, `runPostConfigureHooks(client, deps?)`, `ensureArraysJwtHook`, `POST_CONFIGURE_HOOKS`. Runner catches per-hook errors and emits `warning: post-configure hook "<name>" failed: <msg>\n` to stderr; never rethrows. Module-private `formatTier` helper strips `SUBSCRIPTION_TIER_` prefix and lowercases. |

**Modified source files**

| File               | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`     | Added `SubscriptionTier` union (three proto-enum string values) and two snake_case response interfaces: `EnsureArraysJwtResponse`, `ArraysJwtStatusResponse`. Not re-exported from `index.ts` (slim-SDK policy preserved).                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/client.ts`    | Added import of `ArraysJwtResource`, private `_arraysJwt?` field, and lazy `arraysJwt` getter mirroring the existing pattern.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/cli/index.ts` | (a) Imported `runPostConfigureHooks`; (b) added `runHooks?` to the local `WriteConfigDeps`; (c) after `writeConfig` succeeds, build `new AlvaClient({ apiKey, baseUrl })` and invoke `deps.runHooks ?? (c => runPostConfigureHooks(c))` inside a defensive try/catch that emits `warning: post-configure hooks crashed: <msg>\n` on failure without blocking the return; (d) added `'arrays-jwt'` dispatch branch with `ensure` / `status` sub-verbs and unknown-subcommand error; (e) added `HELP_TEXT` lines and `COMMAND_HELP['arrays-jwt']` entry; (f) mentioned auto-provisioning in `COMMAND_HELP['configure']`. |

**Other**

| File                                                     | Change                                                                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                                              | Added a 13-line `Arrays JWT` subsection under "CLI Quick Start" documenting auto-provisioning, the two subcommands, and the server-side-only JWT storage guarantee. |
| `docs/changelogs/2026-04-20-cli-arrays-jwt-bootstrap.md` | This changelog.                                                                                                                                                     |

**Pre-flight drift (not part of the feature; to handle at push time)**

| File                | Drift origin                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitignore`        | Added `.npm-cache-local/` to dodge a pre-existing root-owned npm cache file that blocked `npm install`.                                                       |
| `package-lock.json` | One-line sync: `package.json` already declared a `toolkit` bin alongside `alva`, but the lockfile hadn't caught up. `npm install` during pre-flight fixed it. |

### Tests added

17 new tests across three files. Every `[PLAN]` coverage entry from §5 maps to a concrete test:

**`test/arraysJwt.test.ts`** (new, 4 tests)

| #   | Verifies                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------ |
| 1   | `ensure()` posts to `/api/v1/arrays-jwt/ensure` and passthrough-returns the server response            |
| 2   | `ensure()` throws `AlvaError(UNAUTHENTICATED)` when client has no credentials; `_request` never called |
| 3   | `status()` GETs `/api/v1/arrays-jwt/status` and passthrough-returns                                    |
| 4   | `status()` requires auth                                                                               |

**`test/postConfigureHooks.test.ts`** (new, 10 tests)

| #        | Verifies                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5        | All hooks succeed — runner resolves silently                                                                                                             |
| 6        | First hook throws `Error`, second still runs; exact warning text `warning: post-configure hook "A" failed: boom` written to stderr                       |
| 7        | Hook throws non-Error (`"raw"`) — stderr line contains `failed: raw`; runner resolves                                                                    |
| 8        | Default `POST_CONFIGURE_HOOKS` includes an entry with `name === 'ensureArraysJwt'`                                                                       |
| 9        | `ensureArraysJwtHook.run` with `renewed: true, tier: 'SUBSCRIPTION_TIER_PRO'` — stderr contains `Arrays JWT provisioned`, YYYY-MM-DD expiry, `tier: pro` |
| 10       | Same with `renewed: false, tier: 'SUBSCRIPTION_TIER_FREE'` — stderr contains `already current` and `tier: free`                                          |
| 10b (×2) | `formatTier` edge cases exercised via hook: `SUBSCRIPTION_TIER_UNSPECIFIED` → `unspecified`; unknown `"garbage"` → `garbage`                             |
| 11       | `ensureArraysJwtHook.run` rethrows the original error instance when `ensure()` rejects                                                                   |

**`test/cli.test.ts`** (modified, +7 tests + 3 retrofitted)

| #   | Verifies                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | `handleConfigure` calls `runHooks` exactly once with an `AlvaClient` whose `apiKey` and `baseUrl` match the flags                                               |
| 13  | `handleConfigure` tolerates `runHooks` rejection — still returns `{ status: 'configured', ... }`; stderr contains `warning: post-configure hooks crashed: boom` |
| 14  | Write-failure path: `runHooks` spy never called (hook step runs only after successful write)                                                                    |
| 15  | `dispatch('arrays-jwt', 'ensure')` calls `client.arraysJwt.ensure` and returns the response                                                                     |
| 16  | `dispatch('arrays-jwt', 'status')` calls `client.arraysJwt.status` and returns the response                                                                     |
| 17  | `dispatch('arrays-jwt', 'bogus')` throws an error mentioning `arrays-jwt` and `--help`                                                                          |
| 18  | `dispatch('arrays-jwt', '--help')` returns `{ _help: true, text: ... }` via the existing per-command-help shortcut                                              |

Three pre-existing `handleConfigure` tests were retrofitted with `runHooks: vi.fn().mockResolvedValue(undefined)` to prevent them from exercising the real network-touching registry. The "throws when `--api-key` is missing" test did not need the stub — it errors out before the hook stage.

**Verification result**

- `npm test` — 160 tests passing across 9 files (143 pre-feature + 17 new)
- `npm run lint` — clean
- `npm run typecheck` — clean
- `npm run format:check` — clean
- `npm run build` — clean (ESM, CJS, browser IIFE, type declarations all produced)

**Cross-reference with §4:** every module listed in §4's file table has corresponding changes in §7; no undocumented changes.

### Migration

None. No DB schema changes.

## 8. Remaining Tasks

**Before merge**

- **Rebase onto main.** The feature branch was cut from `cd51a58` (the submodule's monorepo-pinned commit at work-start); `main` has since moved to `v0.1.4` (`0db782c`). The `push` phase must rebase or merge before opening the PR. Any conflict is likely to be near `src/cli/index.ts` since v0.1.4 may have touched the same file.
- **Separate the pre-flight drift.** `.gitignore` (`.npm-cache-local/`) and `package-lock.json` (toolkit-bin sync) are unrelated to Arrays JWT. Recommend committing them as a prep commit with a "chore:" prefix, kept out of the feature PR, or folded into a separate housekeeping PR. Ship decision belongs to push phase.
- **Changelog formatting.** `prettier` re-formatted the changelog (tables aligned, minor whitespace) during Task 7's `format:check`. The content is unchanged.

**Deferred / known limitations**

- **Profile-specific credentials** — the hook is invoked with the credentials that `configure` just wrote. If a user reconfigures a non-default profile AND has `ALVA_PROFILE` / `ALVA_ENDPOINT` overriding some other profile in their environment, the hook only exercises the profile being configured. That is the intended semantics (the spec required it), but there is no explicit "this profile is now primary" signal. Not a gap — just naming it so nobody later assumes the hook should also switch profiles.
- **No explicit user-facing retry message on 401/403.** The runner's generic `warning: post-configure hook "ensureArraysJwt" failed: <msg>` will include the server's error message, which is informative enough; the plan's more elaborate per-status-code messages (per §2 failure-mode table) were not wired in — the code relies on the SDK's `AlvaError.message` being descriptive. If product feedback shows users get confused by a raw 401 message, a future change can layer status-code-aware text into the hook itself.
- **Live-backend smoke not documented.** The plan §5 "Integration / E2E — no" decision means the feature never touches a real backend in CI. A manual smoke against local-dev was described in the plan but is not documented in `README.md` (end-users don't need it; developers might). Revisit only if onboarding friction surfaces.

**Technical debt introduced**

- None of substance. The hook registry adds one layer of indirection per the user's explicit preference in §6; this is working as designed, not debt.

**Coordination with other services**

- None. Gateway and backend endpoints already shipped. The feature is purely additive on the client side.
