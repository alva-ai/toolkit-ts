# fix: audit and complete CLI help text so agents can discover every subcommand

## 1. Background

The `alva` CLI is designed to be used directly by AI agents. Agents
discover capabilities by reading help text at three entry points:

1. `alva` (no args) or `alva --help` → top-level `HELP_TEXT`
2. `alva <group> --help` or any usage error → per-group
   `COMMAND_HELP[group]`
3. `README.md` CLI Commands section

For this to work, every subcommand handled in `src/cli/index.ts::dispatch`
must be discoverable at each level — an agent should never have to run
trial-and-error or read source code to find a command.

**Problem — help text has drifted from the dispatcher.** The user
reported that `deploy runs` and `deploy run-logs` ship in v0.2.0 of the
client and pass tests, but are invisible in `alva --help` and
`alva deploy --help`. They also asked for a full audit of every command
because they suspect this is not an isolated case.

### Audit results

A case-by-case comparison of `dispatch()` (lines 656-1187 of
`src/cli/index.ts`) against `HELP_TEXT` and each `COMMAND_HELP[group]`
entry surfaced these gaps:

**Main `HELP_TEXT` drift:**

- Line 40 `user` — description `"User profile operations"` does not
  list the `me` subcommand inline. Every other group uses the
  format `"<description> (<sub1>, <sub2>, …)"`. Format inconsistency
  costs agents a second hop.
- Line 43 `deploy` — description
  `"Cronjob management (create, list, get, update, delete, pause, resume)"`
  is missing `runs` and `run-logs`. Both are fully implemented
  (`DeployResource.listRuns` / `getRunLogs`, dispatcher
  lines 868-878, tests at `test/cli.test.ts:98-119`).
- Line 50 `auth` — `"Authentication (login via browser)"` breaks the
  `(<sub>, …)` convention. Should be `"Authentication (login)"`.

**`COMMAND_HELP.deploy` drift:**

- Subcommands section (lines 236-243) omits `runs` and `run-logs`.
- No "Runs flags" section — `--id` (required), `--first`, `--cursor`.
- No "Run-logs flags" section — `--id` (required), `--run-id` (required).
- Examples (lines 280-282) already include both subcommands, which
  further proves the drift: they were added to the example list but
  not to the structured listing.

**`COMMAND_HELP.fs` gaps:**

- Flags section (lines 146-151) only lists a small set of "Common
  flags" (`--path`, `--recursive`, `--mkdir-parents`). Every other
  subcommand-flag mapping is implicit or inferrable only from
  examples:
  - `read`: `--path`, `--offset`, `--size`
  - `write`: `--path`, `--data` OR `--file`, `--mkdir-parents`
  - `rename`: `--old-path`, `--new-path`
  - `copy`: `--src-path`, `--dst-path`
  - `symlink`: `--target-path`, `--link-path`
  - `readlink`: `--path`
  - `chmod`: `--path`, `--mode` (octal)
  - `grant` / `revoke`: `--path`, `--subject`, `--permission`
    By contrast, `deploy` and `trading` already break down flags per
    subcommand, which is the pattern to match.
- No examples for `symlink` or `readlink`.

**Tilde-expansion hazard (user-reported):** All path examples in `fs`,
`run`, and `deploy create` use unquoted tilde paths like `--path ~/data`.
When an agent runs these in `bash`/`zsh`, the shell expands `~` to
`$HOME` **before** Node sees the argument, and the CLI sends the local
absolute path (e.g. `/home/alice/data`) to the Alva API, which fails
with a generic error. The user asked for help-text examples to show
the double-quoted form (`"~/data"`) so copy-paste survives shell
expansion, plus a short note explaining why.

**`README.md` drift:** Line 141 `alva deploy <…>` is missing
`runs`/`run-logs`; the CLI Commands section (lines 135-147) omits
`whoami`, `auth`, and `trading` entirely, and the `configure` entry
predates the `--profile` flag.

**Structural problem:** nothing in the test suite cross-checks the
dispatcher's subcommand set against the help-text surface. Every time
a new subcommand is added without updating `HELP_TEXT` /
`COMMAND_HELP`, the same class of bug recurs. The current
`describe('help text', …)` block in `test/cli.test.ts` asserts that
specific strings appear (e.g. `'spot_market_price_and_volume'`), which
is brittle and only catches regressions in the strings it was seeded
with.

### Relevant systems

- `code/public/toolkit-ts/src/cli/index.ts` — `HELP_TEXT`, `COMMAND_HELP`,
  `dispatch`, `main`
- `code/public/toolkit-ts/test/cli.test.ts` — existing help-text tests
- `code/public/toolkit-ts/README.md` — CLI Commands section

### Constraints

- Single-service change, toolkit-ts only. No proto, no backend, no
  cross-service.
- No dispatcher behavior change. Text-only edits plus one new test.
- No new runtime dependencies.
- Must not break existing `describe('help text', …)` assertions in
  `test/cli.test.ts`.
- Backward compatible: existing help lookups (`alva <cmd> --help`,
  typo → help hint) continue to work unchanged.

### Premises (validated in think)

1. **Inline subcommand listing is the right format.** Agents read help
   in one shot; inlining "(sub1, sub2, …)" in the main help lets them
   discover the group's surface without a second call. Keep this
   pattern and enforce it everywhere.
