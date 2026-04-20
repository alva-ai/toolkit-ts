# feat: add `skills` subcommand for Arrays data-skills discovery

## 1. Background

The Alva runtime exposes 250+ financial data APIs via `require("@arrays/...")`
in scripts. These APIs are documented by a separate backend ("Arrays") at
`$ARRAYS_ENDPOINT` (default `https://data-tools.prd.space.id`), which publishes
three public discovery endpoints:

- `GET /api/v1/skills` — list all data skills (name + description)
- `GET /api/v1/skills/:name` — summary with endpoints table for one skill
- `GET /api/v1/skills/:name?endpoint=<path>` — full parameter/response/example
  doc for one endpoint

These are distinct from the existing `alva sdk` commands, which hit the main
Alva API (`api-llm.prd.alva.ai`) for legacy SDK module documentation. The
Arrays endpoints are the authoritative source going forward and users must
consult them before writing code that calls data endpoints (per the
"data skill doc lookup is mandatory" rule in the runtime instructions).

Today the toolkit has no way to reach these endpoints; users are forced back
to `curl`, which directly violates the project's "use the CLI, don't fall
back to curl" guidance. This change adds a `skills` subcommand that mirrors
the shape of the existing `sdk` commands.

**Relevant systems:**

- `code/public/toolkit-ts/src/client.ts` — `AlvaClient`, `_request()`
- `code/public/toolkit-ts/src/cli/index.ts` — `dispatch()`, `HELP_TEXT`,
  `COMMAND_HELP`
- `code/public/toolkit-ts/src/cli/config.ts` — `loadConfig()` (base URL
  resolution precedence)
- `code/public/toolkit-ts/src/resources/sdkDocs.ts` — closest existing
  resource pattern (simple GET-driven discovery)
- `code/public/toolkit-ts/src/types.ts` — `AlvaClientConfig`

**Constraints:**

- Single-service change, toolkit-ts only; no backend changes.
- The three endpoints are public — client must NOT attach
  `X-Alva-Api-Key` when calling them (sending an Alva API key to a
  third-party host would be a leak).
- Must resolve `arraysBaseUrl` via the same precedence chain the
  existing `baseUrl` uses: `--arrays-endpoint` flag > `ARRAYS_ENDPOINT`
  env > default.
- Existing `sdk` subcommand stays untouched (different backend, different
  auth model).

**Premises validated with user:**

- P1: New `SkillsResource` rather than folding into `SdkDocsResource`.
- P2: Arrays base URL is a client-level concern, not per-resource.
- P3: No auth plumbing in this PR; JWT-ensure and authed data calls are
  out of scope.
- P4: CLI surface is three flat subcommands mirroring `sdk`.

## 2. End-to-End Behavior

### Primary behavior

A user runs `alva skills list` and receives the JSON array of all
available data skills (name + description) from the Arrays backend. They
then run `alva skills summary --name <skill>` to see the endpoints table,
and `alva skills endpoint --name <skill> --path <endpoint-path>` to get
the full parameter/response/example doc for a specific endpoint — all
without needing to be authenticated with Alva.

### Variants / edge cases

- `--arrays-endpoint https://...` flag overrides both env and default,
  matching how `--base-url` overrides `ALVA_ENDPOINT`.
- `ARRAYS_ENDPOINT` env var overrides the default when the flag is
  absent.
- Special characters in `:name` or `?endpoint=<path>` (e.g. slashes in
  `company/list`) are URL-encoded consistently with the existing
  `partitionSummary` helper.
- The Arrays endpoints are public, so `_requireAuth()` is NOT called.
  If the user has no Alva credentials configured, `alva skills ...`
  still works. (Contrast with `alva sdk ...`, which requires auth.)
- 4xx/5xx responses from Arrays flow through the existing `_request`
  error handling and surface as `AlvaError` with the upstream status.

### Failure modes

- Arrays backend unreachable → `AlvaError("NETWORK_ERROR", ..., 0)`.
  Same handling as any other backend outage.
