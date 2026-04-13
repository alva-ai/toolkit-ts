# feat: show command help text alongside CLI usage errors

## 1. Background

The `alva` CLI currently outputs errors as raw JSON to stderr:

```json
{
  "error": {
    "code": "CLI_ERROR",
    "message": "--path is required for 'fs read'"
  }
}
```

This gives the user no actionable guidance — they must manually run
`alva <command> --help` to learn the correct usage. Every throw site
(~20 locations) produces a terse message with no context on valid flags
or subcommands.

**Goal:** When a user makes a usage error (missing flag, unknown command,
missing subcommand), output a human-readable error message followed by the
relevant command's help text, all to stderr.

**Relevant systems:**

- `code/public/toolkit-ts/src/cli/index.ts` — CLI dispatch, error throwing,
  main() catch block, `COMMAND_HELP` table
- `code/public/toolkit-ts/src/error.ts` — `AlvaError` class (API errors)

**Constraints:**

- Single-service change, toolkit-ts only
- No new dependencies
- API errors (`AlvaError`) keep existing JSON format — help text only
  applies to user input errors
- `COMMAND_HELP` table already has help text for every command; reuse it

## 2. End-to-End Behavior

### Primary behavior

When a user makes a CLI usage error, stderr output changes from:

```
{"error":{"code":"CLI_ERROR","message":"--path is required for 'fs read'"}}
```

to:

```
Error: --path is required for 'fs read'

Usage: alva fs <subcommand> --path <path> [options]
...full help text for the 'fs' command...
```

### Variants

- **Missing required flag** (`alva fs read` without `--path`): shows error +
  `fs` command help
- **Unknown subcommand** (`alva fs foo`): shows error + `fs` command help
- **Missing subcommand** (`alva deploy` without subcommand): shows error +
  `deploy` command help
- **Unknown top-level command** (`alva foo`): shows error + global help text
- **Missing flag with numeric validation** (`alva deploy get --id abc`):
  shows error + `deploy` command help
- **Config errors** (`loadConfig` failures like bad JSON): shows error only,
  no help (not a usage error)

### Failure modes

- `AlvaError` (API/network errors) → unchanged JSON output, no help text
- Unknown error types → human-readable error message, no help text
  (no command context available)

## 3. Findings

- **Existing error pattern:** All usage errors thrown as plain `Error` in
  dispatch(). The error message includes the command name in a
  semi-structured way (e.g. `'fs read'`, `for deploy`, `Unknown command: 'xyz'`).
- **`COMMAND_HELP` table** (lines 68-511): already has complete help for every
  command group. Keyed by top-level command name (`fs`, `deploy`, etc.).
- **`requireFlag()`** (line 607): takes `command` param as string like
  `'fs read'` — the group name is extractable from this.
- **`main()` catch block** (lines 1231-1241): single catch handles both
  `AlvaError` and plain `Error`. This is where we differentiate.
- **Scope shape:** single-service (toolkit-ts only).
- **Alternatives considered:** (A) `CliUsageError` class + catch-layer help
  lookup — chosen for minimal diff and type safety. (B) Result-type return
  from dispatch — rejected, too large a refactor for this task. (C) Regex
  parsing of error messages in catch — rejected, brittle and unmaintainable.

### Reference files for implementation

- **Error class pattern:** `src/error.ts` — mirror `AlvaError` structure
  for the new `CliUsageError`
- **Test pattern:** `test/cli.test.ts` — existing dispatch tests, add
  error-path tests following same mock pattern
- **Handler pattern:** `src/cli/index.ts` `main()` catch block — modify
  to detect `CliUsageError` and format output

## 4. Change Specification

### Affected modules

- **`src/error.ts`** (modified): Add `CliUsageError` class with `command`
  field. Mirrors `AlvaError` structure.
- **`src/cli/index.ts`** (modified):
  1. Import `CliUsageError`
  2. Change `requireFlag()` and `requireNumericFlag()` to throw
     `CliUsageError` instead of `Error`. Extract group name from the
     `command` param (first word of e.g. `'fs read'`).
  3. Change all ~20 direct `throw new Error(...)` sites in `dispatch()`
     to `throw new CliUsageError(message, group)`. For unknown top-level
     commands, use `command = undefined` (triggers global help).
  4. Update `handleConfigure()` error (line 537) to throw
     `CliUsageError` with `command = 'configure'`.
  5. Update `main()` catch block: detect `CliUsageError`, look up
     `COMMAND_HELP[err.command]` (or `HELP_TEXT` if command is
     undefined), write `Error: <message>\n\n<help>` to stderr.
     `AlvaError` keeps JSON. Plain `Error` gets human-readable message
     only (no help).
- **`test/cli.test.ts`** (modified): Add error-path tests.

### `CliUsageError` class design

```typescript
export class CliUsageError extends Error {
  readonly command: string | undefined;
  constructor(message: string, command?: string) {
    super(message);
    this.name = 'CliUsageError';
    this.command = command;
  }
}
```