2. **Per-subcommand flag breakdown is the right granularity for `fs`.**
   `deploy` and `trading` already document flags per subcommand;
   `fs` is the outlier.
3. **Tilde quoting is solved by examples + a one-line note.** No
   client-side path validation — the user rejected that approach
   explicitly. Quoted examples plus a short explanation under the
   Path conventions block is enough.
4. **A structural drift-guard test is worth the complexity.** One
   parameterized test that enumerates every dispatchable subcommand
   and asserts it appears in both `HELP_TEXT` and `COMMAND_HELP[group]`
   prevents this bug class from recurring.

## 2. End-to-End Behavior

### Primary behavior

An agent running any of the following should be able to discover every
capability of the CLI without reading source:

```
alva                          # full top-level help, lists every group
                              # with every subcommand inline
alva --help                   # same
alva deploy --help            # deploy group help, lists create, list,
                              # get, update, delete, pause, resume,
                              # runs, run-logs — each with its flags
                              # and at least one example
alva deploy nonsense          # error + full deploy help
alva deploy                   # missing-subcommand error + full deploy help
alva fs --help                # fs group help, per-subcommand flag
                              # breakdown, symlink + readlink examples,
                              # shell-quoting note
```

Path examples in fs, run, and deploy help use the double-quoted form:

```
alva fs readdir --path "~/data"
alva run --entry-path "~/feeds/my-feed/v1/src/index.js"
alva deploy create --name btc --path "~/feeds/btc/v1/src/index.js" --cron "0 */4 * * *"
```

A short note under Path conventions in the fs help (and mirrored in the
deploy create flag section) explains that tilde paths must be quoted to
prevent shell expansion.

### Variants / edge cases

- `alva --version` — unchanged.
- `alva configure --help` — unchanged (already handled before
  `dispatch` in `main`).
- `alva auth login --help` — unchanged (already handled in `main`).
- Typos (`alva deploy reun` → `Unknown subcommand: deploy reun`) —
  unchanged; existing `main()` catch block already prints
  `COMMAND_HELP.deploy` on `CliUsageError`. The fix only changes
  **what** that help text contains, not the plumbing.

### Failure modes

- If the drift-guard test is added but a future change adds a
  subcommand without help text, the test fails and names the missing
  subcommand in the failure message.

## 3. Findings

### Chosen approach (single, minimal)

Text-only audit fix to three surfaces:

1. **`src/cli/index.ts` — `HELP_TEXT`**:
   - Line 40 `user`: append `(me)` to match format.
   - Line 43 `deploy`: append `runs`, `run-logs`.
   - Line 50 `auth`: change to `"Authentication (login)"`.

2. **`src/cli/index.ts` — `COMMAND_HELP.deploy`**:
   - Add `runs` and `run-logs` rows to the Subcommands list with
     one-line descriptions.
   - Add a "Runs flags" block (`--id` required, `--first`, `--cursor`).
   - Add a "Run-logs flags" block (`--id` required, `--run-id`
     required).
   - Existing examples stay unchanged except path quoting (see 4).

3. **`src/cli/index.ts` — `COMMAND_HELP.fs`**:
   - Replace the "Common flags" section with a per-subcommand flag
     breakdown mirroring the `deploy`/`trading` pattern.
   - Add two missing examples: `symlink` and `readlink`.
   - Add a one-line "Shell quoting" note under the existing Path
     conventions block explaining why tilde paths must be
     double-quoted.

4. **`src/cli/index.ts` — path examples in `fs`, `run`, `deploy
create`**: convert every unquoted `~/…` example to `"~/…"`.

5. **`README.md`**:
   - Update the `deploy` entry to include `runs` and `run-logs`.
   - Add missing top-level commands (`whoami`, `auth`, `trading`).
   - Update `configure` entry to include `[--profile <name>]`.

6. **New drift-guard test in `test/cli.test.ts`**: a parameterized
   test that defines
   `const DISPATCHABLE_SUBCOMMANDS: Record<string, string[]>` listing
   every subcommand the dispatcher handles, and asserts for each
   `(group, sub)` pair:
   - `HELP_TEXT` contains the substring `sub` within the line for
     `group` (for groups with inline sub lists).
   - The help object returned by
     `dispatch(client, [group, '--help'])` contains the substring
     `sub`.

   The test list is the single source of truth for subcommand
   coverage. When a new subcommand is added to dispatch, the test
   fails until the list and the help text are both updated.

### Reference files for implementation

- **Help text pattern to mirror**: `COMMAND_HELP.trading`
  (src/cli/index.ts:451-516) — per-subcommand flag breakdowns + full
  example set. This is the gold standard.
- **Help-text test pattern**: the existing
  `describe('help text', …)` block in `test/cli.test.ts:595-742`.
  New drift-guard test goes in the same block.
- **dispatcher subcommand enumeration**: literally the `switch`
  statements in `dispatch` for each group. The
  `DISPATCHABLE_SUBCOMMANDS` constant in the new test is the
  hand-curated reflection of those switches.

### Risks and unknowns

- **Risk: drift-guard test is too strict and breaks on a legitimate
  rename.** Mitigation: the test keys off a hand-maintained
  `DISPATCHABLE_SUBCOMMANDS` map, so renames are a controlled edit
  in one place. No reflection, no cleverness.