- Arrays backend returns an error envelope with a shape that differs
  from Alva's `{error: {code, message}}` — the existing `_request`
  fallback (`HTTP <status>: <body slice>`) catches this.
- Missing `--name` / `--path` flags → `CliUsageError` with the
  `skills` command help text.

## 3. Findings

### Chosen approach

**Approach A (agreed with user):** Extend `_request` with two optional
options — `baseUrl` (absolute override) and `noAuth` (skip Alva auth
header). Add a new `SkillsResource` that invokes `_request` with those
options set. Add a `skills` case to the CLI dispatcher and an
`--arrays-endpoint` / `ARRAYS_ENDPOINT` resolution path in `loadConfig`
(parallel to the existing `--base-url` / `ALVA_BASE_URL` chain). Add
`arraysBaseUrl` to `AlvaClientConfig` and `AlvaClient`.

### Rejected alternatives

- **Approach B — separate `_arraysRequest` helper.** Would duplicate
  ~30 lines of error-envelope and content-type handling (or force a
  shared private helper with only two callers). Rejected: the
  duplication cost outweighs the separation-of-concerns benefit when
  there's only one additional backend.

### Key decisions

- **Single `_request` with option branches**, not a separate
  `_arraysRequest`. The existing method already branches on `rawBody`
  and content-type; adding `baseUrl`/`noAuth` options is symmetric with
  that pattern and avoids duplicating ~30 lines of error handling.
- **`noAuth: true` explicitly omits the Alva header.** Do not rely on
  "no key configured" — a user with a valid Alva key should still send
  zero Alva headers to the Arrays host.
- **URL encoding via `encodeURIComponent(name)`**, matching the
  existing `partitionSummary` pattern. The `?endpoint=<path>` value
  goes through `URLSearchParams` (already in `_request`), which
  encodes correctly.
- **Reserve the name `skills`** (not `data-skills` or `arrays`) to
  match the endpoint path `/api/v1/skills` and user's explicit choice.

### Risks / unknowns

- **`_request` signature churn** — adding two optional fields to
  `RequestOptions` is non-breaking for existing callers, but the new
  branches must be covered by tests that specifically verify: (a) when
  `baseUrl` is set, the request goes there; (b) when `noAuth` is set,
  no Alva headers are sent; (c) when both are set, error handling still
  works end-to-end.
- **CLI flag stripping.** The existing `main()` strips `--api-key`,
  `--base-url`, `--profile` from `cleanArgs` before dispatch. We must
  add `--arrays-endpoint` to that strip list or the `skills` subcommand
  will see it as a subcommand flag.
- **Help text.** The `HELP_TEXT` commands list and a new
  `COMMAND_HELP.skills` entry must be added. The `cli-help-audit`
  changelog from 2026-04-15 established the convention — follow it
  exactly.

### Scope shape

Single-service, toolkit-ts only. No gateway, backend, frontend, or
infra changes. Plan phase will enumerate affected files for this one
service.

### Reference files for implementation

- Resource pattern: `src/resources/sdkDocs.ts` — three GET methods,
  URL-encoded path params, returns typed JSON. Mirror this almost
  line-for-line, differing only in `_request` options.
- Client pattern: `src/client.ts` — `baseUrl` field, resolution in
  constructor. Add `arraysBaseUrl` symmetrically.
- CLI pattern: `src/cli/index.ts` — `case 'sdk':` block (lines
  ~1000-1020) and `COMMAND_HELP.sdk` entry (line ~385). Mirror both.
- Config pattern: `src/cli/config.ts` — existing `baseUrl` resolution
  chain. Add `arraysBaseUrl` as a parallel field with the same
  precedence.
- Test pattern: `test/resources/` — existing resource tests mock
  `client._request`. `test/cli.test.ts` for dispatch-level tests.
  `test/config.test.ts` for the new env/flag resolution.

## 4. Change Specification

### Affected modules