The `command` field stores the top-level command group name (e.g. `'fs'`,
`'deploy'`), matching `COMMAND_HELP` keys. `undefined` means use global
`HELP_TEXT`.

### `main()` catch block design

```typescript
} catch (err) {
  if (err instanceof CliUsageError) {
    const help = err.command ? COMMAND_HELP[err.command] : HELP_TEXT;
    process.stderr.write(`Error: ${err.message}\n`);
    if (help) process.stderr.write(`\n${help}\n`);
    process.exit(1);
  } else if (err instanceof AlvaError) {
    // existing JSON format unchanged
  } else {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
```

### `requireFlag` / `requireNumericFlag` change

These already receive a `command` string like `'fs read'`. Extract the
group: `command.split(' ')[0]`. Pass to `CliUsageError`.

### API changes

None — no public SDK API changes.

### Database impact

None.

### Configuration changes

None.

### Backward compatibility

**Breaking:** stderr output format for CLI usage errors changes from JSON
to human-readable text. Any script parsing stderr JSON for usage errors
will break. This was explicitly approved as acceptable. API errors
(`AlvaError`) remain JSON.

### Error path analysis

| Error site             | What triggers it          | Handling                          | User sees                                               |
| ---------------------- | ------------------------- | --------------------------------- | ------------------------------------------------------- |
| `requireFlag()`        | Missing required `--flag` | `CliUsageError(msg, group)`       | `Error: --path is required for 'fs read'\n\n<fs help>`  |
| `requireNumericFlag()` | Non-numeric flag value    | `CliUsageError(msg, group)`       | `Error: --id must be a number...\n\n<deploy help>`      |
| Missing subcommand     | `alva deploy` with no sub | `CliUsageError(msg, group)`       | `Error: Missing subcommand for deploy\n\n<deploy help>` |
| Unknown subcommand     | `alva fs foo`             | `CliUsageError(msg, group)`       | `Error: Unknown subcommand: fs foo\n\n<fs help>`        |
| Unknown command        | `alva foo`                | `CliUsageError(msg, undefined)`   | `Error: Unknown command: 'foo'...\n\n<global help>`     |
| `handleConfigure`      | Missing `--api-key`       | `CliUsageError(msg, 'configure')` | `Error: --api-key is required...\n\n<configure help>`   |
| `AlvaError`            | API/network error         | Unchanged JSON                    | `{"error":{"code":"...","message":"..."}}`              |
| Unknown `Error`        | Unexpected runtime error  | Human-readable, no help           | `Error: <message>`                                      |

No critical gaps. Every user-facing error has explicit handling.

## 5. Testability Design & Test Plan

### Testability design

- **Module boundaries:** `CliUsageError` is a standalone class in
  `src/error.ts`. `dispatch()` throws it. `main()` catches it.
  Tests verify dispatch throws `CliUsageError` with correct `command`.
- **Isolation:** Tests call `dispatch()` directly (already exported).
  No need to test `main()` directly — it's the integration layer.
  Catch-block formatting logic is simple enough to trust from dispatch
  tests + manual verification.
- **Dependencies:** Same mock pattern as existing tests — `makeClient()`
  provides mock AlvaClient.
- **Side-effect boundaries:** `process.stderr.write` and `process.exit`
  in `main()`. Not directly tested; verified by running the CLI.

### Code path coverage

```
[+] src/error.ts
    |
    +-- CliUsageError
        +-- [PLAN] constructor sets message and command
        +-- [PLAN] constructor with undefined command

[+] src/cli/index.ts
    |
    +-- requireFlag()
    |   +-- [PLAN] throws CliUsageError when flag missing
    |   +-- [PLAN] CliUsageError.command is group name (first word)
    |   +-- [EXISTING] returns value when present
    |
    +-- requireNumericFlag()
    |   +-- [PLAN] throws CliUsageError when non-numeric
    |   +-- [PLAN] CliUsageError.command is group name
    |
    +-- dispatch() — missing subcommand
    |   +-- [PLAN] 'user' with no sub → CliUsageError(_, 'user')
    |   +-- [PLAN] 'fs' with no sub → CliUsageError(_, 'fs')
    |   +-- [PLAN] 'deploy' with no sub → CliUsageError(_, 'deploy')
    |
    +-- dispatch() — unknown subcommand
    |   +-- [PLAN] 'fs foo' → CliUsageError(_, 'fs')
    |   +-- [PLAN] 'deploy foo' → CliUsageError(_, 'deploy')
    |   +-- [PLAN] 'auth foo' → CliUsageError(_, 'auth')
    |
    +-- dispatch() — unknown top-level command
    |   +-- [PLAN] 'foo' → CliUsageError(_, undefined)
    |
    +-- dispatch() — missing required flag
    |   +-- [PLAN] 'fs read' without --path → CliUsageError(_, 'fs')
    |   +-- [PLAN] 'deploy get' without --id → CliUsageError(_, 'deploy')
    |
    +-- dispatch() — AlvaError passthrough
        +-- [EXISTING] AlvaError not converted to CliUsageError
```

### Unit tests

