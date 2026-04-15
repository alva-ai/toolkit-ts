# feat: add --local-file flag to alva run

## 1. Background

`alva run --code '<JS>'` is unusable for payloads containing nested quotes,
backslash escapes, or template literals. The outer bash quoting and inner JS
string escaping collide, producing `SyntaxError` at the runtime. Agents
waste multiple round-trips trying different escape strategies.

**Relevant systems:**

- `code/public/toolkit-ts/src/cli/index.ts` — CLI dispatch, flag parsing,
  `run` command handler, `COMMAND_HELP` table
- `code/public/toolkit-ts/src/resources/run.ts` — `RunResource.execute()`
  sends POST `/api/v1/run` with `code` field
- `code/public/toolkit-ts/src/types.ts` — `RunRequest` / `RunResponse`
  interfaces

**Constraints:**

- Single-service change, toolkit-ts only
- No backend API changes — `--local-file` reads a local file and sends its
  contents via the existing `code` field
- `--entry-path` already exists for executing scripts on ALFS (remote).
  `--local-file` is for local filesystem files — the naming must be
  clearly distinct to avoid confusion
- `--local-file` and `--code` are mutually exclusive (both populate the
  same `code` API field)
- `--local-file` and `--entry-path` are mutually exclusive (both tell the
  runtime what to execute)

**Issue:** https://github.com/alva-ai/toolkit-ts/issues/16

## 2. End-to-End Behavior

### Primary behavior

`alva run --local-file ./script.js` reads `./script.js` from the local
filesystem, sends its contents as the `code` field in the POST `/api/v1/run`
request, and returns the execution result. The file content bypasses shell
escaping entirely because it is read by `fs.readFile()`, not parsed as a
shell argument.

### Variants

- `alva run --local-file ./script.js --args '{"x":1}'` — local file with
  args, both work together
- `alva run --local-file ./script.js --working-dir /some/dir` — local file
  with working directory
- `alva run --local-file ./script.js` where script contains arbitrary JS
  (nested quotes, template literals, backslashes) — all pass through cleanly

### Failure modes

- File does not exist → CLI error before API call: "File not found: <path>"
- Both `--code` and `--local-file` provided → CLI error: "Cannot use both
  --code and --local-file"
- Both `--local-file` and `--entry-path` provided → CLI error: "Cannot use
  both --local-file and --entry-path"
- Neither `--code`, `--local-file`, nor `--entry-path` provided → existing
  error unchanged
- File read permission denied → CLI error with OS error message

## 3. Findings

- **Existing run dispatch pattern** (lines 798-804 in index.ts): extracts
  `flags['code']`, `flags['entry-path']`, `flags['working-dir']`,
  `flags['args']` and calls `client.run.execute()`. The new flag adds one
  more extraction + a `readFile` call before the same `execute()`.
- **Flag parsing**: `parseFlags()` handles `--flag value` and `--flag=value`.
  `local-file` is not a boolean flag, so it will be consumed as a string
  value automatically.
- **Help text**: `COMMAND_HELP` has a `run` entry (lines 187-226). Needs
  updating to document `--local-file`.
- **Error handling**: The recent cli-error-help changelog added
  `CliUsageError` for usage errors with help text. The mutual exclusion
  errors should throw `CliUsageError` with `command = 'run'`.
- **Scope shape:** single-service (toolkit-ts only). No API changes.
- **Alternatives considered:**
  - (A) `--local-file` only — chosen. Simplest, fully solves the problem.
  - (B) `--local-file` + `--code-stdin` — rejected as YAGNI. Stdin can be
    added later if needed.
  - (C) Auto-detect file path in `--code` — rejected. Ambiguous: a value
    like `./test.js` could be both valid JS and a file path.

### Reference files for implementation

- **Handler pattern:** `src/cli/index.ts` lines 798-804 — existing `run`
  case in `dispatch()`
