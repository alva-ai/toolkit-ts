# feat: rename templates CLI to skills, rename data-skills, add per-file progressive fetch

## 1. Background

The `alva-gateway` REST surface for playbook templates was renamed from
`/api/v1/templates` to `/api/v1/skills` in gateway PR #348
(`refactor(templates): rename gateway routes/types to playbook skills`).
The proxy now lives in `pkg/handler/playbook_skill.go` (`PlaybookSkillHandler`).
The underlying `alva-backend` gRPC service is still `TemplatesService` /
`templatespb`; gateway is a thin proxy and absorbs the term swap.

This has two immediate consequences:

1. **`toolkit-ts`'s `alva templates` CLI is broken.** `TemplatesResource`
   in `src/resources/templates.ts` still hits `/api/v1/templates`,
   which no longer exists. Every call 404s.
2. **The "skills" name is now overloaded.** `toolkit-ts` already has an
   `alva skills` CLI command (`src/resources/skills.ts`) that hits the
   **Arrays backend's** `/api/v1/skills` (data-SDK documentation —
   different host, different semantics). The two collide on the CLI
   namespace even though they live on different services.

The user wants the CLI to align with the new agent-facing surface: the
playbook-skills feature gets `alva skills`, and the existing data-SDK
docs CLI gets renamed `alva data-skills`. The agent-facing skill manual
(`code/public/skills/skills/alva/SKILL.md`) and `toolkit-ts/README.md`
must be updated comprehensively to match.

The user also wants the playbook-skills get flow to be **progressive**:
agents should fetch metadata + file listing first, then pull individual
file contents on demand. The bulk `/files` endpoint that returns every
file's content in one shot exists on the gateway (still serves
frontend / debug consumers), but **must not be reachable from the
agent-facing CLI or SDK** — exposing it gives agents a one-call shortcut
that defeats the progressive-loading discipline.

A new single-file fetch endpoint is added to the gateway so the
progressive flow has a fully-functional path.

### Relevant systems

- `alva-gateway` — REST proxy; needs a new per-file endpoint
- `code/public/toolkit-ts` — TypeScript SDK + `alva` CLI
- `code/public/skills` (the public agent-skill repo) —
  `skills/alva/SKILL.md` + `references/` docs surface the CLI to agents
- `alva-backend` — owns the gRPC and DB schema; **not modified** in this
  changelog

## 2. End-to-End Behavior

**One sentence:** an agent uses `alva skills <subcommand>` to discover
playbook skills (system templates + user-created ones), uses
`alva data-skills <subcommand>` to look up data-SDK docs, and the
get path on playbook skills enforces progressive loading by exposing
only metadata + file listing in `get`, with each file's content fetched
through a separate `alva skills file <user>/<name> <path>` call.

### CLI surface (final)

`alva skills` — playbook skills via `alva-gateway` `/api/v1/skills`
(requires user auth, no role gating — same posture as the legacy
`/api/v1/templates` it replaces):

```
alva skills list [--tag <t>] [--username <u>] [--json]
alva skills tags [--json]
alva skills get <username>/<name> [--json]
alva skills file <username>/<name> <path> [--json]
```

- `list` / `tags` / `get`: default to a pretty-printed human view;
  `--json` returns the raw `{success, data}` envelope.
- `get <user>/<name>`: shows name, description, tags, creator_uid,
  updated_at, and the file listing (path + size_bytes). No file
  content.
- `file <user>/<name> <path>`: returns one file's content. Pretty
  default = the raw file body to stdout (so it can be redirected to
  disk). `--json` returns the wrapped envelope.

`alva data-skills` — data-SDK docs via Arrays backend `/api/v1/skills`
(public, no auth):

```
alva data-skills list [--json]
alva data-skills summary <skill> [--json]
alva data-skills endpoint <skill> <file> [--json]
```

- Replaces the old `alva skills` command verbatim, with positional
  arguments instead of `--name` / `--file` flags.
- Pretty/JSON behavior is preserved from the current `skills`
  subcommand.

### Removed / never-exposed

- `alva templates` — deleted entirely. Hard cut: the underlying
  endpoint has not existed since gateway #348, so anyone still calling
  this command is already broken. No deprecation alias.
- The bulk `files` subcommand is **never added** to the agent-facing
  CLI/SDK surface. The gateway's bulk endpoint keeps working for
  frontend / debug consumers.

### Edge cases / failure modes

- **Get on a non-existent skill**: gateway returns 404; CLI prints a
  human-readable error to stderr and exits non-zero.
