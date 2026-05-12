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

| Method/codepath | What can go wrong | Handling | User sees |
|---|---|---|---|
| `PlaybookSkillHandler.GetFile` — gRPC upstream | `GetPlaybookTemplateFiles` fails (DB, network) | `grpcToHTTPError(c, err, "")` | matched HTTP status, error JSON |
| `PlaybookSkillHandler.GetFile` — skill row missing | gRPC returns NotFound | `grpcToHTTPError` maps to 404 | 404 with gRPC msg |
| `PlaybookSkillHandler.GetFile` — path validation | malformed path (regex fail / `..` segment / leading `/`) | return 400 via `c.JSON` before gRPC call | 400 + descriptive msg |
| `PlaybookSkillHandler.GetFile` — path not in skill | gRPC succeeds but no matching file | return 404 via `c.JSON` with `"file path %q not found in skill %q/%q"` | 404 + descriptive msg |
| `parsePositionalUserName` (CLI) | positional arg missing `/`, empty, or extra slashes | throw `CliUsageError` with subcommand name | usage hint, exit 2 |
| `client.playbookSkills.file()` | fetch network error / non-2xx | `_request` already wraps with `AlvaError`; CLI prints message and exits non-zero | stderr error |

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

*To be filled in review phase.*

## 8. Remaining Tasks

*To be filled in review phase.*