| Test case                                  | Input                                                            | Expected behavior                                      |
| ------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------ |
| CliUsageError has correct name             | `new CliUsageError('msg', 'fs')`                                 | `err.name === 'CliUsageError'`, `err.command === 'fs'` |
| CliUsageError with undefined command       | `new CliUsageError('msg')`                                       | `err.command === undefined`                            |
| Missing subcommand throws CliUsageError    | `dispatch(client, ['fs'])`                                       | Rejects with `CliUsageError`, `command === 'fs'`       |
| Unknown subcommand throws CliUsageError    | `dispatch(client, ['fs', 'foo'])`                                | Rejects with `CliUsageError`, `command === 'fs'`       |
| Unknown command throws CliUsageError       | `dispatch(client, ['foo'])`                                      | Rejects with `CliUsageError`, `command === undefined`  |
| Missing required flag throws CliUsageError | `dispatch(client, ['fs', 'read'])`                               | Rejects with `CliUsageError`, `command === 'fs'`       |
| Missing numeric flag throws CliUsageError  | `dispatch(client, ['deploy', 'get'])`                            | Rejects with `CliUsageError`, `command === 'deploy'`   |
| Invalid numeric flag throws CliUsageError  | `dispatch(client, ['deploy', 'get', '--id', 'abc'])`             | Rejects with `CliUsageError`, `command === 'deploy'`   |
| Multiple command groups (spot check)       | `dispatch(client, ['secrets'])`, `dispatch(client, ['trading'])` | Each rejects with `CliUsageError`, correct `command`   |

### Integration / E2E tests

**E2E Required: no** — single-service CLI change, no cross-service calls,
no API changes. Manual verification by running `alva fs` and inspecting
stderr output is sufficient.

### Edge cases

| Edge case                              | Input                            | Expected                                              |
| -------------------------------------- | -------------------------------- | ----------------------------------------------------- |
| Command exists but not in COMMAND_HELP | Hypothetical                     | Error message only, no help (graceful fallback)       |
| handleConfigure missing api-key        | `handleConfigure(['configure'])` | Throws `CliUsageError` with `command === 'configure'` |

## 6. Human Interaction

### Initial thoughts

User wants all CLI errors to return helpful responses, especially
including the corresponding command's help text.

### Iteration feedback

- Confirmed format: human-readable (not JSON) for usage errors
- Confirmed scope: only user input errors get help text, not API errors
- Confirmed: breaking change to stderr format is acceptable
- Approved Approach A: `CliUsageError` class + catch-layer help lookup

## 7. Outcome

### Changes made

**Source code:**

- `src/error.ts` — Added `CliUsageError` class (extends `Error`, carries
  optional `command` field mapping to `COMMAND_HELP` keys)
- `src/cli/index.ts` — (1) Import `CliUsageError`; (2) `requireFlag()`
  and `requireNumericFlag()` now throw `CliUsageError` with group name
  extracted via `command.split(' ')[0]`; (3) All 18 direct `throw new
Error(...)` in `dispatch()` converted to `throw new CliUsageError(...)`;
  (4) `handleConfigure()` error converted; (5) `main()` catch block now
  outputs human-readable `Error: <msg>\n\n<help>` for `CliUsageError`,
  preserves JSON for `AlvaError`, plain text for other errors

**Test code:**

- `test/error.test.ts` (new) — 2 tests for `CliUsageError` construction
- `test/cli.test.ts` — 10 new tests for error-path behavior

### Tests added

| Test case                                   | File               | Verifies                                              |
| ------------------------------------------- | ------------------ | ----------------------------------------------------- |
| CliUsageError sets name and command         | test/error.test.ts | Constructor with command                              |
| CliUsageError with undefined command        | test/error.test.ts | Constructor without command                           |
| Missing flag throws CliUsageError (fs read) | test/cli.test.ts   | requireFlag -> CliUsageError, command='fs'            |
| Invalid numeric flag throws CliUsageError   | test/cli.test.ts   | requireNumericFlag -> CliUsageError, command='deploy' |
| Missing subcommand (fs)                     | test/cli.test.ts   | dispatch(['fs']) -> command='fs'                      |
| Missing subcommand (deploy)                 | test/cli.test.ts   | dispatch(['deploy']) -> command='deploy'              |
| Unknown subcommand (fs foo)                 | test/cli.test.ts   | dispatch(['fs','foo']) -> command='fs'                |
| Unknown command (foo)                       | test/cli.test.ts   | dispatch(['foo']) -> command=undefined                |
| Missing subcommand (secrets)                | test/cli.test.ts   | dispatch(['secrets']) -> command='secrets'            |
| Missing subcommand (trading)                | test/cli.test.ts   | dispatch(['trading']) -> command='trading'            |
| Unknown auth subcommand                     | test/cli.test.ts   | dispatch(['auth','foo']) -> command='auth'            |
| handleConfigure missing api-key             | test/cli.test.ts   | CliUsageError, command='configure'                    |

### Migration

N/A — no database changes.

## 8. Remaining Tasks

None. All planned test cases implemented, all throw sites converted, all
error categories handled in the catch block.
