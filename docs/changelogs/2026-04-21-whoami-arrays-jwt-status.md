# feat: surface Arrays JWT status in `alva whoami`

## 1. Background

`alva configure` auto-provisions the Arrays JWT server-side
(`src/cli/postConfigureHooks.ts:30-41`, soft-fails, writes a status line
to stderr). After that, the JWT has a 7-day TTL. The CLI currently
offers `alva arrays-jwt status` / `ensure` as explicit subcommands
(`src/cli/index.ts:1143-1155`), but the user has to know about them. If
the user never runs those subcommands, the first sign of expiry is a
sandbox script failing when it tries `secret.loadPlaintext('ARRAYS_JWT')`.

`alva whoami` is the command users run when they want to confirm their
setup is healthy (`src/cli/index.ts:750-773`). It currently reports only
identity + endpoint metadata. Extending it to also surface Arrays JWT
health turns it into the one-stop "is my setup working" check without
introducing new commands.

**Relevant systems:**

- `toolkit-ts` (`@alva-ai/toolkit`) — CLI + SDK. All changes here.
  - `src/cli/index.ts:750-773` — `whoami` handler, where the enrichment lands.
  - `src/client.ts` — `client.arraysJwt.status()` already implemented.
- `alva-gateway` — `GET /api/v1/arrays-jwt/status`
  (`pkg/handler/arrays_jwt.go:57-77`). No change.

**Constraints:**

- `whoami` output is JSON and is commonly piped to `jq`. Adding a field
  under `_meta` (already an extension slot) is non-breaking; adding
  top-level fields would risk collisions with future `user.me()` fields.
- The status RPC is read-only and cheap (no signing). One extra call per
  `whoami` is acceptable — whoami is a diagnostic, not a hot path.
- Must soft-fail: if status RPC errors (network, auth, backend down),
  whoami must still return identity so users can diagnose the underlying
  problem. No stderr noise on whoami (would break `whoami | jq`).

**Premises validated with user:**

- **P1** — "Silent step" in whoami means *visibility*, not *renewal*.
  Whoami reports status; explicit `ensure` / re-running `configure`
  remain the renewal path.
- **P2** — Status failure is fully soft: `_meta.arrays_jwt` is omitted
  on error, no stderr output. Whoami still succeeds with identity info.
- **P3** — One extra RPC per whoami is acceptable (diagnostic command,
  cheap endpoint).
- **P4** — No changes to `configure`, `arrays-jwt ensure`,
  `arrays-jwt status`. README gets a one-line note.

## 2. End-to-End Behavior

**Primary behavior:** `alva whoami` output grows one field:

```json
{
  "id": 1947657645301244000,
  "subscription_tier": "pro",
  "username": "ming2",
  "toolkit_min_version": "0.1.0",
  "_meta": {
    "profile": "default",
    "endpoint": "https://api-llm.stg.alva.ai",
    "arrays_jwt": {
      "exists": true,
      "expires_at": 1777344297,
      "renewal_needed": false,
      "tier": "SUBSCRIPTION_TIER_PRO"
    }
  }
}
```

**Variants / edge cases:**

- Status RPC succeeds → `_meta.arrays_jwt` populated with the four
  fields above (straight passthrough of the response body).
- Status RPC fails (network, 5xx, auth) → `_meta.arrays_jwt` omitted.
  Whoami returns identity + `_meta.profile/endpoint` as today. No
  stderr.
- `user.me()` fails → whoami errors as today. Status is not attempted.
  (Order: me first, then status. If identity is broken, JWT health is
  moot.)
- `--help` and `_warning` (toolkit_min_version) paths unchanged.

## 3. Findings

**Chosen approach:** Approach A from think phase — inline enrichment in
the `whoami` handler. Call `client.arraysJwt.status()` inside a
try/catch after `user.me()`; on success fold the response into
`_meta.arrays_jwt`; on failure omit the field.

**Rejected alternatives:**

- **whoamiEnrichers registry** — abstraction for one enricher is
  premature. Revisit when a second enricher appears.
