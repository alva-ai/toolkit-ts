# feat: add `playbooks set-visibility` subcommand

## 1. Background

A user wants to set a playbook's visibility (e.g. make it private) from the
CLI. Research showed the end-to-end machinery already exists on the backend
and gateway — the only missing surface is the toolkit CLI.

**Already shipped upstream (no change needed):**

- alva-backend — playbooks have a three-valued `visibility` column
  (`public` / `private` / `paid`, with a CHECK constraint), a dedicated
  `SetPlaybookVisibility` gRPC RPC (`internal/services/playbook/playbook_grpc.go:4974`),
  a visibility saga + ALFS ACL sync, and a tier gate.
- alva-gateway — `POST /api/v1/playbook/:name/visibility` with JSON body
  `{"visibility": "..."}` proxies straight to the `SetPlaybookVisibility`
  RPC (`pkg/handler/playbook.go:127`). Requires a logged-in user; returns
  `{"playbook_path": "<owner>/<name>"}` on success.

**The gap is toolkit-ts:** `PlaybooksResource` (`src/resources/playbooks.ts`)
has only the read-only `trending()` method, and the CLI `playbooks` group
(`src/cli/index.ts:1405`) has only the `trending` subcommand. There is no way
to call the visibility endpoint without falling back to `curl`, which
violates the project's "use the CLI" rule.