Single service: `toolkit-ts`. No other services enumerated — the
Arrays backend is pre-existing and unchanged; no gateway, backend,
local-dev, or proto consumers touched. Verified by: the change adds
only a new HTTP client surface pointed at an external host plus CLI
glue; grep for `toolkit-ts` in the monorepo shows it is consumed only
by docs/examples, not by runtime services.

| File | Change |
|---|---|
| `src/types.ts` | add `arraysBaseUrl?: string` field to `AlvaClientConfig` |
| `src/client.ts` | add `arraysBaseUrl` field + `DEFAULT_ARRAYS_BASE_URL`; add `baseUrl?` and `noAuth?` to `RequestOptions`; branch in `_request` to use override URL and skip Alva auth header; wire `skills` getter |
| `src/resources/skills.ts` | NEW — `SkillsResource` class with 3 methods |
| `src/cli/config.ts` | add `arraysBaseUrl` to `ResolvedConfig`; resolve via `--arrays-endpoint` flag > `ARRAYS_ENDPOINT` env > default |
| `src/cli/index.ts` | add `COMMAND_HELP.skills`; add `skills` entry to `HELP_TEXT`; add `case 'skills'` to `dispatch`; extract global-flag stripping into a `stripGlobalFlags(argv)` helper (so it is unit-testable) and add `--arrays-endpoint` to its strip list; pass `arraysBaseUrl` to `AlvaClient` constructor |

**Deployment:** none. Library ships via `npm publish` on version bump;
no infra artifacts.

### API changes

No server-side API changes. Client-side SDK adds:

- `AlvaClient.arraysBaseUrl: string` (public readonly)
- `AlvaClient.skills: SkillsResource` (lazy getter)
- `SkillsResource.list(): Promise<SkillsListResponse>`
- `SkillsResource.summary({ name: string }): Promise<SkillSummary>`
- `SkillsResource.endpoint({ name: string, path: string }): Promise<SkillEndpoint>`

Response types are loose (`unknown` passed through as-is) for v1 —
the Arrays backend's schema is source-of-truth and wrapping it in
strict TS types adds maintenance burden for no immediate value. Types
can tighten later without breaking callers.

CLI surface:

- `alva skills list`
- `alva skills summary --name <skill-name>`
- `alva skills endpoint --name <skill-name> --path <endpoint-path>`
- Global: `--arrays-endpoint <url>`, env `ARRAYS_ENDPOINT`

### Database impact

None.

### Config changes

New env var: `ARRAYS_ENDPOINT` (optional, default
`https://data-tools.prd.space.id`). New CLI flag `--arrays-endpoint`.
No config-file field in `~/.config/alva/config.json` (per user's Q2
choice: env + flag only). No existing config file reads/writes
change.

### Backward compatibility

Non-breaking.

- `RequestOptions.baseUrl` and `RequestOptions.noAuth` are optional;
  existing callers unchanged.
- `AlvaClientConfig.arraysBaseUrl` is optional; existing
  `new AlvaClient({apiKey})` still works.
- New CLI subcommand `skills`; no collision with existing commands.
- New global flag `--arrays-endpoint`; stripped in `main` same way as
  `--api-key` / `--base-url` / `--profile`.

### Error path analysis

```
CODEPATH                                  | WHAT CAN GO WRONG          | HANDLING                                 | USER SEES
------------------------------------------|----------------------------|------------------------------------------|------------------
_request (noAuth=true, baseUrl=arrays)    | Arrays host unreachable    | existing try/catch → AlvaError NETWORK_ERROR | JSON error envelope
                                          | 4xx from Arrays            | existing error-envelope branch           | AlvaError with upstream status
                                          | 5xx from Arrays            | existing error-envelope branch           | AlvaError with upstream status
                                          | Non-JSON error body        | existing fallback "HTTP N: <slice>"      | AlvaError UNKNOWN
SkillsResource.summary({name})            | name contains special char | encodeURIComponent in path               | correct URL
SkillsResource.endpoint({name, path})     | path contains ? or &       | URLSearchParams handles encoding         | correct URL
                                          | missing --name flag in CLI | CliUsageError via requireFlag            | help text + exit 1
                                          | missing --path flag in CLI | CliUsageError via requireFlag            | help text + exit 1
cli/main strip --arrays-endpoint          | flag with =value form      | branch handles both `--x v` and `--x=v`  | flag consumed, not forwarded
cli/config                                | env and flag both set      | flag wins (precedence)                   | flag value used
```