- **File on a non-existent path within an existing skill**: new gateway
  endpoint returns 404; CLI prints error.
- **Path contains `..` or absolute segments**: gateway validates via
  the same `validatePath` regex the backend uses; rejects with 400.
- **`<user>/<name>` parsed positional missing the slash**: CLI prints
  usage and exits 2.
- **Path with embedded slashes** (e.g. `references/api/x.md`): handled
  by gin's catch-all `*path` route on gateway. CLI passes path
  verbatim, URL-encoding any unsafe characters.
- **bulk `/files` endpoint** continues to work on the gateway. SDK and
  CLI do not call it.

## 3. Findings

### Existing patterns

- **Gateway proxy convention.** `pkg/handler/playbook_skill.go`
  returns Arrays-compatible envelopes: `{success: true, data: [...]}`
  for both list and single-record endpoints (single records are
  wrapped in a one-element array). Single-record is awkward but
  consistent with the broader gateway convention — **do not change
  the envelope shape**; clean up readability in the CLI layer instead
  (this matches what the existing `alva skills summary` CLI already
  does).
- **gin catch-all for path params.** Gin supports `*name` segments
  (greedy match including `/`). Used elsewhere in the gateway for
  file-style routes. New endpoint will use `GET
/api/v1/skills/:username/:name/files/*path` and `c.Param("path")`
  returns a leading slash that must be trimmed.
- **CLI pretty-format pattern.** `src/cli/skillsFormat.ts` already
  formats data-skills `list`/`summary`/`endpoint` outputs. The new
  pretty formatter for playbook skills mirrors its shape (table for
  list/tags, multi-line block for get).
- **Positional `<user>/<name>` parsing.** Established elsewhere in the
  CLI — see `--template-id` flag handling in `src/cli/index.ts` line
  ~365 (`"username/name"` form already documented). The new commands
  use the same string split convention.
- **Resource class structure.** `src/resources/templates.ts` and
  `src/resources/skills.ts` show the established pattern: one class
  per resource, methods return typed objects after unwrapping the
  envelope's `data?.[0]`.

### Constraints

- The gateway uses `templatespb` proto types internally regardless of
  the new `skill` surface. New `GetFile` handler will reuse
  `GetPlaybookTemplateFiles` gRPC and filter in-handler — backend
  JSONB row is read whole anyway, so no efficiency loss vs adding a
  per-file RPC; YAGNI says skip the new RPC.
- The `alva-backend` `pathRegex` (`templates_grpc.go:44`) constrains
  allowed file paths. Gateway file endpoint must apply at least the
  same validation; otherwise gateway 500s on malformed input. Either
  re-validate in gateway or rely on backend to bounce — pick the
  former so error path is fast.
- `code/public/skills` is a public submodule with its own PR process;
  the SKILL.md change ships in a separate PR/commit from the
  toolkit-ts release that activates the new CLI. Order of release:
  gateway → toolkit-ts → public skills. The user will need to bump
  the toolkit-ts version pinned in the public skills version_check
  flow once toolkit-ts is published.

### Chosen approach and key decisions

- **No backend changes.** `TemplatesService` keeps its name. Term swap
  happens at the gateway/CLI/docs layer only. Blast radius minimized.
- **One new gateway endpoint** (`GET
/api/v1/skills/:username/:name/files/*path`). Bulk `/files`
  retained for frontend / future consumers but invisible to agent
  surface.
- **Hard CLI rename.** `alva templates` deleted (already broken),
  `alva skills` → playbook skills, old `alva skills` → `alva
data-skills`. No deprecation aliases.
- **CLI pretty default**, `--json` for raw envelopes. Matches the
  pattern data-skills already establishes; readability lives in the
  CLI layer, gateway envelope unchanged.
- **Positional `<user>/<name>` arguments** everywhere identifiers
  appear; flags reserved for filters (`--tag`, `--username` on
  `list`).

### Risks and unknowns

- **Public-skills version pin.** `code/public/skills/skills/alva`
  has a `version_check.sh` workflow. If the published skill version
  references the old `alva skills` CLI behavior, an agent on the new
  toolkit-ts pre-update will see breakage. Mitigation: ship public
  skills doc update + toolkit-ts release in tight sequence; user
  bumps the public-skill semver minor to invalidate cached older
  versions. Document in section 7 once released.
- **Downstream consumers of CLI `alva templates`.** Unknown but
  almost certainly zero given the endpoint has been gone since
  #348 merged. Risk accepted.

### Scope shape