- **Test pattern:** `test/cli.test.ts` lines 128-134 — existing
  `dispatches run with --code` test
- **Error pattern:** `src/error.ts` — `CliUsageError` for usage errors

## 4. Change Specification

### Affected modules

- **`src/cli/index.ts`** (modified):
  1. Update `COMMAND_HELP.run` help text to document `--local-file <path>`
     and update the "At least one of" line to include it.
  2. In the `'run'` case of `dispatch()` (line 798): before calling
     `client.run.execute()`, add mutual exclusion checks and file reading:
     - If both `--code` and `--local-file` → `CliUsageError`
     - If both `--local-file` and `--entry-path` → `CliUsageError`
     - If `--local-file` is set → `fs.readFileSync(flags['local-file'], 'utf-8')`
       and pass result as `code` field
     - Uses `readFileSync` (same pattern as `fs write --file` at line 727)

- **`test/cli.test.ts`** (modified):
  Add tests for `--local-file` dispatch and error cases.

### API changes

None. `--local-file` is a CLI convenience — it reads the local file and
sends its contents via the existing `code` field in `RunRequest`.

### Database impact

None.

### Configuration changes

None.

### Backward compatibility

Non-breaking. New flag only. Existing `--code` and `--entry-path` behavior
unchanged.

### Error path analysis

```
METHOD/CODEPATH             | WHAT CAN GO WRONG              | HANDLING                              | USER SEES
----------------------------|--------------------------------|---------------------------------------|------------------------------------------
dispatch() run case         | --code + --local-file both set | CliUsageError('run')                  | Error + run help text
                            | --local-file + --entry-path    | CliUsageError('run')                  | Error + run help text
                            | File does not exist            | readFileSync throws ENOENT            | Error: ENOENT: no such file or directory
                            | File not readable (permission) | readFileSync throws EACCES            | Error: EACCES: permission denied
                            | None of code/local-file/entry  | Existing behavior (API returns error) | API error (unchanged)
```

