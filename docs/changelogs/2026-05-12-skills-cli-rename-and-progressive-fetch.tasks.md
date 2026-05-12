# Task list — 2026-05-12-skills-cli-rename-and-progressive-fetch

> **No TDD.** Tasks below are pure implementation steps. The plan's
> verification gate (build + lint + manual smoke) runs after all
> tasks complete.

## Task 1: alva-gateway — add per-file endpoint

**Complexity:** simple
**Dependencies:** none
**Repo:** `code/backend/alva-gateway`
**Files:** `pkg/handler/playbook_skill.go`, `pkg/handler/playbook_skill_test.go`

**What to do:**
- Inside `PlaybookSkillHandler.RegisterRoutes`, add
  `rg.GET("/:username/:name/files/*path", h.GetFile)`.
- Implement `GetFile(c *gin.Context)`:
  1. Read `username`, `name`, and `path` params. Trim one leading `/`
     from `path`.
  2. Apply the same path validation logic the backend uses
     (`validatePath` in `alva-backend internal/services/templates/templates_grpc.go:96`):
     non-empty, no leading `/`, regex `^[a-zA-Z0-9_\-./]+$`, no `..` /
     `.` / empty segments. On failure return 400 JSON
     `{success:false, error:"…"}` directly (do not call backend).
     Add a code comment in the gateway handler citing
     `alva-backend internal/services/templates/templates_grpc.go:96`
     so future updates to either side stay in sync.
  3. Call `clients.Templates.GetPlaybookTemplateFiles` (existing RPC).
     On error → `grpcToHTTPError(c, err, "")` and return.
  4. Iterate `resp.Files`; if a matching `path` is found return
     `200 {success:true, data:[{username, name, path, content, updated_at}]}`.
  5. If none match return 404 JSON
     `{success:false, error:"file path \"…\" not found in skill \"<u>/<n>\""}`.
- Mirror existing log fields (`Str("username", …).Str("skill", …)`).

**Tests:** add a test case to `playbook_skill_test.go` table for the
new endpoint covering: happy path, path validation reject, skill
not found (gRPC NotFound), path not in skill, nested path
(`references/api/x.md`). The existing handler test file already mocks
the `TemplatesClient`; reuse that mock.

**Steps:**
- [ ] Add route + handler method
- [ ] Add tests
- [ ] `make lint-fix && make lint`
- [ ] `make test` (only the gateway test file changed; expect all green)
- [ ] Commit (do not push — wait until toolkit-ts is ready)

---

## Task 2: toolkit-ts — delete templates resource & tests

**Complexity:** simple
**Dependencies:** none (independent of Task 1)
**Repo:** `code/public/toolkit-ts`
**Files:**
- DELETE `src/resources/templates.ts`
- DELETE `test/resources/templates.test.ts`
- Modify `src/client.ts` (drop import + getter)
- Modify `src/cli/index.ts` (drop `case 'templates'` at L1272–1302 + delete `COMMAND_HELP.templates` at L450 + remove `templates` row from top-level help at L54)
- Modify `test/cli.test.ts` (drop the `templates` entry in the L1316–1317 command-list table, drop any templates dispatch describe block)

**What to do:** Surgical deletion. After this, `pnpm run build` and
`pnpm run test` must still pass (the templates-related tests are gone).

**Steps:**
- [ ] Delete the two files
- [ ] Remove imports + getter from `client.ts`
- [ ] Remove CLI case + help entries
- [ ] Update `test/cli.test.ts` command-list table
- [ ] `pnpm install && pnpm run lint && pnpm run build && pnpm run test`
- [ ] Commit (intermediate; do not push)

---

## Task 3: toolkit-ts — rename skills → data-skills

**Complexity:** normal
**Dependencies:** Task 2 (cleanest done after templates is gone, so
the namespace is free for the playbook-skills work in Task 4)
**Files:**
- RENAME `src/resources/skills.ts` → `src/resources/dataSkills.ts`
- RENAME `src/cli/skillsFormat.ts` → `src/cli/dataSkillsFormat.ts`
- RENAME `test/resources/skills.test.ts` → **DELETE** (per plan; no
  resource-level tests for data-skills)
