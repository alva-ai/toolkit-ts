# Task List: CLI Error Help Text

## Task 1: Add CliUsageError class

**Complexity:** simple
**Dependencies:** none

**Files:** `src/error.ts`

**What to do:** Add `CliUsageError` class alongside existing `AlvaError`.
The class extends `Error`, has a `command?: string` field that maps to
`COMMAND_HELP` keys. Export it.

**Steps:**
- [ ] Write test: `CliUsageError` sets name, message, command correctly;
      command can be undefined
- [ ] Run test, verify fail: `npx vitest run`
- [ ] Implement `CliUsageError` in `src/error.ts`
- [ ] Run test, verify pass: `npx vitest run`
- [ ] Run lint: `npx eslint .`

## Task 2: Update requireFlag and requireNumericFlag

**Complexity:** simple
**Dependencies:** Task 1

**Files:** `src/cli/index.ts`, `test/cli.test.ts`

**What to do:** Change `requireFlag()` and `requireNumericFlag()` to throw
`CliUsageError` instead of `Error`. Extract the group name from the
`command` parameter using `command.split(' ')[0]`.

**Steps:**
- [ ] Write tests: `dispatch(client, ['fs', 'read'])` (missing --path)
      rejects with `CliUsageError` where `command === 'fs'`;
      `dispatch(client, ['deploy', 'get', '--id', 'abc'])` rejects with
      `CliUsageError` where `command === 'deploy'`
- [ ] Run test, verify fail: `npx vitest run`
- [ ] Update `requireFlag()` and `requireNumericFlag()` to import and
      throw `CliUsageError`
- [ ] Run test, verify pass: `npx vitest run`
- [ ] Run lint: `npx eslint .`

## Task 3: Update all dispatch throw sites

**Complexity:** normal
**Dependencies:** Task 1

**Files:** `src/cli/index.ts`, `test/cli.test.ts`

**What to do:** Change all remaining `throw new Error(...)` in `dispatch()`
to `throw new CliUsageError(...)`. Three categories:

1. **Missing subcommand** (8 sites: user, fs, deploy, release, secrets,
   sdk, comments, trading): `'Missing subcommand for X'` ->
   `new CliUsageError('Missing subcommand for X', 'X')`
2. **Unknown subcommand** (9 sites: user, fs, deploy, release, secrets,
   sdk, comments, trading, auth): `'Unknown subcommand: X Y'` ->
   `new CliUsageError('Unknown subcommand: X Y', 'X')`
3. **Unknown top-level command** (1 site): ->
   `new CliUsageError(msg)` (no command, triggers global help)

Also update `handleConfigure()` error (line 537) to throw
`CliUsageError('--api-key is required...', 'configure')`.

**Steps:**
- [ ] Write tests:
      - `dispatch(client, ['fs'])` -> CliUsageError, command='fs'
      - `dispatch(client, ['deploy'])` -> CliUsageError, command='deploy'
      - `dispatch(client, ['fs', 'foo'])` -> CliUsageError, command='fs'
      - `dispatch(client, ['foo'])` -> CliUsageError, command=undefined
      - `dispatch(client, ['secrets'])` -> CliUsageError, command='secrets'
      - `dispatch(client, ['trading'])` -> CliUsageError, command='trading'
      - `dispatch(client, ['auth', 'foo'])` -> CliUsageError, command='auth'
      - `handleConfigure(['configure'])` -> CliUsageError, command='configure'
- [ ] Run test, verify fail: `npx vitest run`
- [ ] Update all throw sites in dispatch() and handleConfigure()
- [ ] Run test, verify pass: `npx vitest run`
- [ ] Run lint: `npx eslint .`

## Task 4: Update main() catch block

**Complexity:** simple
**Dependencies:** Task 2, Task 3

**Files:** `src/cli/index.ts`

**What to do:** Update `main()` catch block to:
1. `CliUsageError` -> human-readable `Error: <msg>\n\n<help>` to stderr
2. `AlvaError` -> unchanged JSON format
3. Other `Error` -> human-readable `Error: <msg>` (no help)

No unit test for main() — it's the integration boundary. Verify by running
the CLI manually.

**Steps:**
- [ ] Update catch block per the design in section 4
- [ ] Run all tests to verify no regressions: `npx vitest run`
- [ ] Run lint: `npx eslint .`
- [ ] Manual verification: run `npx tsx src/cli/index.ts fs` and confirm
      stderr shows error + help text

## Dependency graph

```
Task 1 (CliUsageError class) ──┬── Task 2 (requireFlag/requireNumericFlag)──┐
                               │                                            ├── Task 4 (main catch)
                               └── Task 3 (dispatch throw sites) ───────────┘
```

Tasks 2 and 3 can run in parallel after Task 1.
Task 4 depends on both 2 and 3.