No critical gaps — every error row has explicit handling.

## 5. Testability Design

### Module boundaries

- `SkillsResource` depends only on `AlvaClient._request`, which is
  already stubbed in the existing resource tests — same seam reused.
- `AlvaClient._request` branching on the two new options is tested
  at the client level with a `fetch` mock, matching the existing
  `client.test.ts` pattern.
- `cli/config.ts` resolution is a pure function over `{argv, env}` —
  already table-tested.
- `cli/index.ts` dispatch is a pure function over `(client, args)` —
  stub `client.skills.*`, assert correct call.

### Coverage diagram

```
[+] src/client.ts
    +-- _request with {baseUrl}                   -- client.test.ts
    +-- _request with {noAuth: true}              -- client.test.ts
    +-- _request with both options                -- client.test.ts
    +-- arraysBaseUrl default + override          -- client.test.ts
    +-- skills getter (lazy, memoized)            -- client.test.ts

[+] src/resources/skills.ts
    +-- list() calls GET /api/v1/skills           -- skills.test.ts
    +-- summary() calls GET /skills/:name         -- skills.test.ts
    +-- summary() URL-encodes name                -- skills.test.ts
    +-- endpoint() passes ?endpoint= query        -- skills.test.ts
    +-- all three use arrays base + noAuth        -- skills.test.ts
    +-- no _requireAuth called                    -- skills.test.ts

[+] src/cli/config.ts
    +-- arraysBaseUrl from --arrays-endpoint      -- config.test.ts
    +-- arraysBaseUrl from ARRAYS_ENDPOINT env    -- config.test.ts
    +-- flag beats env                            -- config.test.ts
    +-- default when neither set                  -- config.test.ts

[+] src/cli/index.ts
    +-- dispatch skills list                      -- cli.test.ts
    +-- dispatch skills summary                   -- cli.test.ts
    +-- dispatch skills endpoint                  -- cli.test.ts
    +-- skills missing subcommand → error         -- cli.test.ts
    +-- skills unknown subcommand → error         -- cli.test.ts
    +-- skills summary missing --name → error     -- cli.test.ts
    +-- skills endpoint missing --path → error    -- cli.test.ts
    +-- alva skills --help                        -- cli.test.ts
    +-- HELP_TEXT lists skills                    -- cli.test.ts
    +-- main strips --arrays-endpoint <v>         -- cli.test.ts (via integration-style test if present, else config-level)
    +-- main strips --arrays-endpoint=<v>         -- cli.test.ts
```

Zero gaps.

### Unit test cases

**`test/resources/skills.test.ts`** (new)

| Test | Mock `_request` setup | Expected |
|---|---|---|
| `list()` sends correct request | capture args | called with `('GET', '/api/v1/skills', { baseUrl: <arrays>, noAuth: true })` |
| `summary()` encodes name | name = `foo/bar` | path is `/api/v1/skills/foo%2Fbar` |
| `endpoint()` sends endpoint query | name=`x`, path=`company/list` | query includes `endpoint: 'company/list'` |
| all three pass `noAuth: true` | any | options include `noAuth: true` |
| all three pass arrays baseUrl | client constructed with `arraysBaseUrl: 'https://custom'` | options include `baseUrl: 'https://custom'` |
| no `_requireAuth` | spy on `_requireAuth` | not called for any of the three |

**`test/client.test.ts`** (extend)