Cross-service: 3 submodules. `toolkit-ts` (primary, most LOC) +
`alva-gateway` (1 handler method + 1 route + tests) + public `skills`
repo (doc-only changes). `alva-backend` untouched.

### Patterns to mirror

- **Gateway handler & test**: `pkg/handler/playbook_skill.go` and its
  `_test.go` define the proxy/validation/error-mapping shape used by
  the new per-file endpoint.
- **CLI resource & tests**: `src/resources/skills.ts` and
  `test/resources/skills.test.ts` show how a typed resource class
  with mocked-fetch tests is structured.
- **CLI command wiring**: `src/cli/index.ts` `case 'skills':` switch
  block shows subcommand dispatch + pretty/json branching.
- **CLI pretty formatter**: `src/cli/skillsFormat.ts` is the
  established formatter pattern (list table + multi-line summary).
- **Public-skills doc structure**: the Data Skills section in
  `code/public/skills/skills/alva/SKILL.md` is the established shape
  for CLI command listings in the agent manual. No new playbook-skills
  section needed (`/use-template:<name>` still goes through the
  filesystem, not the CLI).

## 4. Change Specification

> **User opted out of TDD for this change.** Existing test files for the
> renamed resources are deleted along with the resources; no new unit
> tests are added. Section 5 below describes a verification plan
> (build + lint + manual smoke) rather than a TDD coverage matrix.

### Affected modules and services

#### alva-gateway (primary deployment artifact)

- **Code:**
  - `pkg/handler/playbook_skill.go` — add `GetFile(c *gin.Context)`
    method and register `GET /:username/:name/files/*path` inside
    `RegisterRoutes`.
- **Deployment:** none. No new env, no new image, no port change.
- **Verified:** `rg "PlaybookSkillHandler|/api/v1/skills"` confirms the
  handler is wired through existing `skillsHandler.RegisterRoutes`
  call in `cmd/gateway/main.go`.

#### toolkit-ts (primary, most LOC)