- Modify `src/client.ts` (import path + `dataSkills` getter)
- Modify `src/cli/index.ts`:
  - update imports for `dataSkillsFormat`
  - rename the `case 'skills'` block at L1242 to `case 'data-skills'`
  - convert `--name <skill>` / `--file <file>` flags to positional
    `args[2]` / `args[3]`; throw `CliUsageError('Missing skill name', 'data-skills')` on missing
  - rename `COMMAND_HELP.skills` entry (L482) to `COMMAND_HELP['data-skills']`; update the usage string to positional form
- Modify top-level help block at L53 — rename `skills` → `data-skills`
- Modify `test/cli.test.ts`:
  - command-list table: replace `skills` row with `data-skills`
  - dispatch test block at L1364: rename describe to `'data-skills dispatch'`; update args (`['data-skills', 'list']` etc.) and positional-arg cases

**What to do:** symbol-level rename. Class `SkillsResource` →
`DataSkillsResource`. Type re-exports
(`SkillEndpointMetadata`, `SkillEndpointTier`) stay named — they are
domain types, not module names.

**Steps:**
- [ ] Rename files (use `git mv`)
- [ ] Rename class + update all internal references via `rg`
- [ ] Update `client.ts` getter
- [ ] Update CLI command name, help, positional parsing
- [ ] Update cli.test.ts wiring
- [ ] `pnpm run lint && pnpm run build && pnpm run test`
- [ ] Commit

---

## Task 4: toolkit-ts — new playbook skills resource + CLI

**Complexity:** normal
**Dependencies:** Task 3 (the `skills` CLI namespace is free now)
**Files:**
- NEW `src/resources/playbookSkills.ts`
- NEW `src/cli/playbookSkillsFormat.ts`
- Modify `src/client.ts` (add `playbookSkills` getter)
- Modify `src/cli/index.ts` (new `case 'skills'`, new `COMMAND_HELP.skills`, top-level help row)
- Modify `test/cli.test.ts` (add `skills` row to command-list; add a
  `'skills dispatch'` describe block covering positional parsing
  happy + failure cases — wiring level only, no resource-level tests)

**playbookSkills.ts shape:**

```ts
export class PlaybookSkillsResource {
  constructor(private client: AlvaClient) {}
  list(params?: { tag?: string; username?: string }): Promise<{ skills: PlaybookSkillSummary[] }>
  tags(): Promise<{ tags: TagEntry[] }>
  get(usernameSlashName: string): Promise<PlaybookSkillMeta>
  file(usernameSlashName: string, path: string): Promise<PlaybookSkillFile>
}
```

- `_request('GET', '/api/v1/skills')` — uses the default gateway base
  URL (NOT `arraysBaseUrl`). **Do NOT pass `noAuth: true`** — the route
  is inside `middleware.Authorization()` in
  `alva-gateway/cmd/gateway/main.go:216`. Mirror the auth posture of
  the deleted `TemplatesResource`.
- `get` and `file` unwrap `data?.[0]` and throw on empty (mirroring
  the deleted templates resource pattern).
- Helper `parseUserName(s)` lives in the resource file and is also
  exported for CLI use; it splits on `/`, requires exactly two
  non-empty pieces, throws `AlvaError('skill identifier must be "<user>/<name>"')` otherwise.

**CLI subcommands (positional):**

| Subcommand | Positional args | Flags |
|---|---|---|
| `list` | — | `--tag`, `--username`, `--json` |
| `tags` | — | `--json` |
| `get` | `args[2]` = `<user>/<name>` | `--json` |
| `file` | `args[2]` = `<user>/<name>`, `args[3]` = `<path>` | `--json` |

Default output formats:
- `list`: text table from `formatPlaybookSkillsList`
- `tags`: text bullet list
- `get`: multi-line block
- `file`: raw file content to stdout (no header — directly redirectable)
- With `--json`: emit raw envelope as-is