**Tier gate (intentional, NOT changed by this work):** The backend gates
`private` and `paid` visibility behind `cfg.Playbook.AllowPrivate`
(`playbook_grpc.go:862`). Per the `config_v2` `tier/entitlements` blob:
`free` → `allow_private: false`; `pro` / `max` → `allow_private: true`.
A free-tier user setting `private` gets `codes.PermissionDenied` ("private
playbooks require a paid subscription"). This is deliberate product design —
private playbooks are a paid capability. The CLI surfaces this error
faithfully; it does not attempt to bypass or alter the gate.

**Relevant systems within toolkit-ts:**

- `src/client.ts` — `AlvaClient`, `_request()`, `_requireAuth()`, lazy
  resource getters (`get playbooks()` already wired).
- `src/cli/index.ts` — `dispatch()`, `parseFlags()`, `requireFlag()`,
  `HELP_TEXT`, `COMMAND_HELP`.
- `src/resources/playbooks.ts` — the resource to extend.
- `src/resources/remix.ts` / `src/resources/comments.ts` — closest mutate
  patterns: `_requireAuth()` + `_request('POST', path, { body })`.

**Skill (in scope this run):** `code/public/skills/skills/alva/SKILL.md`
documents how the agent uses the CLI. It needs a pointer to the new
subcommand so an agent knows it can set a playbook private/public.

**Premises validated with user:**

- P1: backend + gateway are already done; only CLI + Skill need work.
- P2: The `AllowPrivate` tier gate is intentional and is NOT touched.
- P3: One generic `set-visibility` subcommand (covers private/public/paid),
  mirroring the gateway endpoint one-to-one — not a dedicated `make-private`.
- P4: Skill docs updated in the same run (CLI + Skill scope).

## 2. End-to-End Behavior

### Primary behavior

A logged-in user runs:

```
alva playbooks set-visibility --name my-scanner --visibility private
```

The CLI POSTs `{"visibility": "private"}` to
`/api/v1/playbook/my-scanner/visibility` with the standard
`X-Alva-Api-Key` header, and prints the gateway's JSON response
(`{"playbook_path": "<owner>/my-scanner"}`) to stdout. `public` and `paid`
are accepted the same way.

### Variants and edge cases

- **Missing `--name`** → `CliUsageError` from `requireFlag`, before any HTTP
  call (mirrors existing flag-validation behavior).
- **Missing `--visibility`** → `CliUsageError` from `requireFlag`.
- **Invalid `--visibility` value** (not public/private/paid) → the CLI sends
  it as-is; the backend rejects it with `InvalidArgument`, surfaced as an
  HTTP error by the gateway and printed by the CLI. (Optional: client-side
  validation against the known enum to fail fast — decided in plan phase.)
- **Not logged in** → `_requireAuth()` throws before the request (consistent
  with `remix`/`comments`).
- **Free-tier user setting `private`/`paid`** → gateway returns the
  `PermissionDenied` gRPC error mapped to HTTP; the CLI prints it faithfully.
  No special-casing.

### Failure modes

- Network / gateway errors propagate through `_request()`'s existing error
  handling (same as every other resource).
- The resource returns the parsed JSON body so the CLI can echo it; no fs
  side effects.

## 3. Findings

### Existing patterns to mirror

- **Resource mutate pattern** — `src/resources/remix.ts:7-15`:
  `this.client._requireAuth(); await this.client._request('POST', path, { body });`
  `comments.ts` shows the same with a `name`-bearing body.
- **Resource read pattern already in file** — `playbooks.ts:80-104`
  (`trending`) shows the `_request` call shape and the agent-friendly
  projection style.
- **CLI dispatch** — add a `case 'set-visibility':` inside the existing
  `case 'playbooks':` switch (`src/cli/index.ts:1411`), using
  `requireFlag(flags, 'name', ...)` and `requireFlag(flags, 'visibility', ...)`.
- **Help text** — extend `COMMAND_HELP.playbooks` (`index.ts:386`) and, if
  the one-line summary lists subcommands, the `HELP_TEXT` block.
- **Tests** — `test/resources/resources.test.ts` uses a `makeClient()` that
  stubs `client._request` and asserts
  `toHaveBeenCalledWith('POST', '/api/v1/...', { body: {...} })`. Add a
  `PlaybooksResource.setVisibility` case there. CLI dispatch flag parsing is
  covered by `test/cli/parseFlags.test.ts`.

### Gateway contract (verified)

- Method/path: `POST /api/v1/playbook/:name/visibility`
- Body: `{ "visibility": "public" | "private" | "paid" }` (`binding:"required"`)
- Auth: requires logged-in user (`requireLoginUser`).
- Success: `200` `{ "playbook_path": "<owner>/<name>" }`.
- `:name` is the URL-safe playbook name; the owner is derived server-side
  from the authenticated user, so the CLI only needs `--name`.

### Chosen approach

Minimal-viable, single new resource method + single new subcommand:

1. `PlaybooksResource.setVisibility({ name, visibility })` →
   `POST /api/v1/playbook/${name}/visibility` body `{ visibility }`, returns
   the parsed `{ playbook_path }` response.
2. CLI `playbooks set-visibility --name <name> --visibility <v>` wiring +
   help.
3. Resource unit test mirroring the remix/comments tests.
4. SKILL.md pointer for the new command.

### Risks and unknowns

- **Client-side enum validation**: whether to validate `--visibility` against
  `{public, private, paid}` in the CLI or defer to the backend. Low risk
  either way; resolved in plan. Leaning toward a thin client-side check for a
  faster, clearer error, matching `trendingPlaybooksSort`'s normalization
  habit.
- No DB/proto changes, so no migration and no golden regeneration.

### Scope shape

Two submodules, no backend/gateway changes: **toolkit-ts** (resource + CLI +
test) and **skills** (SKILL.md doc). The backend/gateway portion of the
"backend → cli" chain is already in production.

### Reference files for implementation

- Resource pattern: `src/resources/remix.ts` (mutate), `src/resources/playbooks.ts` (same file, request shape).
- CLI pattern: `src/cli/index.ts` `case 'playbooks'` block + `COMMAND_HELP.playbooks`.
- Test pattern: `test/resources/resources.test.ts` (RemixResource / CommentsResource blocks).
- Skill: `code/public/skills/skills/alva/SKILL.md` (follow the
  `alva-skill-standard` skill when editing — route, don't duplicate).
