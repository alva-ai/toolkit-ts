# Tasks — 2026-04-20-skills-subcommand

TDD discipline: write test → run (red) → implement → run (green) → lint.

Test commands: `npm test` (vitest), `npm run lint`, `npm run typecheck`.

---

### Task 1: Client transport — `baseUrl` / `noAuth` options

**Complexity:** normal
**Dependencies:** none
**Files:** `src/types.ts`, `src/client.ts`, `test/client.test.ts`

**What to do:** Extend `RequestOptions` with two optional fields. In
`_request`, when `options.baseUrl` is set, use it in place of
`this.baseUrl`. When `options.noAuth` is true, do not attach
`X-Alva-Api-Key` or `x-Playbook-Viewer`. Add
`arraysBaseUrl: string` to `AlvaClientConfig` and resolve in the
constructor with `DEFAULT_ARRAYS_BASE_URL = 'https://data-tools.prd.space.id'`.

**Steps:**

- [ ] Add failing tests in `test/client.test.ts` for the 7 client-level cases in §5
- [ ] `npm test` — verify red for the right reason
- [ ] Implement in `src/types.ts` + `src/client.ts`
- [ ] `npm test` — green
- [ ] `npm run typecheck && npm run lint`

---

### Task 2: `SkillsResource`

**Complexity:** simple
**Dependencies:** Task 1
**Files:** `src/resources/skills.ts` (new), `test/resources/skills.test.ts` (new), `src/client.ts` (add getter)

**What to do:** Mirror `src/resources/sdkDocs.ts`. Three methods. All
call `this.client._request('GET', path, { baseUrl: this.client.arraysBaseUrl, noAuth: true, query? })`.
`summary` encodes `name` via `encodeURIComponent`. `endpoint` also
encodes `name` in path and passes `path` as `query.endpoint`. No
`_requireAuth()` calls. Add `get skills()` lazy getter to
`AlvaClient`.

**Steps:**

- [ ] Write failing tests per §5 (6 cases)
- [ ] `npm test` — red
- [ ] Implement `src/resources/skills.ts` + client getter
- [ ] `npm test` — green
- [ ] `npm run typecheck && npm run lint`

---

### Task 3: CLI config resolution for `--arrays-endpoint`

**Complexity:** simple
**Dependencies:** Task 1 (uses `AlvaClientConfig.arraysBaseUrl`)
**Files:** `src/cli/config.ts`, `test/config.test.ts`

**What to do:** Add `arraysBaseUrl` to the resolved config shape.
Resolve via `parseFlag(argv, '--arrays-endpoint')` first, then
`env.ARRAYS_ENDPOINT`, then the default constant. Mirror the existing
`baseUrl` resolution structure.

**Steps:**

- [ ] Write failing tests per §5 (5 cases)
- [ ] `npm test` — red
- [ ] Implement
- [ ] `npm test` — green
- [ ] `npm run typecheck && npm run lint`

---

### Task 4: CLI dispatch, help, and flag stripping

**Complexity:** normal
**Dependencies:** Task 2, Task 3
**Files:** `src/cli/index.ts`, `test/cli.test.ts`

**What to do:**

- Add `COMMAND_HELP.skills` entry (follow `sdk` help as template; document the three subcommands, flags, and the `--arrays-endpoint` / `ARRAYS_ENDPOINT` override).
- Add `skills` to the `HELP_TEXT` Commands list and mention `--arrays-endpoint` under Global options.
- Add `case 'skills':` to `dispatch` with `list` / `summary` / `endpoint` subcommands; use `requireFlag` for `--name` / `--path`.
- Extract the inline global-flag stripping loop in `main` into an exported pure helper `stripGlobalFlags(argv: string[]): string[]` (covers `--api-key`, `--base-url`, `--profile`, `--arrays-endpoint`, and their `=value` forms). Unit-test the helper directly.
- In `main`, replace the inline loop with a call to `stripGlobalFlags`, and pass `config.arraysBaseUrl` into `new AlvaClient({...})`.

**Steps:**

- [ ] Write failing tests per §5 (12 cases)
- [ ] `npm test` — red
- [ ] Implement
- [ ] `npm test` — green
- [ ] `npm run typecheck && npm run lint`

---

### Task 5: Version bump + manual smoke

**Complexity:** simple
**Dependencies:** Tasks 1–4
**Files:** `package.json`, README only if command table needs the row

**What to do:** Read current `version` in `package.json` and bump the
minor (new surface, non-breaking). Build with `npm run build`. Smoke
test locally:
`node dist/cli.js skills list`,
`node dist/cli.js skills summary --name <one-from-list>`,
`node dist/cli.js skills endpoint --name <s> --path <p>`.
Check `alva --help` renders the new row.

**Steps:**

- [ ] Bump version
- [ ] `npm run build`
- [ ] Manual smoke (all three subcommands + help)
- [ ] `npm run typecheck && npm run lint && npm test`

---

## Dependency graph

```
Task 1 (client transport) ──┬── Task 2 (SkillsResource) ──┐
                            │                              ├── Task 4 (CLI) ── Task 5 (bump + smoke)
                            └── Task 3 (config resolve) ──┘
```

Tasks 2 and 3 can run in parallel after Task 1 lands.