- **`alva status` umbrella command** — forces users to learn a new
  command; contradicts the user's explicit preference to have `whoami`
  cover it.
- **Silent renewal (call `ensure` from whoami)** — conflicts with P1 of
  the prior changelog
  ([2026-04-20-cli-arrays-jwt-bootstrap.md](2026-04-20-cli-arrays-jwt-bootstrap.md))
  which rejected per-command ensure. Status-only respects that
  boundary.

**Existing patterns to mirror:**

- Handler pattern: extend the existing `whoami` block at
  [src/cli/index.ts:750-773](../../src/cli/index.ts#L750-L773). Keep
  the try/catch local — do NOT route through
  `postConfigureHooks.ts` (that path writes to stderr; whoami must
  not).
- Test pattern: unit tests live in `test/cli/` — mirror the structure
  of whichever existing whoami test file exists. The reviewer/planner
  will identify the exact file.
- SDK client method: `client.arraysJwt.status()` is already wired
  (used by `arrays-jwt status` subcommand at
  [src/cli/index.ts:1143-1155](../../src/cli/index.ts#L1143-L1155)).

**Risks / unknowns:**

- Downstream tooling that parses `whoami` JSON may not expect new
  `_meta` keys. Mitigation: `_meta` is a namespaced extension slot;
  existing callers already see `profile` and `endpoint` there and
  should be using object-key access, not strict shape validation.
- If the gateway adds fields to the status response, they flow through
  automatically. Acceptable — matches how `user.me()` fields already
  pass through.

**Scope shape:** Single-service — `toolkit-ts` only. No gateway,
backend, proto, or deployment changes.

**Reference files for implementation:**

- Handler to edit: [src/cli/index.ts:750-773](../../src/cli/index.ts#L750-L773)
- SDK method in use: `client.arraysJwt.status()` (see
  [src/cli/index.ts:1148](../../src/cli/index.ts#L1148) for invocation
  shape)
- Soft-fail pattern reference (read for idea, don't call through):
  [src/cli/postConfigureHooks.ts:45-59](../../src/cli/postConfigureHooks.ts#L45-L59)
- Help text to update: COMMAND_HELP['whoami'] at
  [src/cli/index.ts:111](../../src/cli/index.ts#L111)
- README note: [README.md](../../README.md) — add one line mentioning
  `_meta.arrays_jwt` in the whoami-adjacent area

## 4. Change Specification

### Affected modules and services

**toolkit-ts (@alva-ai/toolkit)**
- Code:
  - `src/cli/index.ts` — whoami handler (lines 750-773) gains a
    try/catch around `client.arraysJwt.status()` that folds the result
    into `result._meta.arrays_jwt` on success, omits on failure.
  - `src/cli/index.ts:111` — COMMAND_HELP['whoami'] gets a one-line
    note about the new `_meta.arrays_jwt` field.
  - `test/cli.test.ts` — `makeClient()` adds `arraysJwt.status` mock;
    new test cases under `describe('whoami')`.
  - `README.md` — one-line note in the CLI Quick Start area mentioning
    that `whoami` reports Arrays JWT status.
- Deployment: none. Toolkit ships via npm; no manifests, compose, or
  terraform. Version bump handled at release time per repo convention.
- Verified: `git grep arraysJwt` shows only SDK/CLI usage, no deploy
  artifacts. `git grep whoami` shows no infra dependencies.

**All other services (alva-backend, alva-gateway, alfs, etc.)**
- Code: none.
- Deployment: none.
- Verified: The status RPC (`GET /api/v1/arrays-jwt/status`) already
  exists at `alva-gateway/pkg/handler/arrays_jwt.go:57-77` — this
  change only consumes it from the CLI. No server-side change.

### API changes

- CLI JSON output shape: `alva whoami` gains `_meta.arrays_jwt` field
  (object with `exists`, `expires_at`, `renewal_needed`, `tier`) when
  the status RPC succeeds; field absent when it fails.
- No new CLI subcommands, flags, or env vars.
- No gateway / backend API changes.

### Database impact

None.

### Config

None.

### Backward compatibility

- **CLI output:** Additive under `_meta` (an already-extensible
  namespace). Existing `jq` queries targeting `.id`, `.username`,
  `._meta.profile`, `._meta.endpoint` continue to work unchanged.
- **Failure mode:** When the status RPC fails, `_meta.arrays_jwt` is
  absent rather than `null`. Callers inspecting the field should check
  presence (`_meta.arrays_jwt != null` handles both `undefined` and
  `null`). This is called out in COMMAND_HELP and README.
- **No breaking changes.** No flag removed, no output field removed or
  renamed.

### Error path analysis

| METHOD / CODEPATH | WHAT CAN GO WRONG | HANDLING | USER SEES |
|---|---|---|---|
| whoami handler — `client.user.me()` | Network, auth, 5xx | Exception propagates, CLI prints error | Non-zero exit, stderr error (unchanged behavior) |
| whoami handler — `client.arraysJwt.status()` | Network / 5xx | try/catch swallows; omit `_meta.arrays_jwt` | Whoami succeeds with identity info; no stderr noise |
| whoami handler — `client.arraysJwt.status()` | Auth rejected (401/403) | Same as above — swallow and omit | Same — user should already see this via `me()` having failed; independent failure is rare but harmless |
| whoami handler — malformed status response | Unexpected shape | Passthrough (current SDK returns typed response; malformed = SDK throws → swallowed) | Field omitted |

No critical gaps. The "swallow and omit" pattern is intentional and
matches P2.

## 5. Testability Design & Test Plan

### Testability design

- **Seam:** `client.arraysJwt.status` is already a mocked method on
  `AlvaClient` in `test/cli.test.ts` (via `makeClient()` — we need to
  add the mock). Vitest's `vi.fn().mockResolvedValue(...)` and
  `.mockRejectedValue(...)` give full control over success/failure
  paths.
- **Isolation:** whoami handler is pure — it composes `user.me()` and
  `arraysJwt.status()` responses into a JSON object. No side effects,
  no stderr, no filesystem. Fully unit-testable.
- **Mocking strategy:** Extend `makeClient()` to add
  `client.arraysJwt.status = vi.fn().mockResolvedValue({...})` with a
  realistic default. Per-test overrides for failure cases.

### Coverage diagram

```
[+] src/cli/index.ts (whoami handler, lines 750-773)
    |
    +-- whoami dispatch
        +-- [PLAN] Happy path: identity + _meta.arrays_jwt populated
        |          -- test/cli.test.ts (whoami suite)
        +-- [PLAN] Status RPC throws: identity returned, _meta.arrays_jwt absent
        |          -- test/cli.test.ts (whoami suite)
        +-- [PLAN] user.me throws: whoami errors (regression test — existing behavior)
        |          -- already covered by existing tests; extend if absent
        +-- [PLAN] COMMAND_HELP['whoami'] --help output mentions arrays_jwt field
                   -- test/cli.test.ts (help suite, line 787)
```

No GAPs.

### Test cases (unit)

| Test case | Input | Expected behavior |
|---|---|---|
| whoami happy path with status success | `makeClient()` with `arraysJwt.status` mocked to return `{exists:true, expires_at:1777344297, renewal_needed:false, tier:'SUBSCRIPTION_TIER_PRO'}` | Result has `_meta.arrays_jwt` deep-equal to mock response; `_meta.profile`/`endpoint` unchanged; `username`/`id` unchanged. `client.arraysJwt.status` called once. |
| whoami with status failure | `arraysJwt.status.mockRejectedValue(new Error('network'))` | Result has identity fields + `_meta.profile`/`endpoint`; `_meta.arrays_jwt` is `undefined`. No stderr output. `user.me` still called. |
| whoami help mentions arrays_jwt | `dispatch(client, ['whoami', '--help'])` | Returned help text contains the substring `arrays_jwt` (or similar marker). |
| existing whoami tests unchanged | (regression) | Both existing whoami tests at lines 426-450 must still pass after `makeClient()` gains the new mock. |

### Test cases (integration / e2e)

- **E2E Required: no.** Reason: change is client-side CLI composition
  of two already-tested RPCs. Gateway status RPC has its own tests.
  No new surface to exercise end-to-end.

### Security boundary tests

Not applicable — no new endpoints. The existing status RPC enforces
auth in the gateway; whoami just propagates CLI credentials as today.

### Edge cases

- **Partial mock response:** If gateway adds new fields to
  `StatusResponse`, they flow through automatically (object spread
  into `_meta.arrays_jwt`). Acceptable — matches how `user.me()`
  extra fields already pass through.
- **toolkit_min_version warning path** (lines 762-772): unchanged; the
  new status fold happens before the version check and returns the
  same result object.

## 6. Implementation Task List

### Task 1: Add arraysJwt.status mock to makeClient

**Complexity:** simple
**Dependencies:** none
**Files:** `test/cli.test.ts`

**What to do:** Add one line to `makeClient()` (around line 65,
alongside `client.skills.*` mocks) mocking
`client.arraysJwt.status` to return the canonical happy-path payload.
This enables existing whoami tests to still pass once the production
code calls the method.

**Steps:**
- [ ] Add the mock line with realistic default
  `{exists: true, expires_at: <future-timestamp>, renewal_needed: false, tier: 'SUBSCRIPTION_TIER_PRO'}`
- [ ] Run `npm test` — all existing tests still pass
- [ ] Commit

### Task 2: Extend whoami handler with status enrichment (TDD)

**Complexity:** simple
**Dependencies:** Task 1
**Files:** `src/cli/index.ts`, `test/cli.test.ts`

**What to do:** In the `whoami` handler at `src/cli/index.ts:750-773`,
after `const user = await client.user.me();`, call
`client.arraysJwt.status()` inside a try/catch. On success, add the
response as `_meta.arrays_jwt`. On failure, leave the field off.

**Key snippet (pattern, not literal code):**
```ts
let arraysJwt: Awaited<ReturnType<typeof client.arraysJwt.status>> | undefined;
try {
  arraysJwt = await client.arraysJwt.status();
} catch {
  // soft-fail: omit the field
}
const result: Record<string, unknown> = {
  ...record,
  _meta: {
    profile: meta?.profile ?? 'default',
    endpoint: meta?.baseUrl ?? client.baseUrl,
    ...(arraysJwt ? { arrays_jwt: arraysJwt } : {}),
  },
};
```

**Steps:**
- [ ] Write failing test: whoami with status success populates
  `_meta.arrays_jwt` with mock response
- [ ] Write failing test: whoami with `status.mockRejectedValue(...)`
  returns result with `_meta.arrays_jwt === undefined`
- [ ] Run `npm test` — new tests fail for the right reason
- [ ] Implement the try/catch + spread in the handler
- [ ] Run `npm test` — all tests pass
- [ ] Run `npm run lint` (or equivalent); fix any issues
- [ ] Commit

### Task 3: Update COMMAND_HELP for whoami + README

**Complexity:** simple
**Dependencies:** Task 2
**Files:** `src/cli/index.ts`, `README.md`

**What to do:** Add one line to `COMMAND_HELP['whoami']` at
`src/cli/index.ts:111` noting that the output includes `_meta.arrays_jwt`
when the backend is reachable. Add one line in `README.md` near the
whoami mention pointing out the same field.

**Steps:**
- [ ] Edit COMMAND_HELP['whoami'] string
- [ ] Add a test assertion: the help text for whoami contains
  "arrays_jwt" (extend the existing help test at line 787)
- [ ] Edit README.md — one line in the Arrays JWT section or under
  CLI Quick Start
- [ ] Run `npm test`
- [ ] Run `node dist/cli.js whoami` against stg to sanity-check
  output shape (requires `npm run build` first)
- [ ] Commit

### Dependency graph

```
Task 1 (mock) ── Task 2 (handler + tests) ── Task 3 (help + README)
```

All serial. No parallelization benefit — three small edits to the
same two files. Total estimated effort: ~30 minutes including test
runs.
