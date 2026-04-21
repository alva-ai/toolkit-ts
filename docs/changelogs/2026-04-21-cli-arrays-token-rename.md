# chore: rename CLI verb `arrays-jwt` to `arrays token`

## 1. Background

`alva arrays-jwt <ensure|status>` shipped on 2026-04-20
([2026-04-20-cli-arrays-jwt-bootstrap.md](2026-04-20-cli-arrays-jwt-bootstrap.md)).
The hyphenated single-segment group leaks an implementation detail (JWT)
into the user-facing verb and closes off `arrays` as a namespace for
future Arrays-backend verbs.

Rename the CLI surface to `alva arrays token <ensure|status>`. `arrays`
becomes a new two-level group; `token` is its only subgroup today.
Backend REST paths (`/api/v1/arrays-jwt/*`), SDK resource name
(`client.arraysJwt`), file layout, and `whoami`'s `_meta.arrays_jwt`
JSON field are unchanged — this change is strictly what the user types.

The feature is one day old; no deprecation alias.

## 2. End-to-End Behavior

- `alva arrays token ensure` — identical to the former
  `alva arrays-jwt ensure`: calls `client.arraysJwt.ensure()` →
  `POST /api/v1/arrays-jwt/ensure`, JSON output.
- `alva arrays token status` — identical to the former
  `alva arrays-jwt status`: `GET /api/v1/arrays-jwt/status`, JSON output.
- `alva arrays-jwt …` — no longer recognized; produces the standard
  `Unknown command: 'arrays-jwt'` error.
- Help text:
  - `alva --help` top-level listing shows `arrays` (not `arrays-jwt`).
  - `alva arrays --help` → lists `token` subgroup.
  - `alva arrays token --help` → lists `ensure` / `status`.
  - `alva arrays token bogus` → throws with message mentioning
    `arrays token` and `--help`.
- `alva configure` stderr line and `whoami` `_meta.arrays_jwt` JSON
  field unchanged.

## 3. Findings

### Approach

Single approach — minimal CLI-surface rename. The dispatcher's current
assumption (`parseFlags(args.slice(2))`) is one-level; the new `arrays`
case handles its own three-segment parsing locally without refactoring
the shared dispatcher. Every other verb is untouched.

### Scope shape

Single-service (toolkit-ts). No gateway or backend change.

### Files touched

- `src/cli/index.ts` — HELP_TEXT verb line, remove `COMMAND_HELP['arrays-jwt']`,
  add `COMMAND_HELP['arrays']` and `COMMAND_HELP['arrays token']`, replace
  the `case 'arrays-jwt'` dispatch branch with `case 'arrays'`, update
  `configure`/`whoami` help cross-refs (lines 78, 117).
- `test/cli.test.ts` — rename `describe('arrays-jwt dispatch')` and its
  four `dispatch(client, ['arrays-jwt', …])` calls.
- `README.md` — update "Arrays JWT" section's two `alva arrays-jwt …`
  code lines.

### Unchanged (deliberately)

- `src/resources/arraysJwt.ts`, class `ArraysJwtResource`, getter
  `client.arraysJwt` — CLI-internal, no rename.
- `src/types.ts` `EnsureArraysJwtResponse` / `ArraysJwtStatusResponse`.
- `src/cli/postConfigureHooks.ts` hook name `'ensureArraysJwt'` and
  "Arrays JWT provisioned/already current" stderr prose.
- `whoami` output field `_meta.arrays_jwt` (public JSON surface).

### Reference files for implementation

- Dispatch pattern: existing `case 'arrays-jwt'` at
  `src/cli/index.ts:1156-1170` is the direct starting point; just
  extend one level.
- Help text pattern: `COMMAND_HELP['auth']` (line 102) — two-level help
  (group + subcommand listing) that we mirror for `'arrays'`.
- Test pattern: existing `arrays-jwt dispatch` describe at
  `test/cli.test.ts:1332-1375` — copy structure, change arg arrays.

### Risks

- Low. Feature is one day old; no known external consumers.
- Help-text discovery: someone who learned `arrays-jwt` yesterday will
  hit an error. The error message names available commands via the
  top-level help path, so recovery is obvious.

## 4. Change Specification

### Affected modules and services

**toolkit-ts** (single-service)

- **Code:**
  - `src/cli/index.ts` — HELP_TEXT verb-line edit (arrays-jwt line →
    `arrays`), delete `COMMAND_HELP['arrays-jwt']`, add
    `COMMAND_HELP['arrays']` covering the full `arrays token …`
    surface, replace `case 'arrays-jwt'` dispatch branch with
    `case 'arrays'` that handles the extra nesting level + its own
    help shortcut for `arrays token --help`, update the two prose
    cross-refs in `COMMAND_HELP['configure']` (line 78) and
    `COMMAND_HELP['whoami']` (line 117).
  - `test/cli.test.ts` — rename `describe('arrays-jwt dispatch')`
    block, update four `dispatch(client, ['arrays-jwt', …])` calls
    to `['arrays', 'token', …]`, add two new cases: `arrays --help`
    and removed-verb-error for `arrays-jwt`.
  - `README.md` — edit two `alva arrays-jwt …` code lines (63-64) to
    `alva arrays token …`. Heading "Arrays JWT" stays (backend concept
    is unchanged).