| Test | Setup | Expected |
|---|---|---|
| `_request` with `baseUrl` override | fetch mock | URL starts with override, not `this.baseUrl` |
| `_request` with `noAuth: true` | apiKey set, fetch mock | no `X-Alva-Api-Key` header sent |
| `_request` with `noAuth: true` and viewer_token | viewer_token set, fetch mock | no `x-Playbook-Viewer` header sent |
| `_request` without `noAuth` (default) | apiKey set | header sent as today (regression guard) |
| `arraysBaseUrl` defaults to `https://data-tools.prd.space.id` | no config | field matches |
| `arraysBaseUrl` uses config value | config `{arraysBaseUrl: 'https://x'}` | field matches |
| `skills` getter memoizes | two accesses | same instance |

**`test/config.test.ts`** (extend)

| Test | argv / env | Expected `arraysBaseUrl` |
|---|---|---|
| default | `[]` / `{}` | `https://data-tools.prd.space.id` |
| from env | `[]` / `{ARRAYS_ENDPOINT: 'https://e'}` | `https://e` |
| from flag | `['--arrays-endpoint', 'https://f']` / `{}` | `https://f` |
| flag beats env | `['--arrays-endpoint', 'https://f']` / `{ARRAYS_ENDPOINT: 'https://e'}` | `https://f` |
| `--arrays-endpoint=x` form | `['--arrays-endpoint=https://g']` / `{}` | `https://g` |

**`test/cli.test.ts`** (extend)

| Test | args | Expected |
|---|---|---|
| `skills` no sub | `['skills']` | CliUsageError |
| `skills list` | `['skills', 'list']` | `client.skills.list()` called |
| `skills summary --name x` | `['skills', 'summary', '--name', 'x']` | `client.skills.summary({name:'x'})` |
| `skills summary` missing name | `['skills', 'summary']` | CliUsageError |
| `skills endpoint --name x --path p` | args | `client.skills.endpoint({name:'x', path:'p'})` |
| `skills endpoint --name x` missing path | | CliUsageError |
| `skills endpoint --path p` missing name | | CliUsageError |
| `skills bogus` | `['skills', 'bogus']` | CliUsageError |
| `skills --help` | `['skills', '--help']` | returns `_help` with skills help text |
| top-level `--help` lists skills | `['--help']` | `HELP_TEXT` contains `skills` line |
| `stripGlobalFlags` removes `--arrays-endpoint <v>` | argv = `['--arrays-endpoint', 'https://x', 'skills', 'list']` | returns `['skills','list']` |
| `stripGlobalFlags` removes `--arrays-endpoint=<v>` | argv = `['--arrays-endpoint=https://x', 'skills', 'list']` | returns `['skills','list']` |
| `stripGlobalFlags` preserves other args | argv = `['--api-key','k','skills','summary','--name','x']` | returns `['skills','summary','--name','x']` |

### Security boundary tests

Not applicable — the three endpoints are public (P3). Positive assertion:
tests verify that Alva headers are NOT sent to the Arrays host (see
client.test.ts rows above). This is the security surface.

### E2E Required: no

Client-side only, external backend is pre-existing and public. Unit
tests with mocked `fetch` and mocked `_request` are sufficient. No
cross-service flow, no gateway changes.

## 6. Human Interaction

_Captured during review._

## 7. Outcome

Shipped as 6 commits on `feat/skills-subcommand`, rebased onto
`origin/main` after an upstream PR (`73ab5cb`) added Arrays-JWT
auto-provisioning. Rebase was conflict-free; our scope (discovery-only
`skills` subcommand) and the upstream scope (JWT ensure during
`configure`) composed without overlap.

### Changes made

**SDK / client**

- `src/types.ts` — added optional `arraysBaseUrl` to `AlvaClientConfig`.
- `src/client.ts` — exported `DEFAULT_ARRAYS_BASE_URL`; added readonly
  `arraysBaseUrl` field on `AlvaClient`; extended `RequestOptions` with
  `baseUrl?` and `noAuth?`; branched `_request` to honor both; added
  lazy `skills` getter.
