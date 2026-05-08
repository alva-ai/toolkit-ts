# feat: add `templates` subcommand for playbook-templates discovery

## 1. Background

The alva-backend `TemplatesService` (gRPC) and alva-gateway REST proxy
shipped four read-only HTTP routes for playbook templates, namespaced by
`(username, name)`:

- `GET /api/v1/templates?category=&username=` — list summaries
- `GET /api/v1/templates/categories` — distinct sorted categories
- `GET /api/v1/templates/:username/:name` — meta (path + size_bytes, no
  content)
- `GET /api/v1/templates/:username/:name/files` — full file content

Today the toolkit has no way to reach these endpoints. The alva skill
needs a CLI surface so it can fetch a template's full content (e.g. the
`ai-digest` template) into the agent's working session without falling
back to `curl`, which directly violates the project's "use the CLI" rule.

This change adds a `templates` subcommand that mirrors the shape of the
existing `skills` and `sdk` discovery subcommands.

**Upstream PRs (already merged on main):**

- alva-backend#928 — `(username, name)` namespace + Create/Update/Delete
  RPCs (CRUD on the gRPC layer; gateway exposes reads only)
- alva-gateway#330 — read-only REST routes (no Create/Update/Delete on the
  HTTP surface)

**Relevant systems within toolkit-ts:**

- `src/client.ts` — `AlvaClient`, `_request()`, lazy resource getters
- `src/cli/index.ts` — `dispatch()`, `HELP_TEXT`, `COMMAND_HELP`
- `src/resources/skills.ts` — closest pattern shape-wise (GET-driven
  discovery surface), but lives on the Arrays backend; templates lives
  on the main Alva gateway, so the new resource uses `client.baseUrl`
  rather than `arraysBaseUrl`
- `src/resources/secrets.ts` — closest pattern auth-wise (GET on the
  gateway with the standard API-key header)

**Constraints:**

- Single-package change; no backend or gateway changes.
- The four gateway routes are public (no auth required) — toolkit
  attaches the standard `X-Alva-Api-Key` header anyway because the
  gateway tolerates it; we don't go out of our way to set `noAuth: true`.
- The CLI surface emits pure JSON to stdout (no fs side-effects). Future
  materialization to `~/.cache/alva/templates/<u>/<n>/` is a separate
  follow-up if/when the alva skill needs it.
- `templates` is the namespace name, plural to match the API path,
  backend table, and gateway routes (and other toolkit namespaces like
  `secrets`, `comments`).

**Premises validated with user:**

- P1: New `TemplatesResource` on `client.baseUrl`, not on
  `arraysBaseUrl`.
- P2: Four flat subcommands (list / categories / get / files), not
  three with a `--files` switch on `get`.
- P3: Pure JSON output to stdout, no fs materialization.
- P4: Same testing pattern as `secrets`/`skills` resources.
- P5: Single-package scope (toolkit-ts only).

## 2. End-to-End Behavior

### Primary behavior

A user runs `alva templates list` and receives a JSON array of every
template the gateway knows about, each with `username`, `name`,
`description`, `categories`, `creator_uid`, `updated_at`. They optionally
narrow by `--category` or `--username`. They then run
`alva templates get --username <u> --name <n>` for the file tree
(metadata + per-file `size_bytes`, no content) or
`alva templates files --username <u> --name <n>` for the full file
content. `alva templates categories` prints the distinct sorted set of
categories used across all rows.

### Variants / edge cases

- `--category` and `--username` filters are forwarded as query params;
  empty strings (i.e. flag omitted) mean "no filter". Non-empty values
  must match `^[a-z][a-z0-9-]*$` per the gateway contract — otherwise
  the gateway returns `400 INVALID_ARGUMENT` and toolkit surfaces it as
  `AlvaError`.
- `get` and `files` require both `--username` and `--name`. Missing
  either flag produces a `CliUsageError` with the `templates` command
  help text.