- **Deployment:** none — no env vars, no config schema, no npm deps.
- **Verified:** `rg "arrays-jwt|arraysJwt" code/public/toolkit-ts/src` —
  the only CLI-verb-string matches are in `src/cli/index.ts`. Internal
  SDK names (`arraysJwt`, `ArraysJwtResource`) deliberately untouched.

No other service in the monorepo touches the CLI verb string.
`rg "arrays-jwt"` outside toolkit-ts returns only backend/gateway REST
route paths (`/api/v1/arrays-jwt/*`) which stay as-is.

### API changes

- **CLI (user-visible):**
  - Removed: `alva arrays-jwt ensure`, `alva arrays-jwt status`,
    `alva arrays-jwt --help`.
  - Added: `alva arrays token ensure`, `alva arrays token status`,
    `alva arrays --help`, `alva arrays token --help`.
- **SDK:** none. `client.arraysJwt.ensure()` / `status()` unchanged.
- **Wire protocol:** none. REST paths unchanged.
- **JSON output:** none. `_meta.arrays_jwt` in `whoami` unchanged.

### Database impact

None.

### Config / env

None.

### Backward compatibility

**Breaking at the CLI verb level.** `alva arrays-jwt …` commands stop
working and return the standard `Unknown command: 'arrays-jwt'` error.
Accepted per premise P5 (feature is one day old; no deprecation alias).

### Error path table

| Codepath                                 | What can go wrong | Handling                                                                                    | User sees                            |
| ---------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| `dispatch('arrays', 'token', 'ensure')`  | resource throws   | normal CLI error path (unchanged)                                                           | `AlvaError` to stderr, exit non-zero |
| `dispatch('arrays', 'token', 'status')`  | resource throws   | same                                                                                        | same                                 |
| `dispatch('arrays', 'token', <unknown>)` | unknown leaf      | throw `Error("Unknown subcommand 'arrays token <x>'. Use 'alva arrays --help' for usage.")` | stderr + exit non-zero               |
| `dispatch('arrays', <unknown>)`          | unknown subgroup  | throw similar error mentioning `arrays` and `--help`                                        | stderr + exit non-zero               |
| `dispatch('arrays')` (no subgroup)       | missing subgroup  | show help (mirror `auth` pattern line 1303)                                                 | help text on stdout                  |
| `dispatch('arrays-jwt', …)`              | removed verb      | falls through to existing `default: Unknown command` branch                                 | stderr + exit non-zero               |

No silent-failure rows.

## 5. Testability Design & Test Plan

### Testability design

- **Single seam:** `dispatch(client, argv)` — exact same entry point as
  all existing CLI tests. `makeClient()` already in `test/cli.test.ts`
  with mocked `arraysJwt.ensure` / `status`.
- **Isolation:** no filesystem, no network, no real stderr. All tests
  are pure in-memory invocations.
- **No new seams needed.** The rename is entirely within `dispatch`;
  the existing test harness covers it.

### Coverage diagram

```
[*] src/cli/index.ts (modified)
    |
    +-- dispatch(group='arrays', sub='token', leaf='ensure')
    |   +-- [PLAN] calls client.arraysJwt.ensure              -- test/cli.test.ts
    |
    +-- dispatch(group='arrays', sub='token', leaf='status')
    |   +-- [PLAN] calls client.arraysJwt.status              -- test/cli.test.ts
    |
    +-- dispatch(group='arrays', sub='token', leaf='bogus')
    |   +-- [PLAN] throws error mentioning 'arrays token' + '--help' -- test/cli.test.ts
    |
    +-- dispatch(group='arrays', '--help')
    |   +-- [PLAN] returns help text for arrays namespace     -- test/cli.test.ts
    |
    +-- dispatch(group='arrays', sub='token', '--help')
    |   +-- [PLAN] returns help text (same content)           -- test/cli.test.ts
    |
    +-- dispatch(group='arrays-jwt', …)  (removed)
        +-- [PLAN] throws with standard "Unknown command"     -- test/cli.test.ts
```

Zero gaps.

### Test cases

All additions/modifications live in `test/cli.test.ts`. Rename the
existing `describe('arrays-jwt dispatch')` block to
`describe('arrays token dispatch')` and rewrite its four tests; add two
new tests.