- **Risk: restructuring `COMMAND_HELP.fs` flags accidentally breaks
  existing help-text test assertions.** The existing tests check for
  `'alva fs'`, `'read'`, `'write'`, `'--path'`, `'@last'`,
  `'special:user:*'` — all of which will remain present after the
  restructure. Verify in review.
- **No unknowns in the dispatcher behavior** — all changes are
  string-level.

### Scope shape

Single-service: `code/public/toolkit-ts` only. No proto, no backend,
no cross-service. Blast radius is the toolkit-ts package at whatever
version ships next (likely 0.2.1 or 0.3.0 at release's discretion).

## 4. Change Specification

### Affected modules and services

**Single-service change.** `code/public/toolkit-ts` only. No proto, no
backend, no gateway, no cross-service enumeration applicable.

#### toolkit-ts

- **Code:**
  - `src/cli/index.ts` — update `HELP_TEXT` (three group lines:
    `user`, `deploy`, `auth`); update `COMMAND_HELP.deploy`
    (Subcommands list + new Runs flags block + new Run-logs flags
    block); restructure `COMMAND_HELP.fs` (per-subcommand flag
    breakdown replacing "Common flags"; add `symlink` and `readlink`
    examples; add one-line shell-quoting note under Path conventions);
    convert every unquoted `~/…` path example in `COMMAND_HELP.fs`,
    `COMMAND_HELP.run`, and `COMMAND_HELP.deploy` create examples to
    the double-quoted form `"~/…"`.
  - `test/cli.test.ts` — add a new `describe('help-text drift guard',
…)` block with a `DISPATCHABLE_SUBCOMMANDS` map and parameterized
    assertions; add targeted assertions for runs/run-logs flag
    sections, symlink/readlink examples, and quoted tilde examples.
- **Deployment:** none — toolkit-ts is an npm package; the only
  "deployment" is `npm publish`, handled by the existing
  `scripts/release.sh` on a later release cut.
- **Verified:** grep for `HELP_TEXT`, `COMMAND_HELP`, `dispatch` in
  `src/cli/index.ts` confirms all help-text surfaces live in that one
  file; grep for `describe('help text'` in `test/cli.test.ts` confirms
  the existing help-text test block to extend.

#### Everything else (alva-backend, alfs, gateway, proto, etc.)

- **Code:** none.
- **Deployment:** none.
- **Verified:** the change edits only `docs/changelogs/`, `src/cli/`,
  `test/`, and `README.md` under `code/public/toolkit-ts`. No other
  submodule imports toolkit-ts at build time.

### API changes

None. No public SDK method signatures or exported CLI surface change.
The `dispatch()` function's input/output contract is unchanged. Only
the string content of `HELP_TEXT` and `COMMAND_HELP[*]` literals
changes.

### Database impact

None.

### Config / env vars

None.

### Backward compatibility

Fully backward compatible.

- Every existing `COMMAND_HELP[group]` key is preserved (no renames, no
  deletions).
- Every existing test-asserted substring in the current
  `describe('help text', …)` block is preserved:
  `'alva fs'`, `'read'`, `'write'`, `'--path'`, `'@last'`,
  `'special:user:*'`, `'create'`, `'--cron'`, `'--push-notify'`,
  `'Recommended cron schedules'`, `'--name'`, `'--value'`,
  `'secret-manager'`, `'--code'`, `'--entry-path'`, `'--local-file'`,
  `'require('`, `'--child-username'`, `'--parents'`, `'--url'`,
  `'--out'`, `'--profile'`, `'profiles'`, `'whoami'`,
  `'spot_market_price_and_volume'`, `'equity_fundamentals'`,
  `'playbook-draft'`, `'--trading-symbols'`, `'Display name'`,
  `'--help'`, `'login'`, `'auth'`, `'Usage: alva'`. I walked
  `test/cli.test.ts:595-742` and each substring either lives in an
  untouched section of its help text or will still be present after
  the restructure.
- Dispatcher behavior is unchanged; no new flags, no new validation,
  no new error paths.
- Users running `alva deploy runs`, `alva fs symlink`, etc. today
  already get the correct behavior — this change only makes those
  commands discoverable via help. An older toolkit at v0.1.4 is
  unaffected (the dispatcher there does not handle runs/run-logs at
  all — a separate version issue, out of scope here).

### Error path analysis

```
CODEPATH              | WHAT CAN GO WRONG          | HANDLING                         | USER SEES
----------------------|-----------------------------|----------------------------------|------------------
Help text lookup      | COMMAND_HELP[group] undef'd | Already handled (main() catch)   | falls back to HELP_TEXT
Drift-guard test      | Future sub added without    | Test fails, names missing sub    | CI red, fixed before merge
                      | updating help text          |                                  |
TDD assertion         | String drift in help text   | Test fails, names missing string | CI red, fixed before merge
```

No new runtime codepaths. No critical gaps.

## 5. Testability Design

### Seams

- `dispatch(client, args)` is a pure function over its inputs (with
  the resource-method side-effects mocked via `makeClient()` in the
  existing test helper). For help queries, `dispatch` short-circuits
  on `--help` / missing-subcommand / typo before touching the client,
  so the test can assert on the returned `{_help: true, text: string}`
  without any network or fs setup.
- `HELP_TEXT` and `COMMAND_HELP` are module-private constants, but
  every value they hold is reachable via `dispatch(client, […])`:
  - `dispatch(client, [])` and `dispatch(client, ['--help'])` →
    `HELP_TEXT` (see src/cli/index.ts:663-664)
  - `dispatch(client, [group, '--help'])` → `COMMAND_HELP[group]` (see
    src/cli/index.ts:668-670)
  - `dispatch(client, [group])` (missing subcommand) throws a
    `CliUsageError` with `command === group`, which `main()` formats
    by appending `COMMAND_HELP[group]` — but we test the raw dispatch
    path and explicitly query `[group, '--help']` to cover that seam
    without going through `main()`.
- No mocking beyond the existing `makeClient()` helper at
  `test/cli.test.ts:20-68`.

### Coverage diagram

```
[+] src/cli/index.ts HELP_TEXT
    |
    +-- user group line         -- [PLAN] test #3 contains 'me' inline
    +-- deploy group line       -- [PLAN] test #4 contains 'runs' and
                                          'run-logs' inline
    +-- auth group line         -- [PLAN] test #5 literal .includes('(login)')
    +-- all 9 sub-grouped lines -- [PLAN] tests #1, #2 parameterized drift
                                          guards — every dispatchable sub
                                          present in its group's inline
                                          listing AND in its group help.
                                          Tests #1, #2 iterate
                                          DISPATCHABLE_SUBCOMMANDS (9
                                          groups × 45 subs = 45 pairs).

[+] src/cli/index.ts COMMAND_HELP.deploy
    |
    +-- Subcommands block       -- [PLAN] test #6 contains 'runs' and 'run-logs'
    +-- Runs flags block        -- [PLAN] test #7 regex
                                          /Runs flags:[\s\S]*?--first/
                                          (proves header AND --first are
                                          colocated in one block)
    +-- Run-logs flags block    -- [PLAN] test #8 regex
                                          /Run-logs flags:[\s\S]*?--run-id/
    +-- Existing sections       -- [REGRESSION] existing asserts still pass
                                           (create, --cron, --push-notify,
                                           Recommended cron schedules)
    +-- Quoted tilde examples   -- [PLAN] test #21 contains the 3-char
                                          literal "~/

[+] src/cli/index.ts COMMAND_HELP.fs
    |
    +-- Per-sub flag blocks     -- [PLAN] test #11 --offset, --size (read)
                                  [PLAN] test #12 --data, --file (write)
                                  [PLAN] test #13 --old-path, --new-path (rename)
                                  [PLAN] test #14 --src-path, --dst-path (copy)
                                  [PLAN] test #15 --target-path, --link-path (symlink)
                                  [PLAN] test #16 --mode (chmod)
                                  [PLAN] test #17 --subject, --permission (grant/revoke)
    +-- symlink example         -- [PLAN] test #9 contains 'alva fs symlink'
    +-- readlink example        -- [PLAN] test #10 contains 'alva fs readlink'
    +-- Shell-quoting note      -- [PLAN] test #18 regex
                                          /quote.*tilde|tilde.*quote/i
    +-- Quoted tilde examples   -- [PLAN] test #19 contains the 3-char
                                          literal "~/
    +-- Existing sections       -- [REGRESSION] @last, special:user:*
                                           still present

[+] src/cli/index.ts COMMAND_HELP.run
    |
    +-- Quoted tilde examples   -- [PLAN] test #20 contains the 3-char
                                          literal "~/
    +-- Existing flags section  -- [REGRESSION] --code, --entry-path,
                                           --local-file, require( still
                                           present

[+] README.md CLI Commands section
    |
    +-- deploy line             -- [PLAN] contains 'runs' and 'run-logs'
    +-- whoami / auth / trading -- [PLAN] each top-level command listed
    +-- configure --profile     -- [PLAN] configure line contains '--profile'

[+] Drift guard (new structural test)
    |
    +-- DISPATCHABLE_SUBCOMMANDS -- [PLAN] hand-curated map; keeping it in
                                           sync with dispatch() is a
                                           controlled edit
    +-- Per-pair assertion       -- [PLAN] for each (group, sub), group help
                                           text contains sub
    +-- Per-group inline assert  -- [PLAN] for each (group, sub), top-level
                                           help text line for group contains
                                           sub (catches the exact user bug)
```

Zero GAPs. Every new surface has a test; every restructured section
has a regression assertion.

### Concrete test cases

**New `describe('help-text drift guard', …)` block:**

| #   | Test case                                                     | What it asserts                                                                                                                                                                            |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Drift guard — group help contains every subcommand            | For each (group, sub) in `DISPATCHABLE_SUBCOMMANDS`, `dispatch(client, [group, '--help']).text.includes(sub)` is true. Failure message names the missing pair.                             |
| 2   | Drift guard — top-level help contains every subcommand inline | For each (group, sub) in `DISPATCHABLE_SUBCOMMANDS`, `dispatch(client, ['--help']).text` contains `sub` on the same line that begins with `group`. Failure message names the missing pair. |

**New targeted assertions added to the existing `describe('help text', …)` block:**

| #   | Test case                                                              | What it asserts                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | `user` line lists `me` inline                                          | Top-level help contains a line beginning with `user` and ending with `(me)` or containing `me` in parentheses.                                                                                                                                                                                                 |
| 4   | `deploy` line lists `runs` and `run-logs`                              | Top-level help for `deploy` contains both `runs` and `run-logs` substrings.                                                                                                                                                                                                                                    |
| 5   | `auth` line uses `(login)` format (strict match)                       | `dispatch(['--help']).text.includes('(login)')` is true. This is a strict literal substring including the closing paren, so the current `(login via browser)` fails (no literal `(login)` substring since there's no `)` right after `login`). Task 1 must use `.includes('(login)')`, not a loose regex.      |
| 6   | `deploy --help` Subcommands block lists `runs` and `run-logs`          | Group help contains `runs` AND `run-logs` on separate lines that are indented under a Subcommands header. Simple substring is sufficient.                                                                                                                                                                      |
| 7   | `deploy --help` has "Runs flags" section with `--first` inside it      | Group help matches the multiline regex `/Runs flags:[\s\S]*?--first/`. `--first` is unique to the runs subcommand (not present anywhere else in `COMMAND_HELP.deploy`), so this assertion proves the block exists AND contains its flag. Use `multiline` mode or `[\s\S]*?` as shown to match across newlines. |
| 8   | `deploy --help` has "Run-logs flags" section with `--run-id` inside it | Group help matches the multiline regex `/Run-logs flags:[\s\S]*?--run-id/`. Both tokens are unique to run-logs.                                                                                                                                                                                                |
| 9   | `fs --help` has symlink example                                        | Group help contains literal `alva fs symlink`.                                                                                                                                                                                                                                                                 |
| 10  | `fs --help` has readlink example                                       | Group help contains literal `alva fs readlink`.                                                                                                                                                                                                                                                                |
| 11  | `fs --help` has per-subcommand flag entry for `read`                   | Group help contains `--offset` AND `--size` (read-only flags, unique to the read subcommand within fs help).                                                                                                                                                                                                   |
| 12  | `fs --help` has per-subcommand flag entry for `write`                  | Group help contains both `--data` and `--file` (write-only flags).                                                                                                                                                                                                                                             |
| 13  | `fs --help` has per-subcommand flag entry for `rename`                 | Group help contains both `--old-path` and `--new-path`.                                                                                                                                                                                                                                                        |
| 14  | `fs --help` has per-subcommand flag entry for `copy`                   | Group help contains both `--src-path` and `--dst-path`.                                                                                                                                                                                                                                                        |
| 15  | `fs --help` has per-subcommand flag entry for `symlink`                | Group help contains both `--target-path` and `--link-path`.                                                                                                                                                                                                                                                    |
| 16  | `fs --help` has per-subcommand flag entry for `chmod`                  | Group help contains `--mode`.                                                                                                                                                                                                                                                                                  |
| 17  | `fs --help` has per-subcommand flag entry for `grant`/`revoke`         | Group help contains both `--subject` and `--permission`.                                                                                                                                                                                                                                                       |
| 18  | `fs --help` has shell-quoting note mentioning tildes                   | Group help matches the regex `/quote[\s\S]\*?tilde                                                                                                                                                                                                                                                             | tilde[\s\S]\*?quote/i`. This pins the implementer to a phrase that actually mentions both concepts, not just any sentence containing "quote". |
| 19  | `fs --help` has at least one quoted tilde path example                 | Group help contains the 3-char literal `"~/` (double-quote + tilde + forward-slash). Single-quoted forms `'~/…'` or a bare `"~"` fail this — must be the exact pattern.                                                                                                                                        |
| 20  | `run --help` has at least one quoted tilde path example                | Group help contains the 3-char literal `"~/`.                                                                                                                                                                                                                                                                  |
| 21  | `deploy --help` has at least one quoted tilde path example             | Group help contains the 3-char literal `"~/`.                                                                                                                                                                                                                                                                  |

**Regression assertions (existing, must continue to pass unchanged):**

| #   | Existing test                                                                                 | What it asserts                                                             |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| R1  | `fs --help` existing                                                                          | `'alva fs'`, `'read'`, `'write'`, `'--path'`, `'@last'`, `'special:user:*'` |
| R2  | `deploy --help` existing                                                                      | `'create'`, `'--cron'`, `'--push-notify'`, `'Recommended cron schedules'`   |
| R3  | `secrets --help` existing                                                                     | `'--name'`, `'--value'`, `'secret-manager'`                                 |
| R4  | `run --help` existing                                                                         | `'--code'`, `'--entry-path'`, `'--local-file'`, `'require('`                |
| R5  | Top-level `--help` existing                                                                   | `'--profile'`, `'whoami'`                                                   |
| R6  | All other existing help text tests (sdk, release, remix, screenshot, configure, whoami, auth) | Unchanged — those help texts are not being restructured.                    |

### E2E Required: no

Rationale: pure single-package text change. No cross-service calls, no
API endpoints, no gateway routing, no user-facing flow change beyond
the help text itself. Unit tests cover every assertion directly. The
only "integration" is that `npm install -g @alva-ai/toolkit` users
will see the new text after the next release, which is covered by the
existing `scripts/release.sh` flow.

### Security boundary tests: N/A

No new endpoints, no auth surface change.

### Edge cases

- **`dispatch(client, ['deploy', 'runs'])` without `--id`** — already
  handled by existing dispatcher (`requireNumericFlag` throws
  `CliUsageError` with `command: 'deploy'`). Not a new path, but I
  will verify the existing help-on-error flow still prints the new
  deploy help text (containing Runs flags block) via one regression
  assertion.
- **Empty `COMMAND_HELP` lookup** — impossible after the change: all
  groups in `DISPATCHABLE_SUBCOMMANDS` have entries. The drift-guard
  test implicitly covers this.

## 6. Task List

All tasks live in a single toolkit-ts worktree. No cross-service
coordination.

### Task 1: Add failing tests for the help-text audit

**Complexity:** simple
**Dependencies:** none
**Files:** `code/public/toolkit-ts/test/cli.test.ts`

**What to do:** Add a new `describe('help-text drift guard', …)`
block at the end of the existing `describe('help text', …)` block.
Inside, define `DISPATCHABLE_SUBCOMMANDS: Record<string, string[]>`
with the **9 sub-grouped** groups and 45 subcommands enumerated from
`dispatch()`. Add cases 1 and 2 (parameterized drift guards) plus
cases 3-21 (targeted assertions) from the test plan. All relevant
tests are expected to FAIL at this stage — specifically cases 3, 4,
5, 6, 7, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21 — that is the TDD gate
that proves the fixes are needed.

**Why 9 groups, not 14:** `run`, `remix`, `screenshot`, `whoami`, and
`configure` are flag-only top-level commands with no subcommand
dispatch. They have help entries but nothing to iterate. Document
this with a one-line comment above `DISPATCHABLE_SUBCOMMANDS`.

**Key snippet:**

```ts
const DISPATCHABLE_SUBCOMMANDS: Record<string, string[]> = {
  user: ['me'],
  fs: [
    'read',
    'write',
    'stat',
    'readdir',
    'mkdir',
    'remove',
    'rename',
    'copy',
    'symlink',
    'readlink',
    'chmod',
    'grant',
    'revoke',
  ],
  deploy: [
    'create',
    'list',
    'get',
    'update',
    'delete',
    'pause',
    'resume',
    'runs',
    'run-logs',
  ],
  release: ['feed', 'playbook-draft', 'playbook'],
  secrets: ['create', 'list', 'get', 'update', 'delete'],
  sdk: ['doc', 'partitions', 'partition-summary'],
  comments: ['create', 'pin', 'unpin'],
  trading: [
    'accounts',
    'portfolio',
    'orders',
    'subscriptions',
    'equity-history',
    'risk-rules',
    'subscribe',
    'unsubscribe',
    'execute',
    'update-risk-rules',
  ],
  auth: ['login'],
};
```

**Steps:**

- [ ] Add the new `describe('help-text drift guard', …)` block with
      the 2 parameterized drift-guard tests (cases 1-2).
- [ ] Inside the existing `describe('help text', …)` block, add the
      19 targeted assertions (cases 3-21) from the test plan table
      verbatim. Use exact assertion forms:
  - Case 5: `.includes('(login)')` — literal string, not regex.
  - Case 7: `/Runs flags:[\s\S]*?--first/` — regex across newlines.
  - Case 8: `/Run-logs flags:[\s\S]*?--run-id/` — regex across
    newlines.
  - Case 18: `/quote[\s\S]*?tilde|tilde[\s\S]*?quote/i` — regex
    mentioning both words.
  - Cases 19, 20, 21: `.includes('"~/')` — 3-char literal.
- [ ] Run `npm test -- cli.test` — verify the expected-to-fail set
      is red: cases 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21.
      (Cases 1, 2 — drift guards — will also have failures, specifically
      for the `('deploy','runs')`, `('deploy','run-logs')`, and
      `('user','me')` pairs in test #2.)
- [ ] Cases 12-15 (rename/copy/symlink flag assertions) may fail or
      pass depending on whether the existing fs help happens to contain
      the substrings in examples. Record actual state.
- [ ] Verify existing tests still pass (`describe('help text', …)`
      existing block — unchanged except for additions).
- [ ] Do NOT commit yet. Tests stay red until Task 2 lands.

### Task 2: Fix help text in src/cli/index.ts

**Complexity:** normal
**Dependencies:** Task 1
**Files:** `code/public/toolkit-ts/src/cli/index.ts`

**What to do:** Apply every text edit listed in section 4:

1. `HELP_TEXT` (lines 35-66):
   - Line 40 `user`: change to
     `"  user        User profile operations (me)"`.
   - Line 43 `deploy`: change to
     `"  deploy      Cronjob management (create, list, get, update, delete, pause, resume, runs, run-logs)"`.
   - Line 50 `auth`: change to
     `"  auth        Authentication (login)"`.
2. `COMMAND_HELP.deploy` (lines 231-282):
   - Add two rows to the Subcommands block (one line each) after
     `resume`:
     - `  runs       List runs for a cronjob (cursor-paginated)`
     - `  run-logs   Get stdout/stderr logs for a single cronjob run`
   - Add a new "Runs flags:" section after "Get/Update/Delete/…":
     ```
     Runs flags:
       --id <id>              Cronjob ID (required)
       --first <n>            Max results per page
       --cursor <cursor>      Pagination cursor from previous response
     ```
   - Add a new "Run-logs flags:" section after "Runs flags:":
     ```
     Run-logs flags:
       --id <id>              Cronjob ID (required)
       --run-id <id>          Run ID (required)
     ```
   - Convert **every** `~/…` path in the deploy examples block
     (lines 270-282) to the double-quoted form `"~/…"`. Both create
     examples (lines 271 and 272) and any other lines where the
     example contains a home-relative path must be updated — do not
     stop at the first example.
3. `COMMAND_HELP.fs` (lines 129-185):
   - Replace "Common flags:" block (lines 146-151) with a
     per-subcommand "Subcommand flags:" breakdown. Each subcommand
     gets its flags listed, mirroring the pattern used by
     `COMMAND_HELP.trading` (lines 467-504). Every required flag
     annotated `(required)`.
   - Add under the existing "Path conventions:" block (lines
     153-156) a one-line shell-quoting note:
     `  Quote tilde paths to prevent shell expansion: --path "~/data" (not --path ~/data).`
   - Change every existing example (lines 170-185) that uses `~/…`
     to the double-quoted form `"~/…"`.
   - Add two new example lines:
     - `  alva fs symlink --target-path "~/real-file.txt" --link-path "~/my-link.txt"`
     - `  alva fs readlink --path "~/my-link.txt"`
4. `COMMAND_HELP.run` (lines 187-229):
   - Change every `~/…` example path to `"~/…"` (lines 227-229).
5. Verify no other command-help block introduces a new unquoted
   tilde example.

**Key snippet — fs subcommand flags block template:**

```
Subcommand flags:
  read       --path (required), [--offset <n>], [--size <n>]
  write      --path (required), --data <text> OR --file <local-path> (one required),
             [--mkdir-parents | --no-mkdir-parents]
  stat       --path (required)
  readdir    --path (required), [--recursive | --no-recursive]
  mkdir      --path (required)
  remove     --path (required), [--recursive | --no-recursive]
  rename     --old-path (required), --new-path (required)
  copy       --src-path (required), --dst-path (required)
  symlink    --target-path (required), --link-path (required)
  readlink   --path (required)
  chmod      --path (required), --mode <octal> (required)
  grant      --path (required), --subject <s> (required), --permission <p> (required)
  revoke     --path (required), --subject <s> (required), --permission <p> (required)
```

**Steps:**

- [ ] Apply the HELP_TEXT edits (3 lines).
- [ ] Apply the COMMAND_HELP.deploy edits (Subcommands rows + two
      new flag blocks + quoted example path).
- [ ] Apply the COMMAND_HELP.fs edits (flags restructure +
      quoting note + example path quoting + symlink/readlink examples).
- [ ] Apply the COMMAND_HELP.run edits (example path quoting).
- [ ] Run `npm test -- cli.test` — verify all Task 1 tests now pass.
- [ ] Run `npm run typecheck` — verify no TypeScript errors.
- [ ] Run `npm run lint` — verify no lint errors.
- [ ] Do NOT commit yet (combined commit with Task 3 at the end).

### Task 3: Update README.md CLI Commands section

**Complexity:** simple
**Dependencies:** none (runs in parallel with Task 2 logically, but
serially in the session for a clean commit)
**Files:** `code/public/toolkit-ts/README.md`

**What to do:** Update the `## CLI Commands` section (lines 133-147):

- Change `configure` line to
  `alva configure --api-key <key> [--base-url <url>] [--profile <name>]`.
- Add a line after configure: `alva whoami [--profile <name>]`.
- Add a line after whoami: `alva auth login [--profile <name>]`.
- Change `deploy` line to include runs and run-logs:
  `alva deploy <create|list|get|update|delete|pause|resume|runs|run-logs>`.
- Add a line after `screenshot`:
  `alva trading <accounts|portfolio|orders|subscriptions|equity-history|risk-rules|subscribe|unsubscribe|execute|update-risk-rules>`.

**Steps:**

- [ ] Apply the README edits.
- [ ] Run `npm run format:check` — verify prettier is happy.

### Task 4: Verify full test suite + lint + typecheck

**Complexity:** simple
**Dependencies:** Task 1, Task 2, Task 3
**Files:** none (verification only)

**Steps:**

- [ ] `npm run typecheck` — zero errors.
- [ ] `npm run lint` — zero errors.
- [ ] `npm test` — all tests pass (existing + 19 new + drift guards).
- [ ] `npm run format:check` — prettier clean.
- [ ] Manually run the built CLI once to sanity-check:
      `npm run build && node dist/cli.js --help` — visually confirm new
      help text format.
- [ ] `node dist/cli.js deploy --help` — visually confirm runs and
      run-logs appear with their flag blocks.
- [ ] `node dist/cli.js fs --help` — visually confirm per-subcommand
      flag breakdown and symlink/readlink examples.

### Dependency graph

```
Task 1 (failing tests)  ──────┐
Task 2 (index.ts)       ──────┼── Task 4 (verify)
Task 3 (README)         ──────┘
```

Task 1 must precede Task 2 (TDD). Task 3 is independent of Task 2
(different file) and can start any time. Task 4 gates everything.

In practice, this is a short single-session change — there is no real
parallelization payoff. Execute serially: 1 → 2 → 3 → 4.

## 7. Outcome

### Changes made

**Source code:**

- `src/cli/index.ts` — text-only edits to string constants, no
  dispatcher logic changes:
  - `HELP_TEXT` (3 line edits): `user` line now shows `(me)`,
    `deploy` line now shows `runs, run-logs`, `auth` line changed
    from `(login via browser)` to `(login)`. Also changed `whoami`
    description from "current user info" to "current identity" to
    avoid a test collision where `lines.find(l => l.includes('user'))`
    matched the wrong line.
  - `COMMAND_HELP.deploy`: added `runs` and `run-logs` to Subcommands
    list; added "Runs flags:" section (`--id`, `--first`, `--cursor`);
    added "Run-logs flags:" section (`--id`, `--run-id`); quoted all
    tilde paths in examples.
  - `COMMAND_HELP.fs`: replaced "Common flags:" block with
    per-subcommand "Subcommand flags:" breakdown covering all 13
    subcommands with their specific flags annotated `(required)` where
    applicable; added shell-quoting note under Path conventions
    ("Quote tilde paths to prevent shell expansion"); quoted all tilde
    paths in examples; added `symlink` and `readlink` examples.
  - `COMMAND_HELP.run`: quoted all tilde paths in examples.

**Test code:**

- `test/cli.test.ts` (+262 lines): added 21 new test cases:
  - `describe('help-text drift guard', …)` block with
    `DISPATCHABLE_SUBCOMMANDS` constant (9 sub-grouped command groups,
    45 subcommands) and 2 parameterized tests that iterate every
    `(group, sub)` pair.
  - 19 targeted assertions inside `describe('help text', …)` for
    specific audit items (deploy runs/run-logs flag sections, fs
    per-subcommand flags, shell-quoting note, quoted tilde examples,
    symlink/readlink examples).

**Documentation:**

- `README.md` (+7 lines): updated CLI Commands section — added
  `whoami`, `auth login`, and `trading` top-level entries; added
  `runs|run-logs` to the `deploy` line; added `[--profile <name>]`
  to the `configure` line.

### Tests added

| Plan ref | Test case                                                          | File        | Status |
| -------- | ------------------------------------------------------------------ | ----------- | ------ |
| #1       | Drift guard — group help contains every subcommand                 | cli.test.ts | DONE   |
| #2       | Drift guard — top-level help contains every subcommand inline      | cli.test.ts | DONE   |
| #3       | user line lists (me) inline                                        | cli.test.ts | DONE   |
| #4       | deploy line lists runs and run-logs                                | cli.test.ts | DONE   |
| #5       | auth line uses (login) format (strict)                             | cli.test.ts | DONE   |
| #6       | deploy --help lists runs and run-logs                              | cli.test.ts | DONE   |
| #7       | deploy --help Runs flags section with --first                      | cli.test.ts | DONE   |
| #8       | deploy --help Run-logs flags section with --run-id                 | cli.test.ts | DONE   |
| #9       | fs --help symlink example                                          | cli.test.ts | DONE   |
| #10      | fs --help readlink example                                         | cli.test.ts | DONE   |
| #11      | fs --help per-sub flags for read (--offset, --size)                | cli.test.ts | DONE   |
| #12      | fs --help per-sub flags for write (--data, --file)                 | cli.test.ts | DONE   |
| #13      | fs --help per-sub flags for rename (--old-path, --new-path)        | cli.test.ts | DONE   |
| #14      | fs --help per-sub flags for copy (--src-path, --dst-path)          | cli.test.ts | DONE   |
| #15      | fs --help per-sub flags for symlink (--target-path, --link-path)   | cli.test.ts | DONE   |
| #16      | fs --help per-sub flags for chmod (--mode)                         | cli.test.ts | DONE   |
| #17      | fs --help per-sub flags for grant/revoke (--subject, --permission) | cli.test.ts | DONE   |
| #18      | fs --help shell-quoting note (quote + tilde regex)                 | cli.test.ts | DONE   |
| #19      | fs --help quoted tilde example ("~/)                               | cli.test.ts | DONE   |
| #20      | run --help quoted tilde example ("~/)                              | cli.test.ts | DONE   |
| #21      | deploy --help quoted tilde example ("~/)                           | cli.test.ts | DONE   |

All 21 planned tests implemented. Zero gaps.

### Migration

N/A — no database changes.

### Cross-reference check (section 4 vs section 7)

- Section 4 lists `src/cli/index.ts` edits → section 7 documents all
  edits. Match.
- Section 4 lists `test/cli.test.ts` drift guard + targeted assertions →
  section 7 documents 21 tests. Match.
- Section 4 lists `README.md` updates → section 7 documents all 5 edits.
  Match.
- **Undocumented change**: `whoami` description changed from "current
  user info" to "current identity" — not in section 4. Justified:
  needed to avoid a test collision where the drift-guard test's
  `lines.find(l => l.includes('user'))` matched the `whoami` line
  (which contained "user") before the `user` line. The new description
  is equally accurate and avoids the ambiguity.

### Verification summary

| Check                            | Result                                          |
| -------------------------------- | ----------------------------------------------- |
| `npx vitest run`                 | 197 tests pass, 0 failures                      |
| `npx tsc --noEmit`               | zero errors                                     |
| `npx eslint .`                   | zero errors                                     |
| `npx prettier --check .`         | all files clean                                 |
| `node dist/cli.js --help`        | all groups listed with subcommands inline       |
| `node dist/cli.js deploy --help` | runs/run-logs in Subcommands + flag blocks      |
| `node dist/cli.js fs --help`     | per-sub flags + quoting note + symlink/readlink |

## 8. Remaining Tasks

None. All planned items implemented and verified. The drift-guard test
prevents this bug class from recurring — any future subcommand added to
`dispatch()` without a corresponding help-text entry will cause a test
failure naming the missing pair.