- Unknown `(username, name)` returns `404 NOT_FOUND` from the gateway,
  surfaced as `AlvaError("NOT_FOUND", ..., 404)`. No retry logic.
- Network-level failures (gateway unreachable, etc.) flow through the
  existing `_request` error handling like every other resource.

### Failure modes

- Gateway unreachable → `AlvaError("NETWORK_ERROR", ..., 0)`.
- Malformed query (e.g. `--category Bad`) → `400 INVALID_ARGUMENT` from
  the gateway, surfaced unchanged.
- Missing required flag → `CliUsageError` printed before any HTTP call.

## 3. Findings

### Chosen approach

**Approach A (agreed with user):** Add a `TemplatesResource` class with
four methods (`list`, `categories`, `get`, `files`), each making a single
GET to `client.baseUrl` and returning the parsed JSON `data` array.
Register a lazy getter on `AlvaClient` (`client.templates`). Add a
`templates` case to the CLI `dispatch` switch with four leaf subcommands.
Add a `templates` entry to `HELP_TEXT` and a detailed `COMMAND_HELP.templates`
block matching the style of `secrets` / `skills`.

This shape:

- reuses the existing `_request()` infrastructure (no new transport
  code);
- mirrors the `secrets` resource for auth-bearing GETs (same header
  injection, same error handling);
- mirrors the `skills` resource for the multi-route shape;
- keeps the CLI dispatch's `switch (group)` layout consistent with every
  other namespace.

### Constraints / dependencies

- `AlvaClient.baseUrl` is already populated from the standard config
  precedence chain (`--base-url` flag > `ALVA_ENDPOINT` env > config
  file > default). No new config plumbing.
- `_request()` already JSON-decodes responses; the gateway returns
  `{success, data: [...]}`, so each resource method unwraps `.data`.
- `package.json` version is `0.4.2`. A normal feature bump is `0.5.0`.

### Risks

- **API drift after release.** If the gateway later adds a new field to
  template summaries, old toolkit versions will silently drop it. This
  is no different from any other GET-passthrough resource and is
  acceptable.
- **`username` regex divergence.** The gateway accepts
  `^[a-z0-9][a-z0-9-]*$` for username (post-PR-review fix on backend).
  The toolkit does not pre-validate the flag — invalid usernames go to
  the gateway and bounce as `400`. This is by design; pre-validation
  would duplicate the contract and rot if backend rules change.

### Scope shape

Single-package. All edits land in `code/public/toolkit-ts/`.

### Reference files for implementation

- **Resource pattern:** `src/resources/secrets.ts` — auth-bearing GETs
  on `client.baseUrl`, single-method-per-route.
- **Resource shape pattern:** `src/resources/skills.ts` — multi-route
  discovery surface (list/summary/endpoint).
- **Client wiring:** `src/client.ts` lines 1-19 (imports), 24-67
  (private fields + getters) — add `_templates` and a `get templates()`
  block following the alphabetical layout.
- **CLI dispatch pattern:** `src/cli/index.ts` `case 'secrets':` block
  (lines ~1110–1140) — flat switch on subcommand with `requireFlag`
  validation.
- **CLI help pattern:** `src/cli/index.ts` `COMMAND_HELP.skills` block
  (lines ~423–444) — explains subcommands, flags, examples.
- **Resource test pattern:** `test/resources/skills.test.ts` —
  Vitest mocking the client's `_request` and asserting the URL +
  options for each method.
- **CLI dispatch test pattern:** `test/cli.test.ts` — mock
  `client.<namespace>.<method>` and call `dispatch(client, args)`,
  asserting the right method runs with the right params.

### Reference files for the API contract

- **Gateway handler:** `code/backend/alva-gateway/pkg/handler/playbook_template.go`
  on the `feat/templates-crud-rest` branch (PR #330).
- **Proto contract:** `code/backend/alva-backend/api/proto/templatespb/v1/templatespb.proto`
  on origin/main.