**Steps:**
- [ ] Write `playbookSkills.ts` (resource + parser)
- [ ] Write `playbookSkillsFormat.ts` (4 formatters)
- [ ] Wire into `client.ts`
- [ ] Add CLI case + help
- [ ] Add `cli.test.ts` wiring tests (one positional happy path per
      subcommand + one failure case for malformed positional)
- [ ] `pnpm run lint && pnpm run build && pnpm run test`
- [ ] Commit

---

## Task 5: toolkit-ts — README + semver bump

**Complexity:** simple
**Dependencies:** Task 4 (final CLI shape settled)
**Files:** `README.md`, `package.json`

**What to do:**
- Rewrite the existing "Data Skills" section (~L69-77 — verify with
  `rg "## Data Skills" README.md` before editing) and its CLI
  one-liner at L173 with `alva data-skills` commands.
- Add new "Playbook Skills" section describing
  `alva skills list/tags/get/file` and the progressive loading
  contract (`get` → metadata + file listing; `file` → one file's
  content).
- Update the command summary table (if present) to reflect
  `skills`, `data-skills` (and remove `templates`).
- Bump `package.json` `version` from `0.5.0` → `0.6.0` (pre-1.0
  minor bump = breaking-change signal for the `client.skills` →
  `client.dataSkills` rename and CLI semantic flip).

**Steps:**
- [ ] Edit README
- [ ] Bump `package.json` version
- [ ] `pnpm run lint` (markdownlint if configured) / spot-check
      rendering
- [ ] Commit

---

## Task 6: code/public/skills — SKILL.md update

**Complexity:** simple
**Dependencies:** Tasks 3 + 4 (CLI behavior must exist before
documenting it)
**Repo:** `code/public/skills`
**Files:** `skills/alva/SKILL.md`

**What to do:**
- Replace exactly 7 occurrences of `alva skills` (data-skills context)
  on lines 446, 448, 451, 453, 469, 477, 483 with `alva data-skills`.
- Convert `--name <skill>` and `--file <file>` flags in those lines to
  positional form (e.g., `alva data-skills summary <skill>`,
  `alva data-skills endpoint <skill> <file>`).
- Bump frontmatter `metadata.version: v1.7.0` → `v1.8.0`.
- **Do not** add a new playbook-skills section; the existing
  `/use-template:<name>` workflow (L186–199) reads templates from the
  filesystem, not via CLI.

**Steps:**
- [ ] Edit SKILL.md (search-and-replace on the 7 lines)
- [ ] Bump version
- [ ] Run `bash scripts/version_check.sh` to confirm shape
- [ ] Spot-check the changed sections render correctly
- [ ] Commit (separate PR from toolkit-ts; will land after toolkit-ts
      release)

---

## Task 7: Final verification gate

**Complexity:** simple
**Dependencies:** Tasks 1–6

**What to do:** run the verification suite from §5 of the changelog
against alva-local-dev. Confirm all happy + error commands listed
there behave as documented. Specifically verify:
- `alva skills file alva/<some-skill> <path>` returns raw content
  redirectable to a file
- `alva skills file alva/<some-skill> ../etc/passwd` returns 400 from
  gateway
- `alva templates list` errors with "unknown group"
- `alva data-skills summary <name>` works identically to legacy
  `alva skills summary --name <name>`

**Steps:**
- [ ] Bring up alva-local-dev (gateway + alva-backend)
- [ ] Link the local toolkit-ts build (`pnpm link --global` or run via
      `node dist/cli.js`)
- [ ] Run the smoke matrix from §5
- [ ] Note any deviation in the changelog Outcome section
      (filled by `review`)

---

## Dependency graph

```
Task 1 (gateway endpoint)  ──┐
                              ├──► Task 7 (verification)
Task 2 (delete templates) ──► Task 3 (rename → data-skills) ──► Task 4 (new skills) ──► Task 5 (README)
                                                                                    ──► Task 6 (SKILL.md)
```

- Task 1 and Task 2 are independent and can run in parallel.
- Tasks 3 → 4 → {5, 6} are a strict chain inside toolkit-ts because
  they share `src/cli/index.ts` and `src/client.ts`.
- Task 7 (smoke) gates the push.
- Task 6 lives in a different repo and ships in a separate PR after
  toolkit-ts is published.