- `src/resources/skills.ts` (new) — `SkillsResource` with `list()`,
  `summary({name})`, `endpoint({name, path})`. All use
  `{ baseUrl: client.arraysBaseUrl, noAuth: true }` so no Alva
  credentials reach the Arrays host.

**CLI**

- `src/cli/config.ts` — imports `DEFAULT_ARRAYS_BASE_URL` from the
  client module; resolves `arraysBaseUrl` via `--arrays-endpoint` >
  `ARRAYS_ENDPOINT` > default; adds `arraysBaseUrl: string` to
  `CliConfig` (always populated).
- `src/cli/index.ts` — added `COMMAND_HELP.skills`; added `skills` row
  to `HELP_TEXT` Commands list and `--arrays-endpoint <url>` to
  Global options; added `case 'skills':` in `dispatch` routing
  `list` / `summary` / `endpoint` to `client.skills.*`; extracted the
  inline global-flag stripping loop into an exported
  `stripGlobalFlags(argv)` helper that now also strips
  `--arrays-endpoint`; passes `config.arraysBaseUrl` into `AlvaClient`.

**Release**

- `package.json` — bumped `0.2.1` → `0.3.0` (new public surface,
  non-breaking).

### Tests added

32 new tests across 4 files; total suite 234 → 255 after rebase (the
upstream JWT PR contributed 21 of those).

- `test/client.test.ts` (+7): override-baseUrl honored; `noAuth: true`
  skips both `X-Alva-Api-Key` and `x-Playbook-Viewer`; default still
  sends the Alva key (regression guard); both options together;
  `arraysBaseUrl` default; `arraysBaseUrl` custom.
- `test/resources/skills.test.ts` (+6): `list` / `summary` / `endpoint`
  hit the right paths with `noAuth + arrays baseUrl`; `summary` and
  `endpoint` URL-encode name; `endpoint` passes `endpoint=<path>` as
  query; none of the three trigger `_requireAuth`.
- `test/config.test.ts` (+5): default; env-only; flag-only;
  flag-beats-env; `--arrays-endpoint=value` form.
- `test/cli.test.ts` (+14): all six dispatch paths (list / summary /
  endpoint / missing-sub / unknown-sub / missing-flag variants);
  `skills --help` returns help; top-level `--help` lists skills;
  `stripGlobalFlags` handles `--arrays-endpoint <v>` and `=<v>` forms,
  preserves non-global args, is idempotent.

Coverage-diagram check against plan §5: every `[PLAN]` entry has a
passing test. Zero gaps.

### Migration

None. No schema changes.

### Cross-reference (§4 vs §7)

Every file enumerated in §4's Affected modules table has a
corresponding entry above. No undocumented changes. One consolidation
beyond §4: `DEFAULT_ARRAYS_BASE_URL` is now exported from
`src/client.ts` and imported by `src/cli/config.ts` — §4 allowed
either local redeclaration or import, this chose the import path to
keep a single source of truth.

## 8. Remaining Tasks

- **Auto-JWT for custom `--arrays-endpoint`.** Upstream PR `#26` auto-
  provisions `ARRAYS_JWT` during `alva configure` against the
  profile's `--base-url` / Alva API, not against the user's chosen
  Arrays host. Users who point `--arrays-endpoint` at a non-default
  Arrays backend will not auto-get a JWT for that host. Not blocking
  for discovery (endpoints are public), but relevant if we later add
  authed data-endpoint passthrough.
- **Strict response typing.** `SkillsResource` methods return
  `Promise<unknown>`. Tighten once the Arrays backend publishes a
  stable schema.
- **Authed data-endpoint passthrough (Q1(c)).** Explicitly deferred.
  If we later add `alva skills call --name X --path Y`, the
  transport-level `noAuth` flag can be inverted and a separate
  `ARRAYS_JWT` header attached; the plumbing is already symmetric.
- **Docs.** The root `README.md` lists CLI commands; it does not
  mention `skills` yet. Deferred to a follow-up docs-only PR.