- **Code:**
  - `src/resources/templates.ts` — **delete**.
  - `src/resources/skills.ts` — **rename to** `src/resources/dataSkills.ts`;
    rename class `SkillsResource` → `DataSkillsResource`; URL stays
    `/api/v1/skills` (arrays backend, `noAuth: true`); positional API
    on methods: `summary(skill: string)`, `endpoint(skill, file)`.
  - `src/resources/skillTiers.ts` — keep file path; this file owns
    static data-SDK tier metadata, used only by data-skills. No
    rename needed (its `SkillEndpoint*` names are domain-specific).
  - `src/resources/playbookSkills.ts` — **new** class
    `PlaybookSkillsResource` with methods `list({tag?, username?})`,
    `tags()`, `get(usernameSlashName)`, `file(usernameSlashName, path)`.
    Hits gateway `/api/v1/skills` (default gateway base, NOT
    `arraysBaseUrl`). **Requires user auth** — do NOT pass
    `noAuth: true`; the gateway route is inside `middleware.Authorization()`
    (`cmd/gateway/main.go:216`). Matches the deleted `TemplatesResource`
    posture. **No `files()` bulk method.**
  - `src/client.ts` — drop `templates` getter; add `playbookSkills`
    getter; rename `skills` getter → `dataSkills`. Public TypeScript
    SDK consumers of `client.skills` / `client.templates` break;
    acceptable because `client.templates` was already broken (404).
  - `src/cli/index.ts` — at L1242 `case 'skills'`: rewire to
    `PlaybookSkillsResource`, parse positional `args[2]` as
    `"<user>/<name>"` (split on `/`, throw `CliUsageError` if shape
    wrong), `args[3]` as path for `file` subcommand. Add `tags`
    subcommand. Default to pretty output, `--json` returns raw.
  - **New** `case 'data-skills'`: same logic as today's `case 'skills'`
    but positional `args[2]` for `summary` / `endpoint`, `args[3]`
    for `endpoint`'s file.
  - Delete `case 'templates'` block (L1272–1302) entirely.
  - Update `COMMAND_HELP` map (L450 `templates:` entry → delete; L482
    `skills:` entry → rewrite for new playbook-skills surface; add
    `data-skills:` entry).
  - Top-level help table at L53–54: replace
    `skills    Data-skill ... / templates    Playbook templates ...`
    with `skills    Playbook skills ... / data-skills    Data-skill ...`.
  - `src/cli/skillsFormat.ts` — **rename to** `dataSkillsFormat.ts`;
    no logic change. Update import in `src/cli/index.ts`.
  - `src/cli/playbookSkillsFormat.ts` — **new**. Exports
    `formatPlaybookSkillsList(result)`,
    `formatPlaybookSkillsTags(result)`,
    `formatPlaybookSkillGet(result)`,
    `formatPlaybookSkillFile(result)`. Pretty layout:
    - list: table `username/name  description  tags  updated_at`
    - tags: bullet list
    - get: header (`username/name`), description, tags, creator_uid,
      updated_at, then file tree `path  (size_bytes)`
    - file: raw file content to stdout (no header, so output can be
      redirected to disk); `--json` route emits the envelope.
  - `test/resources/templates.test.ts` — **delete**.
  - `test/resources/skills.test.ts` — **delete**.
  - `test/cli.test.ts` — update L1316–1317 command-list table
    (replace `templates` with `skills` and `data-skills`); rewrite the
    "skills dispatch" describe block at L1364 to test the new
    playbook-skills routing; delete the templates dispatch block
    (search for `templates dispatch`). Keep coverage at "dispatch wiring"
    level only — no resource-level tests (per user's no-TDD direction).
  - `test/client.test.ts` — if it references `client.templates` or
    `client.skills` resource construction (grep first), update.
  - `README.md` — rewrite §`Data Skills` (L69-77) heading to
    `Data Skills (data-skills)` with new command names; replace
    `alva skills` mentions on L75–77 and L173 with `alva data-skills`;
    add a new §`Playbook Skills` covering
    `alva skills list/tags/get/file` and explaining the progressive
    loading (`get` returns metadata + file listing only, `file` fetches
    one file's content).
- **Deployment:** package published from this repo's CI. After merge,
  bump version, publish `@alva-ai/toolkit@latest`. No infra/k8s.
- **Verified:** `rg "TemplatesResource|client\.templates"` covers all
  call sites (only the files listed above). `rg "SkillsResource|client\.skills"`
  same. `rg "skillsFormat"` covers formatter rename.

#### code/public/skills (agent-facing skill manual)

- **Code:**
  - `skills/alva/SKILL.md` — replace 7 occurrences of `alva skills` on
    L446, L448, L451, L453, L469, L477, L483 with `alva data-skills`.
    Keep the data-skills section's narrative intact; only the command
    name swaps. **No new playbook-skills section added** (template
    discovery still uses filesystem read per L186–199; CLI is not in
    that path).
  - Bump `metadata.version` in SKILL.md frontmatter from `v1.7.0`
    → `v1.8.0` so `version_check.sh` flags older cached copies. The
    version-check script is the in-skill safety net for stale clients.
- **Deployment:** none — it's a documentation submodule. Public PR.
- **Verified:** `rg "alva skills|alva templates" code/public/skills/skills/alva/`
  shows exactly the 7 lines above; `references/` directory has zero
  hits.

#### alva-backend

- **Code:** none.
- **Deployment:** none.
- **Verified:** Gateway calls existing `GetPlaybookTemplateFiles` gRPC
  with no new fields. `rg "TemplatesService|PlaybookTemplate"` shows
  zero modifications required.

#### Other services

- Verified by `rg "v1/templates|v1/skills" code/` across the monorepo:
  - frontend repos: `rg "v1/skills|v1/templates" code/frontend/` → 0
    hits (frontend uses GraphQL); zero impact.
  - `code/forge/forge/internal/gateway/skill_handler.go` exists but
    serves forge's own POST `/upload`, unrelated to the read path
    being changed.
  - other backend services: no consumers of `templatespb` outside
    alva-backend itself; zero impact.

### API changes

**New REST endpoint (alva-gateway):**

```
GET /api/v1/skills/:username/:name/files/*path
  → 200 { success: true, data: [ { username, name, path, content, updated_at } ] }
  → 400 invalid path (regex / segment validation)
  → 404 skill not found OR path not in skill
  → 5xx gRPC upstream error
```

Path is gin catch-all (`*path`); `c.Param("path")` returns
leading-slash form, trim once before lookup.

**Removed REST endpoint:** none. (`/api/v1/templates/*` was removed in
gateway #348 already.)

**SDK / CLI:** breaking changes documented above. `alva templates` and
`client.templates` removed; `alva skills` semantics change; old
`alva skills` becomes `alva data-skills`.

### Database impact

None.

### Config impact

None.

### Backward compatibility

- `alva templates` and `client.templates`: **hard break**. Already
  broken since gateway #348 (404); removing dead client code.
- `alva skills` CLI semantics flip from data-SDK docs → playbook skills.
  Any user who installs the new toolkit-ts version sees the new
  behavior immediately. SKILL.md version bump (`v1.7.0` → `v1.8.0`)
  triggers `version_check.sh` to surface the update message on next
  agent session.
- `client.skills` SDK property renamed to `client.dataSkills`. Any
  external TypeScript consumer breaks at compile time — that's
  intentional; the new types prevent silent semantic confusion.
- **toolkit-ts semver bump**: `package.json` `0.5.0` → `0.6.0`
  (pre-1.0 minor bump signals breaking change per common practice).
  Done as part of Task 5 before publish.
- Gateway bulk `/files` endpoint and old data-skills endpoints on
  arrays backend: unchanged.

### Error path analysis

| Method/codepath                                    | What can go wrong                                        | Handling                                                                         | User sees                       |
| -------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| `PlaybookSkillHandler.GetFile` — gRPC upstream     | `GetPlaybookTemplateFiles` fails (DB, network)           | `grpcToHTTPError(c, err, "")`                                                    | matched HTTP status, error JSON |
| `PlaybookSkillHandler.GetFile` — skill row missing | gRPC returns NotFound                                    | `grpcToHTTPError` maps to 404                                                    | 404 with gRPC msg               |
| `PlaybookSkillHandler.GetFile` — path validation   | malformed path (regex fail / `..` segment / leading `/`) | return 400 via `c.JSON` before gRPC call                                         | 400 + descriptive msg           |
| `PlaybookSkillHandler.GetFile` — path not in skill | gRPC succeeds but no matching file                       | return 404 via `c.JSON` with `"file path %q not found in skill %q/%q"`           | 404 + descriptive msg           |
| `parsePositionalUserName` (CLI)                    | positional arg missing `/`, empty, or extra slashes      | throw `CliUsageError` with subcommand name                                       | usage hint, exit 2              |
| `client.playbookSkills.file()`                     | fetch network error / non-2xx                            | `_request` already wraps with `AlvaError`; CLI prints message and exits non-zero | stderr error                    |

No critical gaps: every error has a handler and a visible user
outcome.

## 5. Verification Design

User explicitly opted out of TDD. The verification plan is:

### Build + lint gate (both submodules)

- `alva-gateway`: `make lint && make build` must pass.
- `toolkit-ts`: `pnpm install && pnpm run lint && pnpm run build`
  must pass. `pnpm run test` is **not** required to pass for new code
  but must still pass after deletions (i.e., delete the test files
  that reference removed resources so the suite doesn't reference
  ghost imports).

### Manual smoke (after toolkit-ts is linked locally)

Run against local alva-local-dev (or staging gateway). Requires
`alva auth login` first (routes are auth-gated).

```
# Playbook skills — happy paths
alva skills list
alva skills list --json                  # raw envelope sanity
alva skills list --tag research
alva skills list --username alva         # filter path
alva skills tags
alva skills get alva/ai-digest
alva skills file alva/ai-digest README.md
alva skills file alva/ai-digest references/api/example.md  # nested *path
alva skills file alva/ai-digest README.md --json

# Playbook skills — error paths
alva skills get bogus/missing            # → 404
alva skills file alva/ai-digest nope.md  # → 404 path not in skill
alva skills file alva/ai-digest ../etc/passwd  # → 400 invalid path
alva skills get just-one-token           # → CliUsageError, no slash
alva skills file alva/ai-digest README.md  # without auth → 401

# Data skills (renamed)
alva data-skills list
alva data-skills summary <some-skill>
alva data-skills endpoint <some-skill> <some-file>

# Removed
alva templates list                       # → CliUsageError unknown group
```

**Minimum-viable subset that must pass before push:**

- Build + lint green (mandatory, both repos)
- `alva skills list`
- `alva skills get <real-user>/<real-name>`
- `alva skills file <real-user>/<real-name> <nested/path>` (verifies
  gin catch-all)
- `alva skills file <real-user>/<real-name> ../escape` → 400
- `alva data-skills summary <some-skill>` (verifies rename didn't
  regress behavior)

### Doc-render check (skills repo)

- After SKILL.md edits, `rg "alva skills" code/public/skills/skills/alva/SKILL.md`
  should return only references to the new playbook-skills CLI if any
  are intentionally added (we are not adding any, so this should be
  zero lines). `rg "alva data-skills" ... SKILL.md` should match the
  7 lines we replaced.
- `version_check.sh` output: confirm it flags pre-`v1.8.0` versions.

### CLI test scope

- `test/cli.test.ts` already tests dispatch wiring (which subcommand
  goes to which client method). Update to reflect new wiring; new
  positional-parsing logic gets one happy-path + one
  missing-slash failure case in this same file. No resource-level
  tests are added (per user no-TDD).

### Test files deleted (must compile after deletion)

- `test/resources/templates.test.ts` — removed alongside the resource.
- `test/resources/skills.test.ts` — removed (the new
  `DataSkillsResource` is intentionally untested at the resource
  layer; data-skills behavior is identical, only naming changed).

### E2E

**E2E Required: no.** The change is:

- one new public gateway endpoint that is a thin filter over an
  existing gRPC,
- a CLI rename with no behavior change on the underlying data,
- a doc rename.

No new cross-service flow, no auth surface, no schema. Skipping
`make e2e-go`. Manual smoke above is the gate.

### Security boundary

Gateway `/api/v1/skills/*` is inside `middleware.Authorization()`:
any authenticated user (any role) can read; no admin/owner gating on
reads. The CLI must hold a valid token (`alva auth login`) for all
playbook-skills calls. Mutation paths (Create/Update/Delete) are not
exposed at the gateway in this changelog. Path validation is the
last-mile defense — covered in the error path table.

## 6. Human Interaction

- 2026-05-12: User confirmed CLI naming (`alva skills` = playbook,
  `alva data-skills` = old data SDK).
- 2026-05-12: User confirmed `get` does NOT include file content;
  separate per-file fetch (progressive loading).
- 2026-05-12: User chose pretty default + `--json` raw output.
- 2026-05-12: User confirmed SKILL.md + `toolkit-ts/README.md` get a
  comprehensive update.
- 2026-05-12: User: keep bulk `/files` on gateway, just add a new
  per-file endpoint; do not expose bulk in CLI or SDK.
- 2026-05-12: User: positional `<user>/<name>` arguments, no
  `--username` / `--name` flags.
- 2026-05-12: User: CLI does not need a `files` (bulk) subcommand.

## 7. Outcome

### Changes made

#### alva-gateway (`feat/skills-per-file`, commit `9d9f5b0`)

Source (+234 lines):

- `pkg/handler/playbook_skill.go` (+85): added `GetFile(c *gin.Context)`
  method on `PlaybookSkillHandler`. Registers
  `GET /:username/:name/files/*path` inside `RegisterRoutes`. Trims
  leading `/` from gin catch-all, applies the same path-validation
  regex/segment rules as backend `validatePath` (with a code comment
  citing `alva-backend internal/services/templates/templates_grpc.go:96`
  for sync), calls existing `GetPlaybookTemplateFiles` gRPC, filters
  in-handler to the requested path. Returns `{success, data:[{username,
name, path, content, updated_at}]}` on 200; flat
  `{success:false, error}` on 400 (path validation) and 404 (path
  missing from skill); `grpcToHTTPError` for upstream failures.
- `pkg/handler/playbook_skill_test.go` (+149): 6 new subtests under
  `TestPlaybookSkill_GetFile` covering happy path, path validation
  reject, gRPC NotFound, path-not-in-skill, and nested `references/api/*`
  catch-all path.

Docs:

- `docs/changelogs/2026-05-12-playbook-skill-per-file-endpoint.md` (+90):
  gateway-side cross-reference changelog.

#### toolkit-ts (`feat/skills-cli-rename`, 4 commits)

Net +439 lines (1243 insertions / 804 deletions). Sequence:

1. **`8554a30` — `refactor(cli): remove broken templates command and TemplatesResource`**
   - Deleted `src/resources/templates.ts` (101 lines) — endpoint
     `/api/v1/templates` already 404 since gateway PR #348.
   - Deleted `test/resources/templates.test.ts` (199 lines).
   - `src/client.ts`: removed import, `_templates` field, `templates`
     getter.
   - `src/cli/index.ts`: removed `case 'templates'` (~30 lines),
     `COMMAND_HELP.templates` block, top-level help row.
   - `test/cli.test.ts`: removed mock setups, `DISPATCHABLE_SUBCOMMANDS`
     entry, full `templates dispatch` describe block (~119 lines at
     L1552–1670).

2. **`f7973bc` — `refactor(cli): rename skills → data-skills, positional args`**
   - `git mv src/resources/skills.ts → src/resources/dataSkills.ts`
     (class `SkillsResource` → `DataSkillsResource`).
   - `git mv src/cli/skillsFormat.ts → src/cli/dataSkillsFormat.ts`
     (function export names unchanged — they format the data-SDK shape).
   - Deleted `test/resources/skills.test.ts` (252 lines).
   - `src/client.ts`: `_skills` → `_dataSkills`; `skills` getter → `dataSkills`.
   - `src/index.ts`: updated stale type re-export path (build-break fix,
     noted in implementer report).
   - `src/cli/index.ts`: `case 'skills':` → `case 'data-skills':`;
     `--name` / `--file` flags → positional `args[2]` / `args[3]`;
     `--`-prefix guard on positionals; updated `COMMAND_HELP`
     key + body; top-level help row.
   - `test/cli.test.ts`: mocks → `client.dataSkills.*`;
     `DISPATCHABLE_SUBCOMMANDS` row; full dispatch describe rewritten
     for positional args.

3. **`c9f14be` — `feat(cli): add playbook skills (alva skills list/tags/get/file)`**
   - NEW `src/resources/playbookSkills.ts` (+117): `PlaybookSkillsResource`
     class with `list({tag?, username?})`, `tags()`, `get(id)`, `file(id, path)`.
     Helper `parsePlaybookSkillId` splits `<user>/<name>` and throws
     `AlvaError('INVALID_ARGUMENT', …, 0)` on malformed input (3-arg
     `AlvaError` constructor per existing repo convention). `file(id, path)`
     encodes per-segment to preserve nested slashes. **No `noAuth: true`**
     anywhere — gateway routes are inside `middleware.Authorization()`.
     **No `files()` bulk method** — progressive loading is enforced at
     the SDK layer.
   - NEW `src/cli/playbookSkillsFormat.ts` (+71):
     `formatPlaybookSkillsList`, `formatPlaybookSkillsTags`,
     `formatPlaybookSkillGet`, `formatPlaybookSkillFile`. Latter returns
     raw file content (redirectable). Empty states handled.
   - `src/client.ts`: added `_playbookSkills` field + `playbookSkills`
     getter.
   - `src/cli/index.ts`: new `case 'skills':` block dispatching to all 4
     subcommands; `--tag`, `--username`, `--json` flags; positional
     `<user>/<name>` and `<path>`; `--`-prefix guard mirroring
     data-skills; `CliUsageError` on missing positional. New
     `COMMAND_HELP.skills` entry with positional examples + auth note +
     progressive-loading note. New top-level help row, placed before
     `data-skills` so the existing help-drift test guards uniquely
     match each row.
   - `test/cli.test.ts`: mocks for `client.playbookSkills.{list,tags,get,file}`;
     `DISPATCHABLE_SUBCOMMANDS` entry `skills: ['list','tags','get','file']`;
     new `'skills dispatch'` describe block (~64 lines) covering all
     subcommands' happy paths, `--tag` filter forwarding, missing
     positional cases for `get`/`file`, and the `--`-guard case
     `['skills','get','--json']`.

4. **`7603cf9` — `docs(README): document playbook skills + data-skills rename; bump 0.6.0`**
   - `README.md`: rewrote "Data Skills" section (positional args, new
     command name); inserted new "Playbook Skills" section above with
     command syntax + progressive-loading + auth note + example
     invocations; split L173 CLI one-liner into two lines for the two
     namespaces; net +37/-30 across the file.
   - `package.json`: `0.5.0` → `0.6.0` (pre-1.0 minor = breaking-change
     signal for `client.skills` → `client.dataSkills` rename and CLI
     namespace flip).

#### code/public/skills (`feat/skills-cli-rename`, commit `20b4f37`)

- `skills/alva/SKILL.md` (8 inserts / 8 deletes): 7 occurrences of
  `alva skills` (data-SDK CLI references) replaced with
  `alva data-skills`; lines that had `--name <skill>` / `--file <file>`
  flags rewritten to positional form. Phrase "(public, no auth)" kept
  — accurate for the data-skills CLI which hits the arrays backend.
  Frontmatter `metadata.version` bumped `v1.7.0` → `v1.8.0` so
  `scripts/version_check.sh` surfaces the update message on agents
  running an older cached copy.

### Tests added

User opted out of TDD. Test changes were limited to:

| Where                                                  | What                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alva-gateway/pkg/handler/playbook_skill_test.go`      | 6 new subtests under `TestPlaybookSkill_GetFile`: happy path, validation reject (`..` segment), gRPC NotFound, path-not-in-skill 404 + descriptive message, nested catch-all path (`references/api/x.md`). Existing handler tests (List, Tags, GetMeta, GetFiles bulk) untouched. |
| `toolkit-ts/test/cli.test.ts`                          | Wiring-level coverage only. Two new dispatch describe blocks (`'data-skills dispatch'` rewritten for positional args; `'skills dispatch'` new). Old `'templates dispatch'` and `'skills dispatch'` blocks removed.                                                                |
| `toolkit-ts/test/resources/{templates,skills}.test.ts` | Both deleted — no resource-level tests for the new `playbookSkills` or renamed `dataSkills` resources per user no-TDD direction.                                                                                                                                                  |

Section 5 verification matrix was build + lint + manual smoke (not a
TDD coverage diagram). Build/lint/test runs PASS on all three
worktrees per the final verifier (agent `a6d4`).

### Migration

None. No DB schema changes. Backend `templatespb` proto and
`playbook_templates` table untouched.

### Cross-reference (§4 vs §7)

| §4 module                                                             | §7 evidence                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------- |
| alva-gateway: `pkg/handler/playbook_skill.go` GetFile method          | commit `9d9f5b0`                                               |
| toolkit-ts: delete templates resource/tests                           | commit `8554a30`                                               |
| toolkit-ts: rename skills → dataSkills (files + class + getter + CLI) | commit `f7973bc`                                               |
| toolkit-ts: new playbookSkills resource + format + CLI + wiring tests | commit `c9f14be`                                               |
| toolkit-ts: README + package.json bump                                | commit `7603cf9`                                               |
| public/skills: SKILL.md 7-line rename + version bump                  | commit `20b4f37`                                               |
| alva-backend: untouched                                               | verified by empty `git log` against the alva-backend submodule |
| Frontend / other backends: untouched                                  | no other submodules modified                                   |

Undocumented change: one — `src/index.ts` type re-export path update
in commit `f7973bc`. Not in original §4 file list. Justified: the
rename of `src/resources/skills.ts` broke the existing
`export type { … } from './resources/skills.js'` re-export; the path
had to be updated or `pnpm run build` fails. Implementer caught it;
spec reviewer (agent `aef7`) verified type names themselves are
unchanged — pure path fix.

## 8. Remaining Tasks

### Follow-up work

- **Toolkit-ts npm publish.** After the toolkit-ts PR merges, the
  `@alva-ai/toolkit` package at `0.6.0` must be published so agents
  picking up the new SKILL.md can run `alva data-skills` /
  `alva skills` against the renamed surface. Until publish, the public
  skill manual at `v1.8.0` references commands that don't exist in any
  installed CLI version.

- **SKILL.md PR ordering.** The `code/public/skills` PR must merge
  _after_ the toolkit-ts release is published — otherwise
  `version_check.sh` will tell agents to upgrade to a toolkit-ts
  version that doesn't exist on npm yet. Push step will sequence this.

### Known limitations

- **Bulk `/files` endpoint reachable outside the SDK.** SDK/CLI
  deliberately exclude it; raw HTTP callers can still fetch all file
  content in one call. Acceptable: frontend / debug clients
  legitimately want it. Not a security regression — both endpoints are
  auth-gated.

- **Per-file endpoint reads the whole JSONB row.** Gateway filters
  in-handler. Documented in §3 as accepted; no efficiency win from a
  per-file RPC because backend reads the whole column either way.
  Revisit only if a skill grows large enough that full-row
  deserialization is measurable.

- **Path validation duplicated** between gateway `GetFile` and backend
  `validatePath`. Mitigated by a code comment on the gateway side
  pointing at `alva-backend internal/services/templates/templates_grpc.go:96`.
  Long-term, a shared validator package would be cleaner; out of scope.

### Tech debt introduced

- **`pnpm-lock.yaml`** is generated when running `pnpm install` in the
  toolkit-ts worktree but the repo tracks `package-lock.json`. The
  worktree's `pnpm-lock.yaml` is left untracked. If the repo's package
  manager is ever standardized on pnpm, the lock-file story should be
  revisited.

### Deferred edge cases

None. All error paths in §4 are covered by handler code; CLI
positional parsing handles missing args and `--`-prefix shortcuts;
gateway path validation matches backend rules.

### Coordination with other services

- **alva-backend**: no changes required. Gateway calls the existing
  `GetPlaybookTemplateFiles` RPC with no new fields.
- **frontend**: `rg "v1/skills|v1/templates" code/frontend/` → 0 hits.
  No coordination needed.
- **forge**: `code/forge/forge/internal/gateway/skill_handler.go` is a
  separate upload handler unrelated to this read path. No
  coordination.