| #   | Test case                          | Input                                                                            | Expected                                                                                               |
| --- | ---------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | ensure dispatches correctly        | `dispatch(client, ['arrays', 'token', 'ensure'])` with mocked `arraysJwt.ensure` | `arraysJwt.ensure` called once; return value equals mock response                                      |
| 2   | status dispatches correctly        | `dispatch(client, ['arrays', 'token', 'status'])` with mocked `arraysJwt.status` | `arraysJwt.status` called once; return equals mock                                                     |
| 3   | unknown leaf throws                | `dispatch(client, ['arrays', 'token', 'bogus'])`                                 | Rejects with error whose message matches `/arrays token/` and `/--help/`                               |
| 4   | unknown subgroup throws            | `dispatch(client, ['arrays', 'bogus'])`                                          | Rejects with error mentioning `arrays` and `--help`                                                    |
| 5   | `arrays --help` returns help       | `dispatch(client, ['arrays', '--help'])`                                         | Returns `{ _help: true, text: string }` where `text` contains both `ensure` and `status`               |
| 6   | `arrays token --help` returns help | `dispatch(client, ['arrays', 'token', '--help'])`                                | Returns `{ _help: true, text: string }` (same content as #5)                                           |
| 7   | old `arrays-jwt` verb rejected     | `dispatch(client, ['arrays-jwt', 'ensure'])`                                     | Rejects with `CliUsageError`/Error whose message matches `/Unknown command/` and contains `arrays-jwt` |

### E2E / integration

**E2E Required: no.** Pure CLI-dispatch rename in a published npm
package; toolkit-ts has no e2e harness and the backend surface is
unchanged. The `makeClient()` + `dispatch()` unit tests already cover
the full flow end-to-end at the CLI layer.

### Security boundary tests

N/a. No auth surface changes.

### Edge cases

- `alva arrays` with no subcommand — should behave like other groups
  that require a subcommand (e.g. `alva fs` throws "Missing subcommand
  for fs"). Kept consistent.
- `alva arrays token` with no leaf — show help (test #6 equivalent, via
  the help shortcut). Or throw "Missing subcommand". Either is
  acceptable; the implementation picks one and the test asserts it.
  **Decision:** mirror the `auth` pattern — bare `arrays token` shows
  the help text.

## 6. Implementation Task List

### Task 1 — Rename CLI verb in tests (TDD red)

**Complexity:** simple
**Dependencies:** none
**Files:** `test/cli.test.ts`

**What to do:** Update the `describe('arrays-jwt dispatch')` block:
rename to `arrays token dispatch`, rewrite the four existing tests to
use `['arrays', 'token', …]` arg arrays, add three new tests (unknown
subgroup, `arrays --help`, old `arrays-jwt` rejected). Tests #5 and #6
both assert help text contains `ensure` and `status`.

**Steps:**

- [ ] Edit the describe block per the test table in §5 (cases 1-7)
- [ ] Run `npm test` — verify tests fail with the expected "Unknown
      command: 'arrays'" or similar (production code still expects
      `arrays-jwt`)
- [ ] Do NOT implement yet

### Task 2 — Implement the rename

**Complexity:** simple
**Dependencies:** Task 1
**Files:** `src/cli/index.ts`

**What to do:**

1. **HELP_TEXT** (line 54): replace the `arrays-jwt  Manage Arrays
JWT provisioning (ensure, status)` row with `arrays      Arrays
backend operations (token ensure, token status)`.
2. **COMMAND_HELP**: delete the `'arrays-jwt'` key (lines 573-585).
   Add a new `'arrays'` key whose text lists the full
   `alva arrays token <ensure|status>` surface with examples. One
   help text serves both `alva arrays --help` and
   `alva arrays token --help`.
3. **Dispatch branch** (replace lines 1156-1170): new
   `case 'arrays'` branch. Inside:
   - If `subcommand === 'token'`: read leaf from `args[2]`. Branch
     `ensure` → `client.arraysJwt.ensure()`, `status` →
     `client.arraysJwt.status()`, otherwise throw
     `Error("Unknown subcommand 'arrays token <x>'. Use 'alva arrays --help' for usage.")`.
   - If `subcommand === '--help' | '-h'` or no subcommand:
     `return { _help: true, text: COMMAND_HELP['arrays'] }`.
   - Otherwise: throw `Error("Unknown subcommand 'arrays <x>'. Use 'alva arrays --help' for usage.")`.
   - Also handle `subcommand === 'token'` with `args[2] === '--help'`:
     return the same help object.
4. **Cross-refs:** update `COMMAND_HELP['configure']` (line 78) —
   change `alva arrays-jwt ensure` to `alva arrays token ensure`.
   Update `COMMAND_HELP['whoami']` (line 117) — the `_meta.arrays_jwt`
   description is unchanged (that's the JSON field), but if the prose
   references the CLI verb anywhere, update.

**Steps:**

- [ ] Apply the five edits above
- [ ] `npm test` — all 7 test cases from §5 pass, plus all existing
      tests still pass (the rename didn't break anything else)
- [ ] `npm run lint && npm run format:check && npm run typecheck && npm run build`

### Task 3 — Update README

**Complexity:** simple
**Dependencies:** Task 2
**Files:** `README.md`

**What to do:** In the "Arrays JWT" section (lines 53-67), update the
two code-block lines from `alva arrays-jwt ensure` / `alva arrays-jwt
status` to `alva arrays token ensure` / `alva arrays token status`.
Heading and surrounding prose unchanged (the backend concept is still
an Arrays JWT).

**Steps:**

- [ ] Edit the two lines
- [ ] `npm run format:check`

### Dependency graph

```
Task 1 (test red) ── Task 2 (implement) ── Task 3 (README)
```

Sequential. No parallelism benefit.