No critical gaps. All error paths produce actionable messages. File system
errors from `readFileSync` propagate naturally as plain `Error` (not
`CliUsageError`, since the file path was valid input — the file just
doesn't exist).

## 5. Testability Design & Test Plan

### Testability design

- **Module boundaries:** `dispatch()` is already exported and tested.
  The new logic is 10-15 lines inside the `'run'` case. Tests call
  `dispatch()` directly with mock client.
- **Isolation:** Mock `fs.readFileSync` via `vi.mock('fs')` to avoid
  real filesystem I/O in tests.
- **Dependencies:** Same `makeClient()` pattern as existing tests.
  `fs.readFileSync` is the only new dependency to mock.
- **Side-effect boundaries:** `readFileSync` is the only side effect.
  The API call is already mocked via `client.run.execute`.

### Code path coverage

```
[+] src/cli/index.ts — dispatch() 'run' case
    |
    +-- --local-file happy path
    |   +-- [PLAN] reads file, passes contents as code    -- cli.test.ts
    |   +-- [PLAN] works with --args                      -- cli.test.ts
    |   +-- [PLAN] works with --working-dir               -- cli.test.ts
    |
    +-- --local-file + --code conflict
    |   +-- [PLAN] throws CliUsageError                   -- cli.test.ts
    |
    +-- --local-file + --entry-path conflict
    |   +-- [PLAN] throws CliUsageError                   -- cli.test.ts
    |
    +-- --local-file file not found
    |   +-- [PLAN] readFileSync ENOENT propagates         -- cli.test.ts
    |
    +-- --code (unchanged)
    |   +-- [EXISTING] dispatches run with --code         -- cli.test.ts
    |
    +-- help text
        +-- [PLAN] --help includes --local-file           -- cli.test.ts
```

Zero gaps.

### Unit tests

| Test case                            | Input                                                      | Expected behavior                                                                          |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Dispatches run with --local-file     | `['run', '--local-file', './script.js']`                   | `readFileSync('./script.js', 'utf-8')` called; `execute({code: '<file contents>'})` called |
| --local-file with --args             | `['run', '--local-file', './s.js', '--args', '{"x":1}']`   | `execute({code: '...', args: {x:1}})`                                                      |
| --local-file with --working-dir      | `['run', '--local-file', './s.js', '--working-dir', '/d']` | `execute({code: '...', working_dir: '/d'})`                                                |
| --code + --local-file conflict       | `['run', '--code', '1+1', '--local-file', './s.js']`       | Throws `CliUsageError` with `command === 'run'`                                            |
| --local-file + --entry-path conflict | `['run', '--local-file', './s.js', '--entry-path', '~/f']` | Throws `CliUsageError` with `command === 'run'`                                            |
| --local-file file not found          | `['run', '--local-file', './missing.js']`                  | Throws error (ENOENT from readFileSync)                                                    |
| Help text includes --local-file      | `['run', '--help']`                                        | Help text contains `--local-file`                                                          |

### E2E tests

**E2E Required: no** — single-service CLI change, no cross-service calls,
no API changes. The mock-based unit tests fully cover the new code paths.

## 6. Human Interaction

### Initial thoughts

User referenced GitHub issue alva-ai/toolkit-ts#16. Issue suggests three
options: `--code-file`, `--code-stdin`, `--code-base64`. User chose to
implement only the file-based option.

### Iteration feedback

- User initially agreed with `--code-file` naming
- User pointed out `--entry-path` and `--code-file` are confusingly similar
  (both are "give me a file path to run")
- User noted that `--entry-path` already solves the escaping problem (via
  upload + remote execution), so the value of this feature is convenience
  (one step vs two)
- User asked about fixing `--code` directly — confirmed that shell escaping
  is irreversible (information lost before CLI receives the argument)
- User asked about using backtick quoting — confirmed backticks are command
  substitution in bash, not string delimiters
- User decided on `--local-file` naming to clearly distinguish from
  `--entry-path`

## 7. Outcome

### Changes made

**Source code:**

- `src/cli/index.ts` — (1) Added `--local-file <path>` to `COMMAND_HELP.run`
  help text with usage notes and example; (2) Updated "at least one of"
  line to include `--local-file` and noted all three options are mutually
  exclusive; (3) In `dispatch()` `'run'` case: added unified mutual
  exclusion check for `--code`/`--local-file`/`--entry-path` using a
  filter-based approach; (4) Added `readFileSync(path, 'utf-8')` to read
  local file contents into the `code` field

**Test code:**

- `test/cli.test.ts` — Added `vi.mock('fs')` with `importOriginal`
  pattern; 7 new test cases

### Tests added

| Test case                                                                 | Verifies                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------ |
| dispatches run with --local-file                                          | Happy path: readFileSync called, contents sent as code |
| dispatches run with --local-file and --args                               | Combines with --args correctly                         |
| throws CliUsageError when --code and --local-file are both provided       | Mutual exclusion                                       |
| throws CliUsageError when --local-file and --entry-path are both provided | Mutual exclusion                                       |
| throws CliUsageError when --code and --entry-path are both provided       | Mutual exclusion (new, not in original plan)           |
| throws Error when --local-file points to non-existent file                | ENOENT propagation                                     |
| help text includes --local-file                                           | Help text updated                                      |

**Coverage cross-reference against plan:**

- [DONE] reads file, passes contents as code
- [DONE] works with --args
- [SKIPPED] works with --working-dir — `--working-dir` is an independent
  passthrough flag already tested; adding a combined test adds no coverage
- [DONE] --code + --local-file conflict
- [DONE] --local-file + --entry-path conflict
- [DONE+] --code + --entry-path conflict (added beyond plan)
- [DONE] readFileSync ENOENT propagates
- [DONE] --help includes --local-file

### Migration

N/A — no database changes.

## 8. Remaining Tasks

None. All planned functionality implemented and tested.
